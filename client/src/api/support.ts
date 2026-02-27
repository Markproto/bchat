/**
 * Support API — Typed wrappers for /api/support/* endpoints.
 */

import { api } from './client';

// ── Types (mirrors server SupportTicket) ────────────────────

export interface SupportTicket {
  id: string;
  ticketNumber: number;
  userId: string;
  assignedAdminId: string | null;
  adminVerified: boolean;
  verifiedAt: string | null;
  status: string;
  priority: string;
  category: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

// ── API calls ───────────────────────────────────────────────

/** Create a new support ticket. */
export function createTicket(
  category: string,
  subject: string,
  priority: string = 'normal',
): Promise<{ ticket: SupportTicket }> {
  return api('/api/support/tickets', {
    method: 'POST',
    body: JSON.stringify({ category, subject, priority }),
  });
}

/** List the authenticated user's tickets. */
export function getMyTickets(): Promise<{ tickets: SupportTicket[] }> {
  return api('/api/support/tickets');
}

/** Get a single ticket by ID. */
export function getTicket(ticketId: string): Promise<{ ticket: SupportTicket }> {
  return api(`/api/support/tickets/${ticketId}`);
}

/** Request admin identity verification on a ticket. */
export function requestVerification(
  ticketId: string,
): Promise<{ challengeId: string; nonce: string; adminId: string; expiresAt: string }> {
  return api(`/api/support/tickets/${ticketId}/verify`, {
    method: 'POST',
  });
}

/** Close a ticket (user can only close their own). */
export function closeTicket(
  ticketId: string,
): Promise<{ ticket: SupportTicket }> {
  return api(`/api/support/tickets/${ticketId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'closed' }),
  });
}
