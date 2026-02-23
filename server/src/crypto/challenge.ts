/**
 * Challenge-Response Signing (ed25519)
 *
 * Anti-impersonation layer: when a user needs to prove identity
 * (e.g., support chat, sensitive actions), the server issues a
 * cryptographic challenge (nonce). The user signs it with their
 * on-device ed25519 private key, and the server verifies against
 * the stored public key.
 *
 * Flow:
 *   1. Server generates nonce (UUID + timestamp + purpose)
 *   2. Client signs nonce with ed25519 private key
 *   3. Server verifies signature against user's registered public key
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

// noble-ed25519 v2 requires setting sha512
ed.etc.sha512Sync = (...m) => {
  const h = createHash('sha512');
  m.forEach(msg => h.update(msg));
  return new Uint8Array(h.digest());
};

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface Challenge {
  id: string;
  nonce: string;
  purpose: string;
  createdAt: number;
  expiresAt: number;
}

export interface SignedChallenge {
  challengeId: string;
  signature: string; // hex-encoded ed25519 signature
  publicKey: string; // hex-encoded ed25519 public key
}

export interface Ed25519KeyPair {
  publicKey: string;  // hex
  privateKey: string; // hex
}

/**
 * Generate a new ed25519 keypair for on-device identity.
 */
export async function generateIdentityKeyPair(): Promise<Ed25519KeyPair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    publicKey: Buffer.from(publicKey).toString('hex'),
    privateKey: Buffer.from(privateKey).toString('hex'),
  };
}

/**
 * Create a challenge for a user to sign.
 */
export function createChallenge(purpose: string = 'identity_verify'): Challenge {
  const id = uuidv4();
  const now = Date.now();
  const nonce = `${id}:${now}:${purpose}`;
  return {
    id,
    nonce,
    purpose,
    createdAt: now,
    expiresAt: now + CHALLENGE_EXPIRY_MS,
  };
}

/**
 * Sign a challenge nonce with an ed25519 private key (client-side).
 */
export async function signChallenge(
  nonce: string,
  privateKeyHex: string
): Promise<string> {
  const message = new TextEncoder().encode(nonce);
  const privateKey = Buffer.from(privateKeyHex, 'hex');
  const signature = await ed.signAsync(message, privateKey);
  return Buffer.from(signature).toString('hex');
}

/**
 * Verify a signed challenge against a public key (server-side).
 * Returns true if the signature is valid and the challenge hasn't expired.
 */
export async function verifySignedChallenge(
  challenge: Challenge,
  signatureHex: string,
  publicKeyHex: string
): Promise<{ valid: boolean; reason?: string }> {
  // Check expiry
  if (Date.now() > challenge.expiresAt) {
    return { valid: false, reason: 'Challenge expired' };
  }

  const message = new TextEncoder().encode(challenge.nonce);
  const signature = Buffer.from(signatureHex, 'hex');
  const publicKey = Buffer.from(publicKeyHex, 'hex');

  try {
    const valid = await ed.verifyAsync(signature, message, publicKey);
    if (!valid) {
      return { valid: false, reason: 'Invalid signature' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Verification error' };
  }
}

/**
 * Database-backed challenge store using the `challenges` table.
 * Persists across restarts and works in multi-instance deployments.
 */
export class ChallengeStore {
  private queryFn: (text: string, params?: unknown[]) => Promise<any>;

  constructor(queryFn: (text: string, params?: unknown[]) => Promise<any>) {
    this.queryFn = queryFn;
  }

  async issue(purpose: string, userId?: string): Promise<Challenge> {
    const challenge = createChallenge(purpose);
    await this.queryFn(
      `INSERT INTO challenges (id, user_id, nonce, purpose, status, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', to_timestamp($5 / 1000.0))`,
      [challenge.id, userId || '00000000-0000-0000-0000-000000000000', challenge.nonce, purpose, challenge.expiresAt]
    );
    return challenge;
  }

  async consume(challengeId: string): Promise<Challenge | null> {
    // Atomically fetch and mark as verified to prevent replay attacks
    const result = await this.queryFn(
      `UPDATE challenges SET status = 'verified', verified_at = NOW()
       WHERE id = $1 AND status = 'pending' AND expires_at > NOW()
       RETURNING id, nonce, purpose, created_at, expires_at`,
      [challengeId]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      nonce: row.nonce,
      purpose: row.purpose,
      createdAt: new Date(row.created_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    };
  }
}
