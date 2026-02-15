/**
 * In-App Support Routes
 *
 * CRITICAL ANTI-SCAM RULE: All support happens ONLY inside bchat.
 * Admins will NEVER DM users on Telegram. The app enforces this by:
 *   1. Support tickets can only be created inside the app
 *   2. Support conversations are tagged and verified
 *   3. The admin in a support chat must pass real-time identity verification
 *   4. Users see a prominent warning: "bchat admins will NEVER message you on Telegram"
 *
 * POST /api/support/ticket           — User opens a support ticket
 * GET  /api/support/tickets          — List user's tickets (or all tickets for admins)
 * POST /api/support/ticket/:id/assign — Admin claims a ticket
 * POST /api/support/ticket/:id/verify — User requests admin identity proof mid-chat
 * POST /api/support/ticket/:id/close  — Close a ticket
 */

import { Router, Request, Response } from 'express';
import { verifyToken, extractBearerToken } from '../auth/jwt';
import { verifyAdmin } from '../admin/verification';
import { ChallengeStore, verifySignedChallenge } from '../crypto/challenge';
import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const challengeStore = new ChallengeStore();

/**
 * Middleware: require authentication
 */
function requireAuth(req: Request, res: Response, next: Function) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = verifyToken(token);
    (req as any).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.use(requireAuth);

/**
 * POST /api/support/ticket
 * User opens a support ticket. Creates a dedicated E2EE conversation.
 */
router.post('/ticket', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { subject } = req.body;

    // Create a dedicated conversation for this ticket
    const conversationId = uuidv4();
    await query(
      "INSERT INTO conversations (id, type, name) VALUES ($1, 'support', $2)",
      [conversationId, subject || 'Support Request']
    );

    // Add user as member
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [conversationId, userId]
    );

    // Create ticket
    const ticketId = uuidv4();
    await query(
      `INSERT INTO support_tickets (id, user_id, conversation_id, subject)
       VALUES ($1, $2, $3, $4)`,
      [ticketId, userId, conversationId, subject]
    );

    res.json({
      ticketId,
      conversationId,
      status: 'open',
      message: 'Your support ticket has been created. A verified admin will respond shortly.',
      warning: 'REMINDER: bchat admins will NEVER contact you on Telegram. If someone on Telegram claims to be bchat support, they are a scammer.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/support/tickets
 * List tickets. Users see their own; admins see all open tickets.
 */
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    // Check if user is admin
    const user = await query('SELECT role FROM users WHERE id = $1', [userId]);
    const isAdmin = user.rows[0]?.role === 'creator' || user.rows[0]?.role === 'admin';

    let tickets;
    if (isAdmin) {
      tickets = await query(
        `SELECT st.*, u.telegram_username as user_username, u.first_name as user_name,
                a.telegram_username as admin_username
         FROM support_tickets st
         JOIN users u ON u.id = st.user_id
         LEFT JOIN users a ON a.id = st.assigned_admin
         WHERE st.status != 'closed'
         ORDER BY st.created_at ASC`
      );
    } else {
      tickets = await query(
        `SELECT st.*, a.telegram_username as admin_username, a.first_name as admin_name
         FROM support_tickets st
         LEFT JOIN users a ON a.id = st.assigned_admin
         WHERE st.user_id = $1
         ORDER BY st.created_at DESC`,
        [userId]
      );
    }

    res.json({ tickets: tickets.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/support/ticket/:id/assign
 * Admin claims a support ticket. Must be a verified admin.
 */
router.post('/ticket/:id/assign', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;

    // Verify this user is actually an admin (cryptographic check)
    const verification = await verifyAdmin(adminId);
    if (!verification.isAdmin) {
      return res.status(403).json({ error: 'Only verified admins can handle support tickets' });
    }

    const ticketId = req.params.id;
    const ticket = await query(
      'SELECT * FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    if (ticket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Add admin to the support conversation
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [ticket.rows[0].conversation_id, adminId]
    );

    // Assign ticket
    await query(
      `UPDATE support_tickets SET assigned_admin = $1, status = 'assigned', updated_at = NOW()
       WHERE id = $2`,
      [adminId, ticketId]
    );

    res.json({
      success: true,
      ticketId,
      assignedAdmin: adminId,
      adminRole: verification.role,
      adminChainVerified: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/support/ticket/:id/verify
 * User requests real-time identity proof from the admin in their support chat.
 *
 * This is the key anti-impersonation feature:
 *   1. User clicks "Verify Admin" button in the support chat
 *   2. Server issues a challenge nonce
 *   3. Admin's app automatically signs it with their ed25519 key
 *   4. Server verifies: signature valid + pubkey matches admin chain
 *   5. User sees a green "Admin Verified" badge with the full chain
 *
 * This happens automatically on every support session start and can
 * be triggered manually at any time by the user.
 */
router.post('/ticket/:id/verify', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const ticketId = req.params.id;

    // Get the ticket and assigned admin
    const ticket = await query(
      `SELECT st.*, u.identity_pubkey as admin_pubkey
       FROM support_tickets st
       JOIN users u ON u.id = st.assigned_admin
       WHERE st.id = $1 AND st.user_id = $2`,
      [ticketId, userId]
    );

    if (ticket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found or not your ticket' });
    }

    if (!ticket.rows[0].assigned_admin) {
      return res.status(400).json({ error: 'No admin assigned yet' });
    }

    const adminId = ticket.rows[0].assigned_admin;

    // Check if client sent a signed challenge (admin responding to verification)
    const { challengeId, signature } = req.body;

    if (challengeId && signature) {
      // Admin has signed the challenge — verify it
      const challenge = challengeStore.consume(challengeId);
      if (!challenge) {
        return res.status(400).json({ error: 'Invalid or expired challenge' });
      }

      const sigResult = await verifySignedChallenge(
        challenge,
        signature,
        ticket.rows[0].admin_pubkey
      );

      if (!sigResult.valid) {
        return res.status(401).json({
          verified: false,
          error: 'Admin signature verification FAILED — this may not be a real admin',
          reason: sigResult.reason,
        });
      }

      // Also verify the full admin chain
      const adminVerification = await verifyAdmin(adminId);

      // Log the successful verification
      await query(
        `INSERT INTO audit_log (user_id, event_type, details)
         VALUES ($1, $2, $3)`,
        [userId, 'admin_identity_verified', JSON.stringify({
          ticketId,
          adminId,
          chainLength: adminVerification.verifiedChain.length,
        })]
      );

      return res.json({
        verified: true,
        admin: {
          userId: adminId,
          role: adminVerification.role,
          chainVerified: adminVerification.isAdmin,
          chainLength: adminVerification.verifiedChain.length,
          rootCreatorPubkey: adminVerification.rootCreatorPubkey,
        },
        message: 'Admin identity cryptographically verified. This is a real bchat admin.',
      });
    }

    // No signature yet — issue a challenge for the admin to sign
    const challenge = challengeStore.issue('support_admin_verify');

    res.json({
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      adminId,
      message: 'Challenge issued. The admin must sign this to prove their identity.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/support/ticket/:id/close
 * Close a support ticket.
 */
router.post('/ticket/:id/close', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const ticketId = req.params.id;

    // Either the user or the assigned admin can close
    const ticket = await query(
      'SELECT * FROM support_tickets WHERE id = $1 AND (user_id = $2 OR assigned_admin = $2)',
      [ticketId, userId]
    );
    if (ticket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    await query(
      "UPDATE support_tickets SET status = 'closed', updated_at = NOW() WHERE id = $1",
      [ticketId]
    );

    res.json({ success: true, status: 'closed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
