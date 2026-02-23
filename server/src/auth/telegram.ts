/**
 * Telegram WebApp Authentication
 *
 * Verifies Telegram Mini App initData using HMAC-SHA256.
 * This is the cryptographic proof that ties a Telegram user to your app.
 *
 * Verification steps (per Telegram docs):
 *   1. Parse initData query string
 *   2. Remove 'hash' param, sort remaining alphabetically
 *   3. Build data-check-string: "key=value\nkey=value\n..."
 *   4. Compute secret = HMAC-SHA256("WebAppData", bot_token)
 *   5. Compute hash = HMAC-SHA256(secret, data-check-string)
 *   6. Compare computed hash with received hash
 *   7. Check auth_date is recent (< 24h or tighter)
 */

import { createHmac } from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
  query_id?: string;
  chat_instance?: string;
  chat_type?: string;
  start_param?: string;
}

const MAX_AUTH_AGE_SECONDS = 86400; // 24 hours

/**
 * Verify Telegram WebApp initData HMAC-SHA256 signature.
 * Returns the parsed user data if valid, throws if invalid.
 */
export function verifyTelegramWebAppData(
  initDataRaw: string,
  botToken: string,
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS
): TelegramInitData {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');

  if (!hash) {
    throw new Error('Missing hash in initData');
  }

  // Build data-check-string: sorted key=value pairs, excluding hash
  const entries: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      entries.push(`${key}=${value}`);
    }
  });
  entries.sort();
  const dataCheckString = entries.join('\n');

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // computed_hash = HMAC-SHA256(secret_key, data_check_string)
  const computedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Constant-time comparison
  if (!timingSafeEqual(computedHash, hash)) {
    throw new Error('Invalid initData signature — possible tampering');
  }

  // Check auth_date freshness
  const authDateStr = params.get('auth_date');
  if (!authDateStr) {
    throw new Error('Missing auth_date in initData');
  }
  const authDate = parseInt(authDateStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds) {
    throw new Error(`auth_date too old (${now - authDate}s > ${maxAgeSeconds}s)`);
  }

  // Parse user object
  const userStr = params.get('user');
  if (!userStr) {
    throw new Error('Missing user in initData');
  }
  const user: TelegramUser = JSON.parse(userStr);

  return {
    user,
    auth_date: authDate,
    hash,
    query_id: params.get('query_id') || undefined,
    chat_instance: params.get('chat_instance') || undefined,
    chat_type: params.get('chat_type') || undefined,
    start_param: params.get('start_param') || undefined,
  };
}

/**
 * Verify Telegram Login Widget data (for web-based login).
 * Similar to WebApp but uses SHA-256(bot_token) as the key.
 */
export function verifyTelegramLoginData(
  data: Record<string, string>,
  botToken: string,
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS
): TelegramUser {
  const { hash, ...rest } = data;
  if (!hash) {
    throw new Error('Missing hash in login data');
  }

  // Build check string
  const checkString = Object.keys(rest)
    .sort()
    .map(key => `${key}=${rest[key]}`)
    .join('\n');

  // For Login Widget: key = SHA-256(bot_token)
  const { createHash } = require('crypto');
  const secretKey = createHash('sha256').update(botToken).digest();

  const computedHash = createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  if (!timingSafeEqual(computedHash, hash)) {
    throw new Error('Invalid login data signature');
  }

  // Check freshness
  const authDate = parseInt(rest['auth_date'], 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds) {
    throw new Error('Login data expired');
  }

  return {
    id: parseInt(rest['id'], 10),
    first_name: rest['first_name'],
    last_name: rest['last_name'],
    username: rest['username'],
    photo_url: rest['photo_url'],
  };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return require('crypto').timingSafeEqual(bufA, bufB);
}
