/**
 * Key Manager — Generates and caches the user's E2EE keypair.
 *
 * On first login we generate a fresh curve25519 keypair, register the
 * public half with the server, and persist the keypair to localStorage.
 * On subsequent loads the persisted keypair is restored.
 *
 * NOTE: In production the secret key should live in IndexedDB with
 * CryptoKey non-extractable semantics, or be derived from the BIP39
 * mnemonic each session. localStorage is used here for simplicity.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { registerEncryptionKey, getRecipientKey } from '../api/messages';
import type { E2EEKeyPair } from './e2ee';

const STORAGE_KEY = 'bchat_e2ee_keypair';

let cachedKeyPair: E2EEKeyPair | null = null;

// ── Keypair lifecycle ─────────────────────────────────────

/**
 * Initialise the E2EE keypair for the current user.
 * Call this once after successful authentication.
 *
 * - If a keypair exists in localStorage, restore it.
 * - Otherwise generate a new one and register the public key with the server.
 */
export async function initKeyPair(): Promise<E2EEKeyPair> {
  // Try restoring from storage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      cachedKeyPair = {
        publicKey: decodeBase64(parsed.publicKey),
        secretKey: decodeBase64(parsed.secretKey),
      };
      return cachedKeyPair;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // Generate a new keypair
  const kp = nacl.box.keyPair();
  cachedKeyPair = { publicKey: kp.publicKey, secretKey: kp.secretKey };

  // Persist
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      publicKey: encodeBase64(kp.publicKey),
      secretKey: encodeBase64(kp.secretKey),
    }),
  );

  // Register public key with the server
  await registerEncryptionKey(encodeBase64(kp.publicKey));

  return cachedKeyPair;
}

/** Get the cached keypair (must call initKeyPair first). */
export function getKeyPair(): E2EEKeyPair | null {
  return cachedKeyPair;
}

/** Clear keypair from memory and storage (on logout). */
export function clearKeyPair(): void {
  cachedKeyPair = null;
  localStorage.removeItem(STORAGE_KEY);
}

// ── Recipient key cache ───────────────────────────────────

const recipientKeyCache = new Map<string, string>();

/**
 * Fetch a recipient's encryption public key (base64).
 * Results are cached in-memory for the session.
 */
export async function fetchRecipientKey(userId: string): Promise<string> {
  const cached = recipientKeyCache.get(userId);
  if (cached) return cached;

  const res = await getRecipientKey(userId);
  recipientKeyCache.set(userId, res.encryptionPublicKey);
  return res.encryptionPublicKey;
}
