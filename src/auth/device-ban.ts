/**
 * Device-Level Ban System
 *
 * The problem: banning a Telegram account is useless. The attacker
 * buys a $5 SIM, creates a new Telegram account, and re-registers.
 * Phone numbers are cheap. New accounts are free.
 *
 * The solution: ban the DEVICE, not the account.
 *
 * How we identify a device (multiple signals, layered):
 *
 *   STRONGEST — Hardware-bound key (Secure Enclave / StrongBox)
 *     The app generates a key inside the phone's secure hardware on
 *     first install. This key CANNOT be exported, copied, or reset
 *     without a factory reset. Even a new SIM / new Telegram account
 *     on the same phone produces the same hardware key.
 *
 *   STRONG — Device fingerprint (composite hash)
 *     Hash of: device model + screen resolution + OS version + timezone +
 *     language + installed fonts. Changes only if the user gets a new phone.
 *
 *   MEDIUM — IP address hash
 *     Not reliable alone (VPNs, shared IPs) but useful for correlation.
 *     If the same IP registers 5 accounts, that's suspicious.
 *
 *   WEAK (web only) — Canvas/WebGL fingerprint
 *     Browser rendering produces unique hashes. Easy to spoof but
 *     catches lazy re-registrations.
 *
 * The ban check runs BEFORE account creation. If any strong signal
 * matches a banned device, registration is blocked — even with a
 * brand new Telegram account.
 *
 * To evade this, an attacker would need to:
 *   1. Buy a new physical phone, AND
 *   2. Use a different network/VPN, AND
 *   3. Create a new Telegram account
 *
 * That's expensive and slow — which is the point.
 */

import { createHash } from 'crypto';
import { query } from '../db';

export interface DeviceSignals {
  platform: string;       // ios, android, web
  model?: string;         // "iPhone 15 Pro", "Pixel 8"
  osVersion?: string;     // "iOS 17.3", "Android 14"
  appVersion: string;     // bchat app version
  hardwareId?: string;    // Secure Enclave / StrongBox key (strongest signal)
  screenRes?: string;     // "1170x2532"
  timezone?: string;      // "America/New_York"
  language?: string;      // "en-US"
  canvasHash?: string;    // browser canvas fingerprint
  webglHash?: string;     // WebGL renderer fingerprint
}

export interface BanCheck {
  banned: boolean;
  reason?: string;
  matchType?: 'hardware' | 'fingerprint' | 'ip' | 'multi_signal';
  originalBanReason?: string;
}

export interface SybilCheck {
  suspicious: boolean;
  reason?: string;
  matchedAccounts: number;
  signals: string[];
}

/**
 * Hash an IP address for privacy-preserving storage.
 * We never store raw IPs — just enough to detect re-registration.
 */
export function hashIP(ip: string): string {
  // Use a consistent salt so the same IP always produces the same hash
  const salt = process.env.IP_HASH_SALT || 'bchat-ip-salt';
  return createHash('sha256').update(salt + ip).digest('hex');
}

/**
 * Create a composite device fingerprint from all available signals.
 */
export function createCompositeFingerprint(signals: DeviceSignals): string {
  const components = [
    signals.platform,
    signals.model || '',
    signals.osVersion || '',
    signals.screenRes || '',
    signals.timezone || '',
    signals.language || '',
  ].join('|');

  return createHash('sha256').update(components).digest('hex');
}

/**
 * Check if a device is banned BEFORE allowing registration.
 * This is the gate that stops new-Telegram-account evasion.
 */
