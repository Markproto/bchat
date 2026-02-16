/**
 * JWT token management for authenticated sessions.
 * After Telegram verification, users receive a JWT for API access.
 */

import jwt, { Secret, SignOptions } from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  telegramId: number;
  deviceId: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a JWT for an authenticated user.
 */
export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
  return jwt.sign(payload as object, JWT_SECRET, options);
}

/**
 * Verify and decode a JWT token.
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Extract token from Authorization header (Bearer scheme).
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
