/**
 * Safe Support Engine — Phase 9
 *
 * In-app support ticket system with cryptographic admin verification.
 * All support happens inside bchat — no external DMs, no impersonation.
 *
 * Key security properties:
 *   - Users can request admin identity proof (challenge-response)
 *   - Ticket messages are E2EE (system messages are plaintext status updates)
 *   - Full audit trail via ticket_events
 */

import { query } from "../db/pool";
import { logger } from "../utils/logger";
import crypto from "crypto";

// ── Types ────────────────────────────────────────────────────────────────

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

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string | null;
  ciphertext: string | null;
  nonce: string | null;
  senderPublicKey: string | null;
  messageType: string;
  isSystemMessage: boolean;
  systemMessageText: string | null;
  createdAt: string;
}

export interface VerificationChallenge {
  id: string;
  ticketId: string;
  adminId: string;
  nonce: string;
  expiresAt: string;
  verified: boolean;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorId: string | null;
  eventType: string;
  detail: string | null;
  createdAt: string;
}

// ── Ticket CRUD ──────────────────────────────────────────────────────────

export async function createTicket(
  userId: string,
  category: string,
  subject: string,
  priority: string = "normal"
): Promise<SupportTicket> {
  const result = await query(
    `INSERT INTO support_tickets (user_id, category, subject, priority)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, category, subject, priority]
  );

  const ticket = mapTicketRow(result.rows[0]);

  // Audit event
  await addTicketEvent(ticket.id, userId, "created", `Ticket created: ${subject}`);

  // System message
  await addSystemMessage(ticket.id, `Support ticket #${ticket.ticketNumber} created.`);

  logger.info("Support", `Ticket #${ticket.ticketNumber} created by ${userId}`);
  return ticket;
}

export async function getTicket(ticketId: string): Promise<SupportTicket | null> {
  const result = await query(
    `SELECT * FROM support_tickets WHERE id = $1`,
    [ticketId]
  );
  if (result.rows.length === 0) return null;
  return mapTicketRow(result.rows[0]);
}

export async function getTicketByNumber(ticketNumber: number): Promise<SupportTicket | null> {
  const result = await query(
    `SELECT * FROM support_tickets WHERE ticket_number = $1`,
    [ticketNumber]
  );
  if (result.rows.length === 0) return null;
  return mapTicketRow(result.rows[0]);
}

export async function getUserTickets(userId: string): Promise<SupportTicket[]> {
  const result = await query(
    `SELECT * FROM support_tickets WHERE user_id = $1
     ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows.map(mapTicketRow);
}

export async function getAdminQueue(
  statusFilter?: string
): Promise<SupportTicket[]> {
  let where = "WHERE status NOT IN ('resolved', 'closed')";
  const params: unknown[] = [];

  if (statusFilter) {
    where = "WHERE status = $1";
    params.push(statusFilter);
  }

  const result = await query(
    `SELECT * FROM support_tickets ${where}
     ORDER BY
       CASE priority
         WHEN 'urgent' THEN 1
         WHEN 'high' THEN 2
         WHEN 'normal' THEN 3
         WHEN 'low' THEN 4
       END,
       updated_at ASC
     LIMIT 100`,
    params
  );
  return result.rows.map(mapTicketRow);
}

// ── Ticket Actions ───────────────────────────────────────────────────────

export async function assignTicket(
  ticketId: string,
  adminId: string
): Promise<SupportTicket> {
  const result = await query(
    `UPDATE support_tickets
     SET assigned_admin_id = $1, status = 'assigned', updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [adminId, ticketId]
  );
  if (result.rows.length === 0) throw new Error("Ticket not found");

  const ticket = mapTicketRow(result.rows[0]);
  await addTicketEvent(ticketId, adminId, "admin_assigned", "Admin assigned to ticket");
  await addSystemMessage(ticketId, "A verified admin has joined this ticket. You can request identity verification at any time.");

  logger.info("Support", `Ticket #${ticket.ticketNumber} assigned to admin ${adminId}`);
  return ticket;
}

export async function updateTicketStatus(
  ticketId: string,
  actorId: string,
  status: string
): Promise<SupportTicket> {
  const updates: string[] = ["status = $1", "updated_at = NOW()"];
  const params: unknown[] = [status];

  if (status === "resolved") {
    updates.push(`resolved_at = NOW()`);
  } else if (status === "closed") {
    updates.push(`closed_at = NOW()`);
  }

  params.push(ticketId);

  const result = await query(
    `UPDATE support_tickets SET ${updates.join(", ")}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );
  if (result.rows.length === 0) throw new Error("Ticket not found");

  const ticket = mapTicketRow(result.rows[0]);
  await addTicketEvent(ticketId, actorId, "status_changed", `Status changed to ${status}`);
  await addSystemMessage(ticketId, `Ticket status updated to: ${status}`);

  return ticket;
}

export async function updateTicketPriority(
  ticketId: string,
  adminId: string,
  priority: string
): Promise<SupportTicket> {
  const result = await query(
    `UPDATE support_tickets SET priority = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [priority, ticketId]
  );
  if (result.rows.length === 0) throw new Error("Ticket not found");

  await addTicketEvent(ticketId, adminId, "priority_changed", `Priority changed to ${priority}`);
  return mapTicketRow(result.rows[0]);
}

// ── Ticket Messages ──────────────────────────────────────────────────────

export async function sendTicketMessage(
  ticketId: string,
  senderId: string,
  payload: {
    ciphertext: string;
    nonce: string;
    senderPublicKey: string;
    messageType?: string;
  }
): Promise<TicketMessage> {
  const result = await query(
    `INSERT INTO ticket_messages
     (ticket_id, sender_id, ciphertext, nonce, sender_public_key, message_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      ticketId,
      senderId,
      payload.ciphertext,
      payload.nonce,
      payload.senderPublicKey,
      payload.messageType || "text",
    ]
  );

  // Touch ticket updated_at
  await query(
    `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
    [ticketId]
  );

  return mapMessageRow(result.rows[0]);
}

export async function getTicketMessages(
  ticketId: string,
  limit: number = 50,
  before?: string
): Promise<TicketMessage[]> {
  let queryStr = `SELECT * FROM ticket_messages WHERE ticket_id = $1`;
  const params: unknown[] = [ticketId];

  if (before) {
    queryStr += ` AND created_at < $2`;
    params.push(before);
  }

  queryStr += ` ORDER BY created_at ASC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(queryStr, params);
  return result.rows.map(mapMessageRow);
}

async function addSystemMessage(ticketId: string, text: string): Promise<void> {
  await query(
    `INSERT INTO ticket_messages
     (ticket_id, message_type, is_system_message, system_message_text)
     VALUES ($1, 'system', true, $2)`,
    [ticketId, text]
  );
}

// ── Admin Verification (Challenge-Response) ──────────────────────────────

const CHALLENGE_EXPIRY_MINUTES = 5;

export async function createVerificationChallenge(
  ticketId: string,
  adminId: string
): Promise<VerificationChallenge> {
  // Verify ticket exists and admin is assigned
  const ticket = await query(
    `SELECT assigned_admin_id FROM support_tickets WHERE id = $1`,
    [ticketId]
  );
  if (ticket.rows.length === 0) throw new Error("Ticket not found");
  if (ticket.rows[0].assigned_admin_id !== adminId) {
    throw new Error("Only the assigned admin can be verified");
  }

  // Expire any previous pending challenges for this ticket
  await query(
    `UPDATE ticket_verification_challenges
     SET expired = true
     WHERE ticket_id = $1 AND verified = false AND expired = false`,
    [ticketId]
  );

  // Generate 32-byte random nonce
  const nonceBytes = crypto.randomBytes(32);
  const nonceBase64 = nonceBytes.toString("base64");

  const expiresAt = new Date(
    Date.now() + CHALLENGE_EXPIRY_MINUTES * 60 * 1000
  );

  const result = await query(
    `INSERT INTO ticket_verification_challenges
     (ticket_id, admin_id, nonce, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [ticketId, adminId, nonceBase64, expiresAt.toISOString()]
  );

  await addTicketEvent(ticketId, null, "verification_requested", "User requested admin identity verification");
  await addSystemMessage(ticketId, "Admin identity verification in progress...");

  const row = result.rows[0];
  return {
    id: row.id,
    ticketId: row.ticket_id,
    adminId: row.admin_id,
    nonce: row.nonce,
    expiresAt: row.expires_at,
    verified: false,
  };
}

export async function verifyChallenge(
  challengeId: string,
  signature: string
): Promise<{ verified: boolean; reason?: string }> {
  // Fetch the challenge
  const challengeResult = await query(
    `SELECT tvc.*, u.signing_public_key, u.identity_pubkey
     FROM ticket_verification_challenges tvc
     JOIN users u ON u.id = tvc.admin_id
     WHERE tvc.id = $1 AND tvc.verified = false AND tvc.expired = false`,
    [challengeId]
  );

  if (challengeResult.rows.length === 0) {
    return { verified: false, reason: "Challenge not found, already verified, or expired" };
  }

  const challenge = challengeResult.rows[0];

  // Check expiry
  if (new Date(challenge.expires_at) < new Date()) {
    await query(
      `UPDATE ticket_verification_challenges SET expired = true WHERE id = $1`,
      [challengeId]
    );
    return { verified: false, reason: "Challenge expired" };
  }

  // Get the admin's signing public key
  const adminPubKey = challenge.signing_public_key || challenge.identity_pubkey;
  if (!adminPubKey) {
    return { verified: false, reason: "Admin has no signing key registered" };
  }

  // Verify the ed25519 signature over the nonce
  try {
    const { verify } = await import("@noble/ed25519");
    const sigBytes = Buffer.from(signature, "hex");
    const nonceBytes = Buffer.from(challenge.nonce, "base64");
    const pubKeyBytes = Buffer.from(adminPubKey, "hex");

    const isValid = await verify(sigBytes, nonceBytes, pubKeyBytes);
    if (!isValid) {
      return { verified: false, reason: "Invalid signature" };
    }
  } catch (err: any) {
    logger.error("Support", `Signature verification error: ${err.message}`);
    return { verified: false, reason: "Verification error" };
  }

  // Mark challenge as verified
  await query(
    `UPDATE ticket_verification_challenges
     SET verified = true, verified_at = NOW()
     WHERE id = $1`,
    [challengeId]
  );

  // Mark ticket as admin-verified
  await query(
    `UPDATE support_tickets
     SET admin_verified = true, verified_at = NOW(),
         status = CASE WHEN status = 'pending_verification' THEN 'verified' ELSE status END,
         updated_at = NOW()
     WHERE id = $1`,
    [challenge.ticket_id]
  );

  await addTicketEvent(challenge.ticket_id, challenge.admin_id, "admin_verified",
    "Admin identity cryptographically verified");
  await addSystemMessage(challenge.ticket_id,
    "Admin identity VERIFIED. This admin's cryptographic signature has been confirmed.");

  logger.info("Support", `Admin ${challenge.admin_id} verified on ticket ${challenge.ticket_id}`);

  return { verified: true };
}

// ── Ticket Events ────────────────────────────────────────────────────────

async function addTicketEvent(
  ticketId: string,
  actorId: string | null,
  eventType: string,
  detail: string
): Promise<void> {
  await query(
    `INSERT INTO ticket_events (ticket_id, actor_id, event_type, detail)
     VALUES ($1, $2, $3, $4)`,
    [ticketId, actorId, eventType, detail]
  );
}

export async function getTicketEvents(ticketId: string): Promise<TicketEvent[]> {
  const result = await query(
    `SELECT * FROM ticket_events WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [ticketId]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    ticketId: row.ticket_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────

function mapTicketRow(row: any): SupportTicket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    userId: row.user_id,
    assignedAdminId: row.assigned_admin_id,
    adminVerified: row.admin_verified,
    verifiedAt: row.verified_at,
    status: row.status,
    priority: row.priority,
    category: row.category,
    subject: row.subject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
  };
}

function mapMessageRow(row: any): TicketMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    senderId: row.sender_id,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    senderPublicKey: row.sender_public_key,
    messageType: row.message_type,
    isSystemMessage: row.is_system_message,
    systemMessageText: row.system_message_text,
    createdAt: row.created_at,
  };
}
