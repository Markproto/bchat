/**
 * Homoglyph & Name Similarity Detection
 *
 * Prevents impersonation through unicode tricks (Cyrillic 'а' vs Latin 'a'),
 * invisible characters, and similar-looking display names.
 *
 * Used by the admin verification system to block name-based scams.
 */

import { createHash } from 'crypto';
import { query } from '../db/pool';

/**
 * Characters commonly used in homoglyph attacks.
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

const SIMILARITY_THRESHOLD = 0.75;

/**
 * Check if a display name impersonates any admin/creator.
 */
export async function checkNameImpersonation(
  name: string,
  excludeUserId?: string
): Promise<{ impersonating: boolean; targetAdmin?: { id: string; name: string; role: string } }> {
  const admins = await query(
    `SELECT id, first_name, telegram_username, role
     FROM users
     WHERE role IN ('creator', 'admin') AND is_active = TRUE`
  );

  for (const admin of admins.rows) {
    if (admin.id === excludeUserId) continue;

    if (admin.first_name) {
      const similarity = nameSimilarity(name, admin.first_name);
      if (similarity >= SIMILARITY_THRESHOLD) {
        return {
          impersonating: true,
          targetAdmin: { id: admin.id, name: admin.first_name, role: admin.role },
        };
      }
    }

    if (admin.telegram_username) {
      const similarity = nameSimilarity(name, admin.telegram_username);
      if (similarity >= SIMILARITY_THRESHOLD) {
        return {
          impersonating: true,
          targetAdmin: { id: admin.id, name: admin.telegram_username, role: admin.role },
        };
      }
    }
  }

  return { impersonating: false };
}

/**
 * Generate a unique pubkey fingerprint for visual identity.
 * Format: "AB12:CD34:EF56"
 */
export function generatePubkeyFingerprint(publicKeyHex: string): string {
  const hash = createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest();
  const parts = [
    hash.subarray(0, 2).toString('hex').toUpperCase(),
    hash.subarray(2, 4).toString('hex').toUpperCase(),
    hash.subarray(4, 6).toString('hex').toUpperCase(),
  ];
  return parts.join(':');
}
