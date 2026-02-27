/**
 * Identity API — Typed wrappers for /api/identity/* endpoints.
 */

import { api } from './client';

// ── Types (mirrors server identity card) ─────────────────

export interface IdentityCard {
  userId: string;
  displayName: string;
  role: string;
  isVerifiedAdmin: boolean;
  fingerprint: string;
  identityColors: {
    primary: string;
    secondary: string;
  };
  telegramBound: boolean;
  accountAge: string;
  impersonationWarning: string | null;
}

export interface IdentityBadge {
  userId: string;
  badge: 'creator' | 'admin' | null;
  chainVerified: boolean;
  fingerprint: string | null;
}

export interface ImpersonationReport {
  reported: boolean;
  autoDetected: boolean;
  action: string;
}

// ── API calls ───────────────────────────────────────────────

/** Fetch the full identity card for a user. */
export function getIdentityCard(userId: string): Promise<IdentityCard> {
  return api(`/api/identity/${userId}`);
}

/** Fetch a lightweight admin badge check for message rendering. */
export function getIdentityBadge(userId: string): Promise<IdentityBadge> {
  return api(`/api/identity/${userId}/badge`);
}

/** Report a suspected impersonator. */
export function reportImpersonation(
  suspectUserId: string,
  reason: string,
): Promise<ImpersonationReport> {
  return api('/api/identity/report', {
    method: 'POST',
    body: JSON.stringify({ suspectUserId, reason }),
  });
}