export async function checkDeviceBan(
  signals: DeviceSignals,
  ipAddress?: string
): Promise<BanCheck> {
  // Check 1: Hardware ID (strongest — can't fake without new phone)
  if (signals.hardwareId) {
    const hwBan = await query(
      `SELECT reason FROM device_bans
       WHERE hardware_id = $1 AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [signals.hardwareId]
    );
    if (hwBan.rows.length > 0) {
      return {
        banned: true,
        reason: 'This device has been banned.',
        matchType: 'hardware',
        originalBanReason: hwBan.rows[0].reason,
      };
    }
  }

  // Check 2: Composite fingerprint
  const fingerprint = createCompositeFingerprint(signals);
  const fpBan = await query(
    `SELECT reason FROM device_bans
     WHERE fingerprint = $1 AND is_active = TRUE
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [fingerprint]
  );
  if (fpBan.rows.length > 0) {
    return {
      banned: true,
      reason: 'This device has been banned.',
      matchType: 'fingerprint',
      originalBanReason: fpBan.rows[0].reason,
    };
  }

  // Check 3: IP correlation (softer — flag but don't always block)
  if (ipAddress) {
    const ipH = hashIP(ipAddress);
    const ipBan = await query(
      `SELECT reason FROM device_bans
       WHERE ip_hash = $1 AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [ipH]
    );
    if (ipBan.rows.length > 0) {
      // IP bans are weaker — check if hardware also matches any known signals
      // If only IP matches, it could be shared network, so just flag it
      return {
        banned: true,
        reason: 'Registration from this network has been restricted.',
        matchType: 'ip',
        originalBanReason: ipBan.rows[0].reason,
      };
    }
  }

  return { banned: false };
}

/**
 * Ban a device. Called when an admin bans a user.
 * Bans the hardware, not just the account — so they can't come back
 * with a new Telegram ID on the same phone.
 */
export async function banDevice(
  userId: string,
  bannedByAdminId: string,
  reason: string,
  durationDays?: number
): Promise<void> {
  // Get all device signals for this user
  const signals = await query(
    'SELECT fingerprint, hardware_id, ip_hash FROM registration_signals WHERE user_id = $1',
    [userId]
  );

  // Also get their current device bindings
  const devices = await query(
    'SELECT fingerprint FROM devices WHERE user_id = $1',
    [userId]
  );

  const expiresAt = durationDays
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Ban every known fingerprint/hardware ID for this user
  for (const signal of signals.rows) {
    await query(
      `INSERT INTO device_bans (fingerprint, hardware_id, ip_hash, banned_user_id, banned_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [signal.fingerprint, signal.hardware_id, signal.ip_hash, userId, bannedByAdminId, reason, expiresAt]
    );
  }

  // Also ban device fingerprints from the devices table
  for (const device of devices.rows) {
    await query(
      `INSERT INTO device_bans (fingerprint, banned_user_id, banned_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [device.fingerprint, userId, bannedByAdminId, reason, expiresAt]
    );
  }

  // Deactivate the user account
  await query('UPDATE users SET is_active = FALSE WHERE id = $1', [userId]);

  // Audit
  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [bannedByAdminId, 'device_ban', JSON.stringify({
      bannedUserId: userId,
      reason,
      signalCount: signals.rows.length + devices.rows.length,
      durationDays: durationDays || 'permanent',
    })]
  );
}

/**
 * Record device signals at registration time.
 * Stored for future ban matching — even if this user is fine now,
 * if they get banned later, we need these signals to block re-registration.
 */
export async function recordRegistrationSignals(
  userId: string,
  signals: DeviceSignals,
  ipAddress?: string
): Promise<void> {
  const fingerprint = createCompositeFingerprint(signals);
  const ipH = ipAddress ? hashIP(ipAddress) : null;

  await query(
    `INSERT INTO registration_signals
     (user_id, fingerprint, hardware_id, screen_res, timezone, language, ip_hash, canvas_hash, webgl_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId,
      fingerprint,
      signals.hardwareId || null,
      signals.screenRes || null,
      signals.timezone || null,
      signals.language || null,
      ipH,
      signals.canvasHash || null,
      signals.webglHash || null,
    ]
  );
}

/**
 * Sybil detection: check if device signals match existing accounts.
 * Catches someone registering multiple accounts from the same device.
 * This runs at registration and flags suspicious patterns.
 */
export async function checkSybil(
  signals: DeviceSignals,
  ipAddress?: string,
  excludeUserId?: string
): Promise<SybilCheck> {
  const matches: string[] = [];
  let matchedAccounts = 0;

  // Check hardware ID (strongest signal)
  if (signals.hardwareId) {
    const hwMatch = await query(
      `SELECT DISTINCT user_id FROM registration_signals
       WHERE hardware_id = $1 ${excludeUserId ? 'AND user_id != $2' : ''}`,
      excludeUserId ? [signals.hardwareId, excludeUserId] : [signals.hardwareId]
    );
    if (hwMatch.rows.length > 0) {
      matches.push(`hardware_id matches ${hwMatch.rows.length} existing account(s)`);
      matchedAccounts = Math.max(matchedAccounts, hwMatch.rows.length);
    }
  }

  // Check composite fingerprint
  const fingerprint = createCompositeFingerprint(signals);
  const fpMatch = await query(
    `SELECT DISTINCT user_id FROM registration_signals
     WHERE fingerprint = $1 ${excludeUserId ? 'AND user_id != $2' : ''}`,
    excludeUserId ? [fingerprint, excludeUserId] : [fingerprint]
  );
  if (fpMatch.rows.length > 0) {
    matches.push(`device fingerprint matches ${fpMatch.rows.length} existing account(s)`);
    matchedAccounts = Math.max(matchedAccounts, fpMatch.rows.length);
  }

  // Check IP (weaker — could be shared WiFi)
  if (ipAddress) {
    const ipH = hashIP(ipAddress);
    const ipMatch = await query(
      `SELECT DISTINCT user_id FROM registration_signals
       WHERE ip_hash = $1 ${excludeUserId ? 'AND user_id != $2' : ''}`,
      excludeUserId ? [ipH, excludeUserId] : [ipH]
    );
    if (ipMatch.rows.length >= 3) { // Only flag if 3+ accounts from same IP
      matches.push(`IP matches ${ipMatch.rows.length} existing account(s)`);
      matchedAccounts = Math.max(matchedAccounts, ipMatch.rows.length);
    }
  }

  return {
    suspicious: matches.length > 0,
    reason: matches.length > 0
      ? `Possible duplicate account: ${matches.join('; ')}`
      : undefined,
    matchedAccounts,
    signals: matches,
  };
}
