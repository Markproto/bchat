/**
 * Safe Support API Routes — Phase 9
 *
 * In-app support tickets with cryptographic admin verification.
 * Users never receive support via DMs — only through this system.
 */

import { Router, Response } from "express";
import {
  authenticate,
  requireAdmin,
  requireVerifiedAdmin,
  AuthenticatedRequest,
} from "../middleware/authenticate";
import { createRateLimit } from "../middleware/rateLimit";
import {
  createTicket,
  getTicket,
  getUserTickets,
  getAdminQueue,
  assignTicket,
  updateTicketStatus,
  updateTicketPriority,
  sendTicketMessage,
  getTicketMessages,
  createVerificationChallenge,
  verifyChallenge,
  getTicketEvents,
} from "../support/engine";
import { logger } from "../utils/logger";

const router = Router();

const ticketCreateLimit = createRateLimit({
  max: 5,
  keyPrefix: "ticket-create",
  message: "Too many tickets created. Please wait before creating another.",
  duration: 3600,
});

// ===========================================
// POST /api/support/tickets
// Create a new support ticket
// ===========================================
router.post(
  "/tickets",
  authenticate,
  ticketCreateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { category, subject, priority } = req.body;

      if (!category || !subject) {
        res.status(400).json({ error: "Missing category or subject" });
        return;
      }

      const ticket = await createTicket(
        req.user!.id,
        category,
        subject,
        priority
      );

      res.status(201).json({ ticket });
    } catch (err: any) {
      logger.error("SupportRoutes", `Create ticket error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/support/tickets
// List your support tickets
// ===========================================
router.get(
  "/tickets",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tickets = await getUserTickets(req.user!.id);
      res.json({ tickets });
    } catch (err: any) {
      logger.error("SupportRoutes", `List tickets error: ${err.message}`);
      res.status(500).json({ error: "Failed to list tickets" });
    }
  }
);

// ===========================================
// GET /api/support/admin/queue
// Admin: get open tickets sorted by priority
// ===========================================
router.get(
  "/admin/queue",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const tickets = await getAdminQueue(status);
      res.json({ tickets });
    } catch (err: any) {
      logger.error("SupportRoutes", `Admin queue error: ${err.message}`);
      res.status(500).json({ error: "Failed to get ticket queue" });
    }
  }
);

// ===========================================
// GET /api/support/tickets/:ticketId
// Get ticket details (owner or admin)
// ===========================================
router.get(
  "/tickets/:ticketId",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ticket = await getTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      // Only ticket owner or admin can view
      if (ticket.userId !== req.user!.id && !req.user!.isAdmin) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      res.json({ ticket });
    } catch (err: any) {
      logger.error("SupportRoutes", `Get ticket error: ${err.message}`);
      res.status(500).json({ error: "Failed to get ticket" });
    }
  }
);

// ===========================================
// POST /api/support/tickets/:ticketId/assign
// Admin: assign self to a ticket
// ===========================================
router.post(
  "/tickets/:ticketId/assign",
  authenticate,
  requireVerifiedAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ticket = await assignTicket(req.params.ticketId, req.user!.id);
      res.json({ ticket });
    } catch (err: any) {
      logger.error("SupportRoutes", `Assign ticket error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/support/tickets/:ticketId/status
// Update ticket status (owner or admin)
// ===========================================
router.post(
  "/tickets/:ticketId/status",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body;
      if (!status) {
        res.status(400).json({ error: "Missing status" });
        return;
      }

      // Verify access
      const existing = await getTicket(req.params.ticketId);
      if (!existing) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      // Users can only close their own tickets; admins can change any status
      if (!req.user!.isAdmin) {
        if (existing.userId !== req.user!.id) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
        if (status !== "closed") {
          res.status(403).json({ error: "Users can only close their own tickets" });
          return;
        }
      }

      const ticket = await updateTicketStatus(
        req.params.ticketId,
        req.user!.id,
        status
      );
      res.json({ ticket });
    } catch (err: any) {
      logger.error("SupportRoutes", `Update status error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/support/tickets/:ticketId/priority
// Admin: update ticket priority
// ===========================================
router.post(
  "/tickets/:ticketId/priority",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { priority } = req.body;
      if (!priority) {
        res.status(400).json({ error: "Missing priority" });
        return;
      }

      const ticket = await updateTicketPriority(
        req.params.ticketId,
        req.user!.id,
        priority
      );
      res.json({ ticket });
    } catch (err: any) {
      logger.error("SupportRoutes", `Update priority error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/support/tickets/:ticketId/messages
// Send E2EE message in ticket
// ===========================================
router.post(
  "/tickets/:ticketId/messages",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ciphertext, nonce, sender_public_key, message_type } = req.body;

      if (!ciphertext || !nonce || !sender_public_key) {
        res.status(400).json({
          error: "Missing required fields: ciphertext, nonce, sender_public_key",
        });
        return;
      }

      // Verify access
      const ticket = await getTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (ticket.userId !== req.user!.id && ticket.assignedAdminId !== req.user!.id) {
        res.status(403).json({ error: "Only ticket owner or assigned admin can send messages" });
        return;
      }

      const message = await sendTicketMessage(req.params.ticketId, req.user!.id, {
        ciphertext,
        nonce,
        senderPublicKey: sender_public_key,
        messageType: message_type,
      });

      res.status(201).json({ message });
    } catch (err: any) {
      logger.error("SupportRoutes", `Send message error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/support/tickets/:ticketId/messages
// Get ticket messages
// ===========================================
router.get(
  "/tickets/:ticketId/messages",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ticket = await getTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (ticket.userId !== req.user!.id && !req.user!.isAdmin) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const before = req.query.before as string | undefined;

      const messages = await getTicketMessages(
        req.params.ticketId,
        limit,
        before
      );

      res.json({ messages });
    } catch (err: any) {
      logger.error("SupportRoutes", `Get messages error: ${err.message}`);
      res.status(500).json({ error: "Failed to get messages" });
    }
  }
);

// ===========================================
// POST /api/support/tickets/:ticketId/verify
// User requests admin identity verification
// ===========================================
router.post(
  "/tickets/:ticketId/verify",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ticket = await getTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      // Only ticket owner can request verification
      if (ticket.userId !== req.user!.id) {
        res.status(403).json({ error: "Only the ticket owner can request admin verification" });
        return;
      }

      if (!ticket.assignedAdminId) {
        res.status(400).json({ error: "No admin assigned yet" });
        return;
      }

      if (ticket.adminVerified) {
        res.status(400).json({ error: "Admin already verified on this ticket" });
        return;
      }

      const challenge = await createVerificationChallenge(
        req.params.ticketId,
        ticket.assignedAdminId
      );

      res.json({
        challengeId: challenge.id,
        nonce: challenge.nonce,
        adminId: challenge.adminId,
        expiresAt: challenge.expiresAt,
        message: "Challenge sent to admin. They must sign this nonce with their ed25519 key.",
      });
    } catch (err: any) {
      logger.error("SupportRoutes", `Verify request error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/support/tickets/:ticketId/verify/confirm
// Admin submits signed challenge to prove identity
// ===========================================
router.post(
  "/tickets/:ticketId/verify/confirm",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { challenge_id, signature } = req.body;

      if (!challenge_id || !signature) {
        res.status(400).json({ error: "Missing challenge_id or signature" });
        return;
      }

      const result = await verifyChallenge(challenge_id, signature);

      if (!result.verified) {
        res.status(400).json({
          error: "Verification failed",
          reason: result.reason,
        });
        return;
      }

      res.json({
        verified: true,
        message: "Admin identity cryptographically verified.",
      });
    } catch (err: any) {
      logger.error("SupportRoutes", `Verify confirm error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/support/tickets/:ticketId/events
// Get ticket audit log (owner or admin)
// ===========================================
router.get(
  "/tickets/:ticketId/events",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ticket = await getTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (ticket.userId !== req.user!.id && !req.user!.isAdmin) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const events = await getTicketEvents(req.params.ticketId);
      res.json({ events });
    } catch (err: any) {
      logger.error("SupportRoutes", `Get events error: ${err.message}`);
      res.status(500).json({ error: "Failed to get ticket events" });
    }
  }
);

export default router;
