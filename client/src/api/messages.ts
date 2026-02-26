/**
 * Messages API — Typed wrappers for /api/messages/* endpoints.
 */

import { api } from './client';

// ── Types ───────────────────────────────────────────────────

export interface SendMessageRequest {
  recipient_id: string;
  ciphertext: string;
  nonce: string;
  sender_public_key: string;
  message_type?: string;
  content?: string; // plaintext hint for scam detection (not stored)
}

export interface SendMessageResponse {
  messageId: string;
  conversationId: string;
  sequenceNum: number;
  createdAt: string;
  scamWarning: {
    matchCount: number;
    severity: string;
  } | null;
}

export interface RecipientKeyResponse {
  encryptionPublicKey: string;
}

// ── API calls ───────────────────────────────────────────────

/** Register your encryption public key with the server. */
export function registerEncryptionKey(
  encryptionPublicKey: string,
): Promise<{ message: string }> {
  return api('/api/messages/keys/register', {
    method: 'POST',
    body: JSON.stringify({ encryption_public_key: encryptionPublicKey }),
  });
}

/** Fetch a recipient's encryption public key. */
export function getRecipientKey(
  userId: string,
): Promise<RecipientKeyResponse> {
  return api(`/api/messages/keys/${userId}`);
}

/** Send an encrypted message. */
export function sendMessage(
  payload: SendMessageRequest,
): Promise<SendMessageResponse> {
  return api('/api/messages/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface CoolingStatusResponse {
  isCooling: boolean;
  hoursRemaining: number;
  expiresAt: string | null;
  restrictedActions?: string[];
}

/** Check cooling status with a specific contact. */
export function getCoolingStatus(
  contactUserId: string,
): Promise<CoolingStatusResponse> {
  return api(`/api/messages/cooling/${contactUserId}`);
}

/** Admin: exempt a contact pair from the cooling period. */
export function exemptCooling(
  contactUserId: string,
): Promise<{ message: string; contactUserId: string }> {
  return api(`/api/messages/cooling/${contactUserId}/exempt`, {
    method: 'POST',
  });
}
