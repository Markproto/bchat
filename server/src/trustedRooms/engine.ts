/**
 * Trusted Rooms Engine — Phase 10
 *
 * Business logic for trusted room auto-access:
 *   - CRUD for trusted rooms (Telegram groups / bchat conversations)
 *   - Admission recording with cutoff date enforcement
 *   - Member cap checking
 *   - Auto-deactivation when too many admitted users get banned
 */

import { query } from "../db/pool";
import { logger } from "../utils/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface TrustedRoom {
  id: string;
  sourceType: "telegram" | "bchat";
  telegramChatId: number | null;
  conversationId: string | null;
  name: string;
  createdBy: string;
  defaultTrustScore: number;
  membershipCutoff: string;
  maxMembers: number;
  admittedCount: number;
  isActive: boolean;
  deactivatedBy: string | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrustedRoomAdmission {
  id: string;
  trustedRoomId: string;
  userId: string;
  telegramUserId: number | null;
  admittedAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const AUTO_DEACTIVATE_THRESHOLD = 3;

// ── Create ───────────────────────────────────────────────────────────────

export async function createTrustedRoom(
  adminId: string,
  opts: {
    sourceType: "telegram" | "bchat";
    telegramChatId?: number;
    conversationId?: string;
    name: string;
    membershipCutoff: string;
    defaultTrustScore?: number;
    maxMembers?: number;
  }
): Promise<TrustedRoom> {
  // Check for duplicate
  if (opts.sourceType === "telegram" && opts.telegramChatId) {
    const existing = await query(
      "SELECT id FROM trusted_rooms WHERE telegram_chat_id = $1",
      [opts.telegramChatId]
    );
    if (existing.rows.length > 0) {
      throw new Error("This Telegram group is already registered as a trusted room");
    }
  }

  const result = await query(
    `INSERT INTO trusted_rooms
     (source_type, telegram_chat_id, conversation_id, name, created_by,
      default_trust_score, membership_cutoff, max_members)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      opts.sourceType,
      opts.telegramChatId || null,
      opts.conversationId || null,
      opts.name,
      adminId,
      opts.defaultTrustScore ?? 0.4,
      opts.membershipCutoff,
      opts.maxMembers ?? 0,
    ]
  );

  const room = mapRoomRow(result.rows[0]);

  // Audit log
  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [
      adminId,
      "trusted_room_created",
      JSON.stringify({
        roomId: room.id,
        name: room.name,
        sourceType: room.sourceType,
        membershipCutoff: room.membershipCutoff,
      }),
    ]
  );

  logger.info("TrustedRooms", `Room "${room.name}" created by ${adminId}`);
  return room;
}

// ── Read ─────────────────────────────────────────────────────────────────

export async function getTrustedRoom(roomId: string): Promise<TrustedRoom | null> {
  const result = await query("SELECT * FROM trusted_rooms WHERE id = $1", [roomId]);
  if (result.rows.length === 0) return null;
  return mapRoomRow(result.rows[0]);
}

export async function getTrustedRoomByTelegramChat(
  chatId: number
): Promise<TrustedRoom | null> {
  const result = await query(
    "SELECT * FROM trusted_rooms WHERE telegram_chat_id = $1 AND is_active = TRUE",
    [chatId]
  );
  if (result.rows.length === 0) return null;
  return mapRoomRow(result.rows[0]);
}

export async function listTrustedRooms(): Promise<TrustedRoom[]> {
  const result = await query(
    "SELECT * FROM trusted_rooms ORDER BY created_at DESC"
  );
  return result.rows.map(mapRoomRow);
}

// ── Update ───────────────────────────────────────────────────────────────

export async function updateTrustedRoom(
  roomId: string,
  adminId: string,
  updates: {
    name?: string;
    defaultTrustScore?: number;
    maxMembers?: number;
    membershipCutoff?: string;
  }
): Promise<TrustedRoom> {
  const setClauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    params.push(updates.name);
  }
  if (updates.defaultTrustScore !== undefined) {
    setClauses.push(`default_trust_score = $${paramIdx++}`);
    params.push(updates.defaultTrustScore);
  }
  if (updates.maxMembers !== undefined) {
    setClauses.push(`max_members = $${paramIdx++}`);
    params.push(updates.maxMembers);
  }
  if (updates.membershipCutoff !== undefined) {
    setClauses.push(`membership_cutoff = $${paramIdx++}`);
    params.push(updates.membershipCutoff);
  }

  params.push(roomId);

  const result = await query(
    `UPDATE trusted_rooms SET ${setClauses.join(", ")}
     WHERE id = $${paramIdx}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) throw new Error("Trusted room not found");

  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [
      adminId,
      "trusted_room_updated",
      JSON.stringify({ roomId, updates }),
    ]
  );

  return mapRoomRow(result.rows[0]);
}

// ── Deactivate / Reactivate ──────────────────────────────────────────────

