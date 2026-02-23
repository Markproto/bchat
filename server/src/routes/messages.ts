/**
 * Messaging API Routes
 *
 * POST /api/messages/conversations         — Create a new conversation
 * GET  /api/messages/conversations         — List user's conversations
 * POST /api/messages/conversations/:id/send — Send an encrypted message
 * GET  /api/messages/conversations/:id      — Get messages in a conversation
 * POST /api/messages/keys/exchange          — Exchange encryption keys
 */

import { Router, Request, Response } from 'express';
import { verifyToken, extractBearerToken } from '../auth/jwt';
import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * Middleware: extract and verify JWT from all message routes.
 */
function requireAuth(req: Request, res: Response, next: Function) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = verifyToken(token);
    (req as any).userId = payload.userId;
    (req as any).telegramId = payload.telegramId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.use(requireAuth);

/**
 * POST /api/messages/conversations
 * Create a direct or group conversation.
 */
router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const { type, name, memberIds } = req.body;
    const userId = (req as any).userId;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'memberIds required' });
    }

    // For direct messages, ensure exactly 2 participants
    if (type === 'direct' && memberIds.length !== 1) {
      return res.status(400).json({ error: 'Direct messages require exactly one other member' });
    }

    const conversationId = uuidv4();

    await query(
      'INSERT INTO conversations (id, type, name) VALUES ($1, $2, $3)',
      [conversationId, type || 'direct', name]
    );

    // Add creator as admin
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [conversationId, userId]
    );

    // Add other members
    for (const memberId of memberIds) {
      await query(
        `INSERT INTO conversation_members (conversation_id, user_id, role)
         VALUES ($1, $2, 'member')`,
        [conversationId, memberId]
      );
    }

    res.json({ conversationId, type: type || 'direct' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/messages/conversations
 * List all conversations the user is part of.
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const result = await query(
      `SELECT c.id, c.type, c.name, c.updated_at,
              cm.role,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = $1
       ORDER BY c.updated_at DESC`,
      [userId]
    );

    res.json({ conversations: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/messages/conversations/:id/send
 * Send an encrypted message (server stores only ciphertext).
 */
router.post('/conversations/:id/send', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.id;
    const { ciphertext, nonce, contentType } = req.body;

    if (!ciphertext || !nonce) {
      return res.status(400).json({ error: 'ciphertext and nonce required' });
    }

    // Verify membership
    const membership = await query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    // Store encrypted message
    const result = await query(
      `INSERT INTO messages (conversation_id, sender_id, ciphertext, nonce, content_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, sequence_num, created_at`,
      [conversationId, userId, ciphertext, nonce, contentType || 'text']
    );

    // Update conversation timestamp
    await query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

    res.json({
      messageId: result.rows[0].id,
      sequenceNum: result.rows[0].sequence_num,
      createdAt: result.rows[0].created_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/messages/conversations/:id
 * Retrieve encrypted messages (client decrypts locally).
 */
router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.id;
    const after = req.query.after; // sequence_num for pagination

    // Verify membership
    const membership = await query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    let sql = `SELECT m.id, m.sender_id, m.ciphertext, m.nonce, m.content_type,
                      m.sequence_num, m.created_at,
                      u.telegram_username as sender_username
               FROM messages m
               JOIN users u ON u.id = m.sender_id
               WHERE m.conversation_id = $1`;
    const params: any[] = [conversationId];

    if (after) {
      sql += ' AND m.sequence_num > $2';
      params.push(after);
    }

    sql += ' ORDER BY m.sequence_num ASC LIMIT 100';

    const result = await query(sql, params);
    res.json({ messages: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/messages/keys/exchange
 * Exchange encryption public keys between users.
 */
router.post('/keys/exchange', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { encryptionPubkey } = req.body;

    if (!encryptionPubkey) {
      return res.status(400).json({ error: 'encryptionPubkey required' });
    }

    // Store user's X25519 public key
    await query(
      'UPDATE users SET encryption_pubkey = $1 WHERE id = $2',
      [encryptionPubkey, userId]
    );

    res.json({ stored: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
