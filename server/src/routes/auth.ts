/**
 * Authentication API Routes
 *
 * POST /api/auth/telegram         — Verify Telegram user + link account
 * POST /api/auth/challenge        — Request a challenge for identity verification
 * POST /api/auth/challenge/verify — Verify a signed challenge
 */

import { Router, Request, Response } from 'express';
import {
  generateToken,
  verifyToken,
  extractBearerToken,
  generateIdentityKeyPair,
  ChallengeStore,
  verifySignedChallenge,
} from '../crypto/identity';
import { generateDeviceId, createDeviceFingerprint } from '../crypto/device';
import { checkNameImpersonation } from '../crypto/homoglyph';
import { getJoinEvent } from '../bot';
import { query } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const challengeStore = new ChallengeStore(query);

/**
 * POST /api/auth/telegram
 * Match against bot join events, create/login user.
 */
router.post('/telegram', async (req: Request, res: Response) => {
  try {
    const { telegramUser, deviceInfo, inviteCode } = req.body;
    if (!telegramUser?.id) {
      return res.status(400).json({ error: 'Missing telegramUser' });
    }

    // Check join record
    const joinEvent = await getJoinEvent(telegramUser.id);
    if (!joinEvent) {
      return res.status(403).json({
        error: 'No join record found. You must join via the official Telegram channel first.',
      });
    }

    // Check if user already exists
    const existing = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramUser.id]
    );

    let userId: string;
    let isNewUser = false;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;

      if (!existing.rows[0].is_active) {
        return res.status(403).json({ error: 'This account has been suspended.' });
      }

      await query(
        'UPDATE users SET telegram_username = $1, updated_at = NOW() WHERE id = $2',
        [telegramUser.username, userId]
      );
    } else {
      // Check display name impersonation
      const nameCheck = await checkNameImpersonation(telegramUser.first_name);
      if (nameCheck.impersonating && nameCheck.targetAdmin) {
        return res.status(403).json({
          error: `Display name "${telegramUser.first_name}" is too similar to ${nameCheck.targetAdmin.role} "${nameCheck.targetAdmin.name}". Change your Telegram display name and try again.`,
        });
      }

      // Create new user with ed25519 identity keypair
      const identityKey = await generateIdentityKeyPair();
      userId = uuidv4();
      isNewUser = true;

      await query(
        `INSERT INTO users (id, telegram_id, telegram_username, first_name, last_name, identity_pubkey)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          telegramUser.id,
          telegramUser.username,
          telegramUser.first_name,
          telegramUser.last_name,
          identityKey.publicKey,
        ]
      );

      // Record invite usage
      if (inviteCode) {
        const invite = await query(
          'SELECT created_by FROM invites WHERE code = $1 AND used_by IS NULL',
          [inviteCode]
        );
        if (invite.rows[0]?.created_by) {
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
          telegramId: telegramUser.id,
          inviteCode: inviteCode || null,
        }), req.ip]
      );
    }

    // Bind device
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

    // Generate JWT
    const token = generateToken({
      userId,
      telegramId: telegramUser.id,
      deviceId,
    });

    res.json({
      token,
      userId,
      isNewUser,
      telegramUser,
    });
  } catch (err: any) {
    console.error('[Auth] Telegram verification failed:', err.message);
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
    const challenge = await challengeStore.issue(purpose || 'identity_verify');

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

    const challenge = await challengeStore.consume(challengeId);
    if (!challenge) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }

    const result = await verifySignedChallenge(challenge, signature, publicKey);
    if (!result.valid) {
      return res.status(401).json({ error: result.reason });
    }

    const user = await query(
      'SELECT identity_pubkey FROM users WHERE id = $1',
      [payload.userId]
    );

    if (user.rows[0]?.identity_pubkey !== publicKey) {
      return res.status(401).json({ error: 'Public key does not match registered identity' });
    }

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