export async function deactivateTrustedRoom(
  roomId: string,
  adminId: string,
  reason: string
): Promise<TrustedRoom> {
  const result = await query(
    `UPDATE trusted_rooms
     SET is_active = FALSE, deactivated_by = $1, deactivated_at = NOW(),
         deactivation_reason = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [adminId, reason, roomId]
  );

  if (result.rows.length === 0) throw new Error("Trusted room not found");

  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [
      adminId,
      "trusted_room_deactivated",
      JSON.stringify({ roomId, reason }),
    ]
  );

  logger.info("TrustedRooms", `Room ${roomId} deactivated by ${adminId}: ${reason}`);
  return mapRoomRow(result.rows[0]);
}

export async function reactivateTrustedRoom(
  roomId: string,
  adminId: string
): Promise<TrustedRoom> {
  const result = await query(
    `UPDATE trusted_rooms
     SET is_active = TRUE, deactivated_by = NULL, deactivated_at = NULL,
         deactivation_reason = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [roomId]
  );

  if (result.rows.length === 0) throw new Error("Trusted room not found");

  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [adminId, "trusted_room_reactivated", JSON.stringify({ roomId })],
  );

  logger.info("TrustedRooms", `Room ${roomId} reactivated by ${adminId}`);
  return mapRoomRow(result.rows[0]);
}

// ── Admissions ───────────────────────────────────────────────────────────

export async function recordAdmission(
  roomId: string,
  userId: string,
  telegramUserId?: number
): Promise<TrustedRoomAdmission> {
  // Check room is active and within cap
  const room = await getTrustedRoom(roomId);
  if (!room) throw new Error("Trusted room not found");
  if (!room.isActive) throw new Error("Trusted room is not active");
  if (room.maxMembers > 0 && room.admittedCount >= room.maxMembers) {
    throw new Error("Trusted room member cap reached");
  }

  const result = await query(
    `INSERT INTO trusted_room_admissions (trusted_room_id, user_id, telegram_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (trusted_room_id, user_id) DO NOTHING
     RETURNING *`,
    [roomId, userId, telegramUserId || null]
  );

  // Increment admitted_count
  if (result.rows.length > 0) {
    await query(
      "UPDATE trusted_rooms SET admitted_count = admitted_count + 1, updated_at = NOW() WHERE id = $1",
      [roomId]
    );
  }

  return result.rows.length > 0
    ? mapAdmissionRow(result.rows[0])
    : { id: "", trustedRoomId: roomId, userId, telegramUserId: telegramUserId || null, admittedAt: new Date().toISOString() };
}

export async function getAdmissions(
  roomId: string
): Promise<TrustedRoomAdmission[]> {
  const result = await query(
    `SELECT * FROM trusted_room_admissions
     WHERE trusted_room_id = $1
     ORDER BY admitted_at DESC`,
    [roomId]
  );
  return result.rows.map(mapAdmissionRow);
}

// ── Auto-deactivation check ─────────────────────────────────────────────

export async function checkAutoDeactivation(
  trustedRoomId: string
): Promise<boolean> {
  const bannedCount = await query(
    `SELECT COUNT(*) AS cnt FROM trusted_room_admissions tra
     JOIN users u ON u.id = tra.user_id
     WHERE tra.trusted_room_id = $1 AND u.is_banned = TRUE`,
    [trustedRoomId]
  );

  const count = parseInt(bannedCount.rows[0].cnt, 10);
  if (count >= AUTO_DEACTIVATE_THRESHOLD) {
    await query(
      `UPDATE trusted_rooms
       SET is_active = FALSE, deactivated_at = NOW(),
           deactivation_reason = 'Auto-deactivated: too many banned members'
       WHERE id = $1 AND is_active = TRUE`,
      [trustedRoomId]
    );

    await query(
      `INSERT INTO audit_log (user_id, event_type, details)
       VALUES (NULL, $1, $2)`,
      [
        "trusted_room_auto_deactivated",
        JSON.stringify({ roomId: trustedRoomId, bannedCount: count }),
      ]
    );

    logger.info(
      "TrustedRooms",
      `Room ${trustedRoomId} auto-deactivated: ${count} banned members`
    );
    return true;
  }
  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function mapRoomRow(row: any): TrustedRoom {
  return {
    id: row.id,
    sourceType: row.source_type,
    telegramChatId: row.telegram_chat_id ? parseInt(row.telegram_chat_id, 10) : null,
    conversationId: row.conversation_id,
    name: row.name,
    createdBy: row.created_by,
    defaultTrustScore: parseFloat(row.default_trust_score),
    membershipCutoff: row.membership_cutoff,
    maxMembers: row.max_members,
    admittedCount: row.admitted_count,
    isActive: row.is_active,
    deactivatedBy: row.deactivated_by,
    deactivatedAt: row.deactivated_at,
    deactivationReason: row.deactivation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdmissionRow(row: any): TrustedRoomAdmission {
  return {
    id: row.id,
    trustedRoomId: row.trusted_room_id,
    userId: row.user_id,
    telegramUserId: row.telegram_user_id ? parseInt(row.telegram_user_id, 10) : null,
    admittedAt: row.admitted_at,
  };
}
