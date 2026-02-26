/**
 * Scam Detection API — Typed wrappers for /api/scam/* endpoints.
 */

import { api } from './client';

// ── Types (mirrors server ScamAlert) ────────────────────────

export interface ScamAlert {
  id: string;
  messageId: string | null;
  senderId: string;
  recipientId: string;
  patternId: string;
  severity: string;
  matchedText: string | null;
  alertMessage: string;
  shownToRecipient: boolean;
  dismissed: boolean;
  createdAt: string;
}

// ── API calls ───────────────────────────────────────────────

/** Fetch scam alerts for the authenticated user. */
export function getMyAlerts(
  includeRead = false,
): Promise<{ alerts: ScamAlert[] }> {
  const qs = includeRead ? '?include_read=true' : '';
  return api(`/api/scam/alerts${qs}`);
}

/** Dismiss a scam alert. */
export function dismissAlert(
  alertId: string,
): Promise<{ message: string }> {
  return api(`/api/scam/alerts/${alertId}/dismiss`, {
    method: 'POST',
  });
}
