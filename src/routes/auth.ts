/**
 * Authentication API Routes
 *
 * POST /api/auth/telegram     — Verify Telegram initData + link account
 * POST /api/auth/totp/setup   — Set up TOTP 2FA (required on first login)
 * POST /api/auth/totp/verify  — Verify TOTP code
 * POST /api/auth/device/bind  — Bind a new device (requires TOTP)
 * POST /api/auth/challenge    — Request a challenge for identity verification
 * POST /api/auth/challenge/verify — Verify a signed challenge
 */

import { Router, Request, Response } from 'express';
import { verifyTelegramWebAppData } from '../auth/telegram';
import { generateToken, verifyToken, extractBearerToken } from '../auth/jwt';
import { generateTOTPSetup, verifyTOTP } from '../auth/totp';
import { generateDeviceId, createDeviceFingerprint } from '../auth/device';
import { ChallengeStore, verifySignedChallenge, generateIdentityKeyPair } from '../crypto/challenge';
import { getJoinEvent } from '../bot';
import { query } from '../db';
import { checkNameImpersonation } from '../admin/identity-guard';
import { checkDeviceBan, checkSybil, recordRegistrationSignals, DeviceSignals } from '../auth/device-ban';
import { recordInviteChain } from '../admin/invite-accountability';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const challengeStore = new ChallengeStore();

/**
 * POST /api/auth/telegram
 * Verify Telegram WebApp initData, match against bot join events, create/login user.
 */
