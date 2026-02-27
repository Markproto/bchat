/**
 * Invites API — Typed wrappers for /api/invites/* endpoints.
 */

import { api } from './client';

// ── Types ───────────────────────────────────────────────────

export interface Invite {
  code: string;
  used_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface InviteStatus {
  code: string;
  valid: boolean;
  used: boolean;
  expired: boolean;
}

// ── API calls ───────────────────────────────────────────────

/** Create a new invite code (admin/creator only). */
export function createInvite(): Promise<{ code: string; expiresAt: string }> {
  return api('/api/invites/create', {
    method: 'POST',
  });
}

/** List invites created by the current user. */
export function getMyInvites(): Promise<{ invites: Invite[] }> {
  return api('/api/invites');
}

/** Check if an invite code is valid. */
export function checkInvite(code: string): Promise<InviteStatus> {
  return api(`/api/invites/${code}`);
}
