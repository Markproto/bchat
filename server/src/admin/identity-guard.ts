/**
 * Identity Guard — Prevents Profile Cloning / Admin Impersonation
 *
 * Problem: A scammer creates an account, copies an admin's display name
 * and photo, then messages a user pretending to be support. Even if the
 * challenge-response system exists, the user might trust the name/photo
 * before ever clicking "verify."
 *
 * Solution layers:
 *
 *   1. RESERVED NAMES — Admin/creator display names are reserved. Regular
 *      users cannot set their name to match or closely resemble an admin.
 *
 *   2. PUBKEY FINGERPRINT — Every user gets a unique visual fingerprint
 *      derived from their ed25519 public key. This shows next to every
 *      message and on profiles. A scammer has a different key, so their
 *      fingerprint will always look different — even if the name matches.
 *      Think of it like a visual hash — unique per person, unforgeable.
 *
 *   3. AUTOMATIC VERIFICATION — The app auto-verifies admin status when
 *      a conversation opens. No manual "verify" button needed. If the
 *      other person claims to be admin but fails auto-verify, the app
 *      shows a red warning immediately.
 *
 *   4. ACCOUNT BINDING — Each bchat account is bound to exactly one
 *      Telegram ID. You can't create a second account to impersonate.
 *
 *   5. SIMILARITY DETECTION — Catches unicode tricks like replacing
 *      'a' with 'а' (Cyrillic), adding invisible characters, etc.
 */

import { createHash } from 'crypto';
import { query } from '../db/pool';
import {
  normalizeName,
  nameSimilarity,
  checkNameImpersonation,
  generatePubkeyFingerprint,
} from '../crypto/homoglyph';

// Re-export homoglyph functions so identity-guard is the single import point
export { normalizeName, nameSimilarity, checkNameImpersonation, generatePubkeyFingerprint };

/**
 * Generate a color-based visual identifier from the public key.
 * Returns RGB values for a unique identicon background color.
 * The app renders this as a colored ring around the avatar.
 *
 * Even if a scammer copies the admin's photo, the ring color will
 * be different because it's derived from their own (different) key.
 */
export function generateIdentityColor(publicKeyHex: string): { primary: string; secondary: string } {
  const hash = createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest();

  // Use bytes 6-11 for two colors
  const r1 = hash[6], g1 = hash[7], b1 = hash[8];
  const r2 = hash[9], g2 = hash[10], b2 = hash[11];

  return {
    primary: `#${r1.toString(16).padStart(2, '0')}${g1.toString(16).padStart(2, '0')}${b1.toString(16).padStart(2, '0')}`,
    secondary: `#${r2.toString(16).padStart(2, '0')}${g2.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`,
  };
}

/**
 * Get the full identity card for a user — what the app displays.
 * Combines role verification + fingerprint + colors + impersonation status.
 */
export async function getUserIdentityCard(userId: string) {
  const user = await query(
    `SELECT id, first_name, telegram_username, role, identity_pubkey,
            telegram_id, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (user.rows.length === 0) {
    throw new Error('User not found');
  }

  const u = user.rows[0];
  const fingerprint = generatePubkeyFingerprint(u.identity_pubkey);
  const colors = generateIdentityColor(u.identity_pubkey);

  // Check if this user's name is suspiciously close to any admin
  let impersonationWarning: string | null = null;
  if (u.role === 'user') {
    const check = await checkNameImpersonation(u.first_name, u.id);
    if (check.impersonating && check.targetAdmin) {
      impersonationWarning =
        `WARNING: This user's name closely resembles ${check.targetAdmin.role} ` +
        `"${check.targetAdmin.name}". Verify their fingerprint: ${fingerprint}`;
    }
  }

  // Calculate account age
  const ageMs = Date.now() - new Date(u.created_at).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  return {
    userId: u.id,
    displayName: u.first_name,
    role: u.role,
    isVerifiedAdmin: u.role === 'creator' || u.role === 'admin',
    fingerprint,
    identityColors: colors,
    telegramBound: !!u.telegram_id,
    accountAge: ageDays < 1 ? 'New account (< 1 day)' : `${ageDays} days`,
    impersonationWarning,
  };
}
