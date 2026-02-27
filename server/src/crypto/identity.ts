/**
 * Identity & Authentication Cryptography
 *
 * Combines:
 *   - ed25519 keypair generation (on-device identity)
 *   - Challenge-response signing (anti-impersonation)
 *   - JWT token management (session auth)
 */

import * as ed from '@noble/ed25519';
import { createHash } from 'crypto';
import jwt, { Secret } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// noble-ed25519 v2 requires setting sha512
ed.etc.sha512Sync = (...m) => {
  const h = createHash('sha512');
  m.forEach(msg => h.update(msg));
  return new Uint8Array(h.digest());
};

// ── JWT ────────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  telegramId: number;
  deviceId: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// ── ed25519 Identity Keys ──────────────────────────────────────────────

export interface Ed25519KeyPair {
  publicKey: string;  // hex
  privateKey: string; // hex
}

export async function generateIdentityKeyPair(): Promise<Ed25519KeyPair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    publicKey: Buffer.from(publicKey).toString('hex'),
    privateKey: Buffer.from(privateKey).toString('hex'),
  };
}

// ── Challenge-Response ─────────────────────────────────────────────────

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface Challenge {
  id: string;
  nonce: string;
  purpose: string;
  createdAt: number;
  expiresAt: number;
}

export function createChallenge(purpose: string = 'identity_verify'): Challenge {
  const id = uuidv4();
  const now = Date.now();
  return {
    id,
    nonce: `${id}:${now}:${purpose}`,
    purpose,
    createdAt: now,
    expiresAt: now + CHALLENGE_EXPIRY_MS,
  };
}

export async function signChallenge(nonce: string, privateKeyHex: string): Promise<string> {
  const message = new TextEncoder().encode(nonce);
  const privateKey = Buffer.from(privateKeyHex, 'hex');
  const signature = await ed.signAsync(message, privateKey);
  return Buffer.from(signature).toString('hex');
}

export async function verifySignedChallenge(
  challenge: Challenge,
  signatureHex: string,
  publicKeyHex: string
): Promise<{ valid: boolean; reason?: string }> {
  if (Date.now() > challenge.expiresAt) {
    return { valid: false, reason: 'Challenge expired' };
  }

  const message = new TextEncoder().encode(challenge.nonce);
  const signature = Buffer.from(signatureHex, 'hex');
  const publicKey = Buffer.from(publicKeyHex, 'hex');

  try {
    const valid = await ed.verifyAsync(signature, message, publicKey);
    if (!valid) return { valid: false, reason: 'Invalid signature' };
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Verification error' };
  }
}

/**
 * Database-backed challenge store.
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
