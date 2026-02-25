/**
 * E2EE Messaging API Routes — Phase 8
 *
 * Server-side endpoints for the E2EE message flow.
 * The server stores only encrypted envelopes — it can never
 * read message content.
 *
 * Integrates with:
 *   - Phase 6: Cooling period (enforceCooling middleware)
 *   - Phase 7: Scam detection (scanMessage on plaintext hint)
 */

import { Router, Response } from "express";
import {
  authenticate,
  AuthenticatedRequest,
} from "../middleware/authenticate";
import { enforceCooling } from "../middleware/coolingPeriod";
import { scanMessage } from "../scam/detector";
import { createRateLimit } from "../middleware/rateLimit";
import { query } from "../db/pool";
import { logger } from "../utils/logger";
import { broadcastToUser } from "../ws";

const router = Router();

const sendLimit = createRateLimit({
  max: 30,
  keyPrefix: "msg-send",
  message: "Too many messages. Slow down.",
  duration: 60,
});

// ===========================================
// POST /api/messages/keys/register
// Register or update encryption public key
// ===========================================
router.post(
  "/keys/register",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { encryption_public_key } = req.body;
      if (!encryption_public_key) {
        res.status(400).json({ error: "Missing encryption_public_key" });
        return;
      }

      // Validate base64 format and length (curve25519 = 32 bytes = 44 base64 chars)
      if (typeof encryption_public_key !== "string" || encryption_public_key.length > 64) {
        res.status(400).json({ error: "Invalid encryption public key format" });
        return;
      }

      await query(
        `UPDATE users SET encryption_pubkey = $1, updated_at = NOW()
         WHERE id = $2`,
        [encryption_public_key, req.user!.id]
      );

      logger.info("Messages", `Encryption key registered for user ${req.user!.id}`);
      res.json({ message: "Encryption key registered" });
    } catch (err: any) {
      logger.error("Messages", `Key register error: ${err.message}`);
      res.status(500).json({ error: "Failed to register encryption key" });
    }
  }
);

// ===========================================
// GET /api/messages/keys/:userId
// Get a user's encryption public key
// ===========================================
router.get(
  "/keys/:userId",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await query(
        `SELECT encryption_pubkey FROM users
         WHERE id = $1 AND is_active = true AND is_banned = false`,
        [req.params.userId]
      );

      if (result.rows.length === 0 || !result.rows[0].encryption_pubkey) {
        res.status(404).json({ error: "Encryption key not found for this user" });
        return;
      }

      res.json({ encryptionPublicKey: result.rows[0].encryption_pubkey });
    } catch (err: any) {
      logger.error("Messages", `Key lookup error: ${err.message}`);
      res.status(500).json({ error: "Failed to get encryption key" });
    }
  }
);

// ===========================================
// POST /api/messages/send
// Send an encrypted message
//
// Body:
//   recipient_id: string
//   ciphertext: string (base64)
//   nonce: string (base64)
//   sender_public_key: string (base64)
//   message_type: "text" | "image" | "file"
//   content?: string (plaintext hint for cooling/scam — NOT stored)
// ===========================================
router.post(
  "/send",
  authenticate,
  sendLimit,
  enforceCooling,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        recipient_id,
        ciphertext,
        nonce,
        sender_public_key,
        message_type,
        content,
      } = req.body;

      if (!recipient_id || !ciphertext || !nonce || !sender_public_key) {
        res.status(400).json({
          error: "Missing required fields: recipient_id, ciphertext, nonce, sender_public_key",
        });
        return;
      }

      // Verify recipient exists and is active
      const recipientCheck = await query(
        `SELECT id, encryption_pubkey FROM users
         WHERE id = $1 AND is_active = true AND is_banned = false`,
        [recipient_id]
      );
      if (recipientCheck.rows.length === 0) {
        res.status(404).json({ error: "Recipient not found or unavailable" });
        return;
      }

      // Run scam detection on the plaintext hint (if provided)
      // This content is NEVER stored — only used for real-time protection
      let scamResult = null;
      if (content && typeof content === "string") {
        scamResult = await scanMessage(content, req.user!.id, recipient_id);
      }

      // Find or create direct conversation
      const conversationId = await getOrCreateDirectConversation(
        req.user!.id,
        recipient_id
      );

      // Store the encrypted envelope (server cannot decrypt this)
      const msgResult = await query(
        `INSERT INTO messages
         (conversation_id, sender_id, ciphertext, nonce, sender_public_key, content_type, message_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, sequence_num, created_at`,
        [
          conversationId,
          req.user!.id,
          ciphertext,
          nonce,
          sender_public_key,
          message_type || "text",
          message_type || "text",
        ]
      );

      const msg = msgResult.rows[0];

      // If scam was detected, update the alert with the message ID
      if (scamResult && scamResult.triggered) {
        await query(
          `UPDATE scam_alerts SET message_id = $1
           WHERE sender_id = $2 AND recipient_id = $3 AND message_id IS NULL
             AND created_at > NOW() - INTERVAL '5 seconds'`,
          [msg.id, req.user!.id, recipient_id]
        );
      }

      // Push encrypted envelope to recipient via WebSocket (real-time delivery)
      broadcastToUser(recipient_id, {
        type: 'new_message',
        messageId: msg.id,
        conversationId,
        senderId: req.user!.id,
        ciphertext,
        nonce,
        senderPublicKey: sender_public_key,
        contentType: message_type || 'text',
        sequenceNum: msg.sequence_num,
        createdAt: msg.created_at,
      });

      // Also notify sender's other devices so they stay in sync
      broadcastToUser(req.user!.id, {
        type: 'message_sent',
        messageId: msg.id,
        conversationId,
        recipientId: recipient_id,
        sequenceNum: msg.sequence_num,
        createdAt: msg.created_at,
      });

      res.status(201).json({
        messageId: msg.id,
        conversationId,
        sequenceNum: msg.sequence_num,
        createdAt: msg.created_at,
        scamWarning: scamResult?.triggered
          ? {
              matchCount: scamResult.matches.length,
              severity: scamResult.matches[0]?.severity,
            }
          : null,
      });
    } catch (err: any) {
      logger.error("Messages", `Send error: ${err.message}`);
      res.status(500).json({ error: "Failed to send message" });
    }
  }
);

