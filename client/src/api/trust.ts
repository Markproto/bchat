/**
 * Trust API — Typed wrappers for /api/trust/* endpoints.
 */

import { api } from './client';

// ── Types (mirrors server TrustProfile) ─────────────────────

export interface TrustProfile {
  userId: string;
  username: string;
  trustScore: number;
  canInvite: boolean;
  isBanned: boolean;
  isAdmin: boolean;
  isVerifiedAdmin: boolean;
  inviteDepth: number;
  invitedBy: string | null;
  flagCount: number;
  createdAt: string;
}

// ── API calls ───────────────────────────────────────────────

/** Fetch the authenticated user's own trust profile. */
export function getMyTrustProfile(): Promise<{ profile: TrustProfile }> {
  return api('/api/trust/me');
}

/** Fetch another user's trust profile. */
export function getTrustProfile(userId: string): Promise<{ profile: TrustProfile }> {
  return api(`/api/trust/profile/${userId}`);
}

/** Flag a user for review. */
export function flagUser(
  targetUserId: string,
  reason: string,
): Promise<{ message: string }> {
  return api('/api/trust/flag', {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId, reason }),
  });
}