router.post('/telegram', async (req: Request, res: Response) => {
  try {
    const { initData, deviceInfo, inviteCode } = req.body;
    if (!initData) {
      return res.status(400).json({ error: 'Missing initData' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: 'Bot token not configured' });
    }

    // Step 1: Verify HMAC-SHA256 signature
    const telegramData = verifyTelegramWebAppData(initData, botToken);

    // Step 2: Check DEVICE BAN before anything else.
    // This is the key defense — even with a brand new Telegram account,
    // a banned phone can't register. New SIM doesn't help.
    const signals: DeviceSignals = {
      platform: deviceInfo?.platform || 'unknown',
      model: deviceInfo?.model,
      osVersion: deviceInfo?.osVersion,
      appVersion: deviceInfo?.appVersion || '0.1.0',
      hardwareId: deviceInfo?.hardwareId,   // Secure Enclave / StrongBox key
      screenRes: deviceInfo?.screenRes,
      timezone: deviceInfo?.timezone,
      language: deviceInfo?.language,
      canvasHash: deviceInfo?.canvasHash,
      webglHash: deviceInfo?.webglHash,
    };

    const banCheck = await checkDeviceBan(signals, req.ip || undefined);
    if (banCheck.banned) {
      // Log the blocked attempt (even though we don't have a user yet)
      await query(
        `INSERT INTO audit_log (event_type, details, ip_address)
         VALUES ($1, $2, $3)`,
        ['banned_device_attempt', JSON.stringify({
          telegramId: telegramData.user.id,
          matchType: banCheck.matchType,
        }), req.ip]
      );
      return res.status(403).json({
        error: banCheck.reason || 'This device has been banned.',
      });
    }

    // Step 3: Match against bot join events
    const joinEvent = await getJoinEvent(telegramData.user.id);
    if (!joinEvent) {
      return res.status(403).json({
        error: 'No join record found. You must join via the official Telegram channel first.',
      });
    }

    // Step 4: Check if user already exists
    const existing = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramData.user.id]
    );

    let userId: string;
    let isNewUser = false;
    let sybilWarning: string | undefined;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;

      // Check if this existing account is active
      if (!existing.rows[0].is_active) {
        return res.status(403).json({ error: 'This account has been suspended.' });
      }

      // Update last login info
      await query(
        'UPDATE users SET telegram_username = $1, updated_at = NOW() WHERE id = $2',
        [telegramData.user.username, userId]
      );
    } else {
      // Step 5: Sybil detection — is this the same device with a new Telegram account?
      const sybilCheck = await checkSybil(signals, req.ip || undefined);
      if (sybilCheck.suspicious && sybilCheck.matchedAccounts >= 2) {
        // Hard block — too many accounts from this device
        return res.status(403).json({
          error: 'Multiple accounts detected from this device. Contact support if this is an error.',
        });
      } else if (sybilCheck.suspicious) {
        // Soft flag — allow but warn admins
        sybilWarning = sybilCheck.reason;
      }

      // Step 6: Check if display name impersonates an admin
      const nameCheck = await checkNameImpersonation(telegramData.user.first_name);
      if (nameCheck.impersonating && nameCheck.targetAdmin) {
        return res.status(403).json({
          error: `Display name "${telegramData.user.first_name}" is too similar to ${nameCheck.targetAdmin.role} "${nameCheck.targetAdmin.name}". Change your Telegram display name and try again.`,
        });
      }

      // Step 7: Create new user with ed25519 identity keypair
      const identityKey = await generateIdentityKeyPair();
      userId = uuidv4();
      isNewUser = true;

      await query(
        `INSERT INTO users (id, telegram_id, telegram_username, first_name, last_name, identity_pubkey)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          telegramData.user.id,
          telegramData.user.username,
          telegramData.user.first_name,
          telegramData.user.last_name,
          identityKey.publicKey,
        ]
      );

      // Step 8: Record device signals for future ban matching
      await recordRegistrationSignals(userId, signals, req.ip || undefined);

      // Step 9: Record invite chain if an invite code was provided
      if (inviteCode) {
        const invite = await query(
          'SELECT created_by FROM invites WHERE code = $1 AND used_by IS NULL',
          [inviteCode]
        );
        if (invite.rows[0]?.created_by) {
          await recordInviteChain(invite.rows[0].created_by, userId, inviteCode);
          await query(
            'UPDATE invites SET used_by = $1, used_at = NOW() WHERE code = $2',
            [userId, inviteCode]
          );
        }
      }

      // Audit
      await query(
        `INSERT INTO audit_log (user_id, event_type, details, ip_address)
         VALUES ($1, $2, $3, $4)`,
        [userId, 'user_created', JSON.stringify({
          telegramId: telegramData.user.id,
          sybilWarning: sybilWarning || null,
          inviteCode: inviteCode || null,
        }), req.ip]
      );
    }

    // Step 10: Bind device
    const deviceId = generateDeviceId();
    const fingerprint = createDeviceFingerprint(deviceInfo || {
      platform: 'unknown',
      appVersion: '0.1.0',
    });

    await query(
      `INSERT INTO devices (user_id, device_id, fingerprint, platform, trusted)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (device_id) DO UPDATE SET last_seen = NOW()`,
      [userId, deviceId, fingerprint, deviceInfo?.platform || 'unknown']
    );

    // Step 6: Generate JWT
    const token = generateToken({
      userId,
      telegramId: telegramData.user.id,
      deviceId,
    });

    // Check if TOTP is set up
    const user = await query('SELECT totp_enabled FROM users WHERE id = $1', [userId]);
    const needs2FA = !user.rows[0]?.totp_enabled;

    res.json({
      token,
      userId,
      isNewUser,
      needs2FASetup: needs2FA,
      telegramUser: telegramData.user,
    });
  } catch (err: any) {
    console.error('[Auth] Telegram verification failed:', err.message);
    res.status(401).json({ error: err.message });
  }
});

/**
 * POST /api/auth/totp/setup
 * Generate TOTP secret + QR code for 2FA enrollment.
 */
router.post('/totp/setup', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = verifyToken(token);
    const setup = await generateTOTPSetup(payload.userId);

    // Store secret (will be confirmed on first successful verify)
    await query(
      'UPDATE users SET totp_secret = $1 WHERE id = $2',
      [setup.secret, payload.userId]
    );

    res.json({
      qrCode: setup.qrCodeDataUrl,
      otpauthUrl: setup.otpauthUrl,
      // Don't send secret directly — use QR code in app
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * POST /api/auth/totp/verify
 * Verify TOTP code and enable 2FA if first time.
 */
router.post('/totp/verify', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = verifyToken(token);
    const { code } = req.body;

    const result = await query(
      'SELECT totp_secret, totp_enabled FROM users WHERE id = $1',
      [payload.userId]
    );

    if (!result.rows[0]?.totp_secret) {
      return res.status(400).json({ error: 'TOTP not set up yet' });
    }

    const valid = verifyTOTP(code, result.rows[0].totp_secret);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid TOTP code' });
    }

    // Enable TOTP on first successful verification
    if (!result.rows[0].totp_enabled) {
      await query(
        'UPDATE users SET totp_enabled = TRUE, is_verified = TRUE WHERE id = $1',
        [payload.userId]
      );
    }

    res.json({ verified: true });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * POST /api/auth/challenge
 * Issue a challenge nonce for identity verification.
 */
router.post('/challenge', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    verifyToken(token);
    const { purpose } = req.body;
    const challenge = challengeStore.issue(purpose || 'identity_verify');

    res.json({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/**
 * POST /api/auth/challenge/verify
 * Verify a signed challenge response.
 */
router.post('/challenge/verify', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = verifyToken(token);
    const { challengeId, signature, publicKey } = req.body;

    // Consume challenge (prevents replay)
    const challenge = challengeStore.consume(challengeId);
    if (!challenge) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }

    // Verify signature
    const result = await verifySignedChallenge(challenge, signature, publicKey);
    if (!result.valid) {
      return res.status(401).json({ error: result.reason });
    }

    // Verify the public key matches the user's registered identity key
    const user = await query(
      'SELECT identity_pubkey FROM users WHERE id = $1',
      [payload.userId]
    );

    if (user.rows[0]?.identity_pubkey !== publicKey) {
      return res.status(401).json({ error: 'Public key does not match registered identity' });
    }

    // Log successful verification
    await query(
      `INSERT INTO audit_log (user_id, event_type, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [payload.userId, 'challenge_verified', JSON.stringify({ purpose: challenge.purpose }), req.ip]
    );

    res.json({ verified: true, purpose: challenge.purpose });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

export default router;