// ===========================================
// GET /api/messages/conversation/:conversationId
// Get messages in a conversation (paginated)
// ===========================================
router.get(
  "/conversation/:conversationId",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Verify user is a member of this conversation
      const membership = await query(
        `SELECT 1 FROM conversation_members
         WHERE conversation_id = $1 AND user_id = $2`,
        [req.params.conversationId, req.user!.id]
      );

      if (membership.rows.length === 0) {
        res.status(403).json({ error: "Not a member of this conversation" });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const before = req.query.before as string; // sequence_num cursor

      let queryStr = `
        SELECT id, sender_id, ciphertext, nonce, sender_public_key,
               content_type, message_type, sequence_num, created_at
        FROM messages
        WHERE conversation_id = $1`;
      const params: unknown[] = [req.params.conversationId];

      if (before) {
        queryStr += ` AND sequence_num < $2`;
        params.push(parseInt(before, 10));
      }

      queryStr += ` ORDER BY sequence_num DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await query(queryStr, params);

      // Return in chronological order
      const messages = result.rows.reverse().map((row: any) => ({
        id: row.id,
        senderId: row.sender_id,
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        senderPublicKey: row.sender_public_key,
        contentType: row.content_type,
        messageType: row.message_type,
        sequenceNum: row.sequence_num,
        createdAt: row.created_at,
      }));

      res.json({
        messages,
        hasMore: result.rows.length === limit,
      });
    } catch (err: any) {
      logger.error("Messages", `Conversation fetch error: ${err.message}`);
      res.status(500).json({ error: "Failed to get messages" });
    }
  }
);

// ===========================================
// GET /api/messages/conversations
// List conversations for the authenticated user
// ===========================================
router.get(
  "/conversations",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await query(
        `SELECT c.id, c.type, c.name, c.updated_at,
                cm.role AS my_role
         FROM conversations c
         JOIN conversation_members cm ON cm.conversation_id = c.id
         WHERE cm.user_id = $1
         ORDER BY c.updated_at DESC
         LIMIT 50`,
        [req.user!.id]
      );

      res.json({ conversations: result.rows });
    } catch (err: any) {
      logger.error("Messages", `List conversations error: ${err.message}`);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Get or create a direct conversation between two users.
 * Returns the conversation ID.
 */
async function getOrCreateDirectConversation(
  userA: string,
  userB: string
): Promise<string> {
  // Check if a direct conversation already exists between these two
  const existing = await query(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = $1
     JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = $2
     WHERE c.type = 'direct'
     LIMIT 1`,
    [userA, userB]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create new direct conversation
  const conv = await query(
    `INSERT INTO conversations (type) VALUES ('direct') RETURNING id`
  );
  const convId = conv.rows[0].id;

  // Add both members
  await query(
    `INSERT INTO conversation_members (conversation_id, user_id, role)
     VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
    [convId, userA, userB]
  );

  return convId;
}

export default router;
