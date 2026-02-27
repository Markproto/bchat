/**
 * Auth API — Typed wrappers for /api/auth/* endpoints.
 */

import { api } from './client';

// ── Types ───────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
}

export interface DeviceInfo {
  platform: string;
  appVersion: string;
  screenWidth?: number;
  screenHeight?: number;
  timezone?: string;
  language?: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  isNewUser: boolean;
  telegramUser: TelegramUser;
}

export interface ChallengeResponse {
  challengeId: string;
  nonce: string;
  expiresAt: number;
}

export interface ChallengeVerifyResponse {
  verified: boolean;
  purpose: string;
}

// ── Helpers ─────────────────────────────────────────────────

/** Collect basic device info from the browser. */
export function collectDeviceInfo(): DeviceInfo {
  return {
    platform: navigator.platform || 'unknown',
    appVersion: '0.1.0',
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };
}

// ── API calls ───────────────────────────────────────────────

/**
 * Authenticate via Telegram identity.
 * The user must have already joined the Telegram channel via the bot.
 */
export function loginWithTelegram(
  telegramUser: TelegramUser,
  inviteCode?: string,
): Promise<AuthResponse> {
  return api<AuthResponse>('/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({
      telegramUser,
      deviceInfo: collectDeviceInfo(),
      inviteCode: inviteCode || undefined,
    }),
  });
}

/** Request a challenge nonce for identity verification. */
export function requestChallenge(purpose = 'identity_verify'): Promise<ChallengeResponse> {
  return api<ChallengeResponse>('/api/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ purpose }),
  });
}

/** Verify a signed challenge. */
export function verifyChallenge(
  challengeId: string,
  signature: string,
  publicKey: string,
): Promise<ChallengeVerifyResponse> {
  return api<ChallengeVerifyResponse>('/api/auth/challenge/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeId, signature, publicKey }),
  });
}
