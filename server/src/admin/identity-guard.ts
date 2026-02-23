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
import { query } from '../db';

/**
 * Characters commonly used in homoglyph attacks (look-alike substitutions).
 * Maps deceptive characters to their ASCII equivalents.
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic look-alikes
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
  '\u0441': 'c', '\u0443': 'y', '\u0445': 'x', '\u0456': 'i',
  '\u0458': 'j', '\u04BB': 'h', '\u0455': 's', '\u0442': 't',
  // Greek look-alikes
  '\u03B1': 'a', '\u03BF': 'o', '\u03B5': 'e', '\u03C1': 'p',
  // Common substitutions
  '0': 'o', '1': 'l', '!': 'i', '@': 'a', '$': 's', '3': 'e',
  // Invisible/zero-width characters (stripped entirely)
  '\u200B': '', '\u200C': '', '\u200D': '', '\uFEFF': '', '\u00AD': '',
};

/**
 * Normalize a display name for comparison.
 * Strips invisible chars, replaces homoglyphs, lowercases.
 */
export function normalizeName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Replace known homoglyphs
  for (const [deceptive, replacement] of Object.entries(HOMOGLYPH_MAP)) {
    normalized = normalized.split(deceptive).join(replacement);
  }

  // Strip remaining non-printable / zero-width characters
  normalized = normalized.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '');

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}

/**
 * Calculate similarity between two normalized names (0-1 scale).
 * Uses Levenshtein distance ratio.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (na === nb) return 1.0;

  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshtein(na, nb);
  return 1 - (distance / maxLen);
}

/**
 * Levenshtein edit distance.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

const SIMILARITY_THRESHOLD = 0.75; // 75% similar = flagged

/**
 * Check if a display name impersonates any admin/creator.
 * Returns the admin being impersonated, or null if safe.
 */
export async function checkNameImpersonation(
  name: string,
  excludeUserId?: string
): Promise<{ impersonating: boolean; targetAdmin?: { id: string; name: string; role: string } }> {
  // Get all admins/creators
  const admins = await query(
    `SELECT id, first_name, telegram_username, role
     FROM users
     WHERE role IN ('creator', 'admin') AND is_active = TRUE`
  );

  const normalizedInput = normalizeName(name);

  for (const admin of admins.rows) {
    // Don't flag the admin themselves
    if (admin.id === excludeUserId) continue;

    // Check against first_name
    if (admin.first_name) {
      const similarity = nameSimilarity(name, admin.first_name);
      if (similarity >= SIMILARITY_THRESHOLD) {
        return {
          impersonating: true,
          targetAdmin: { id: admin.id, name: admin.first_name, role: admin.role },
        };
      }
    }

    // Check against telegram_username
    if (admin.telegram_username) {
      const similarity = nameSimilarity(name, admin.telegram_username);
      if (similarity >= SIMILARITY_THRESHOLD) {
        return {
          impersonating: true,
          targetAdmin: { id: admin.id, name: admin.telegram_username, role: admin.role },
        };
      }
    }

    // Exact match on normalized name (catches homoglyph attacks)
    const normalizedAdmin = normalizeName(admin.first_name || '');
    if (normalizedInput === normalizedAdmin && normalizedInput.length > 0) {
      return {
        impersonating: true,
        targetAdmin: { id: admin.id, name: admin.first_name, role: admin.role },
      };
    }
  }

  return { impersonating: false };
}

/**
 * Generate a unique pubkey fingerprint — a short, human-readable ID
 * derived from the ed25519 public key. Shows next to every message.
 *
 * Format: "AB12:CD34:EF56" (6 hex pairs grouped in 3)
 *
 * Since this is derived from the public key, a scammer who copies a
 * name/photo will have a DIFFERENT fingerprint. Users learn to check
 * the fingerprint just like checking a padlock in a browser.
 */
export function generatePubkeyFingerprint(publicKeyHex: string): string {
  const hash = createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest();
  // Take first 6 bytes, format as grouped hex
  const parts = [
    hash.subarray(0, 2).toString('hex').toUpperCase(),
    hash.subarray(2, 4).toString('hex').toUpperCase(),
    hash.subarray(4, 6).toString('hex').toUpperCase(),
  ];
  return parts.join(':');
}

/**
 * Generate a color-based visual identifier from the public key.
 * Returns RGB values for a unique identicon background color.
 * The app renders this as a colored ring around the avatar.
 *
 * Even if a scammer copies the admin's photo, the ring color will
 * be different because it's derived from their own (different) key.
 */
export function generateIdentityColor(publicKeyHex: string): {
  primary: string;
  secondary: string;
} {
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
export async function getUserIdentityCard(userId: string): Promise<{
  userId: string;
  displayName: string;
  role: string;
  isVerifiedAdmin: boolean;
  fingerprint: string;
  identityColors: { primary: string; secondary: string };
  telegramBound: boolean;
  accountAge: string;
  impersonationWarning: string | null;
}> {
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
