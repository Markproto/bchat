/**
 * Trusted Rooms API Routes — Phase 10
 *
 * Admin endpoints for managing trusted room auto-access.
 * All endpoints require verified admin authentication.
 */

import { Router, Response } from "express";
import {
  authenticate,
  requireVerifiedAdmin,
  AuthenticatedRequest,
} from "../middleware/authenticate";
import { createRateLimit } from "../middleware/rateLimit";
import {
  createTrustedRoom,
  getTrustedRoom,
  listTrustedRooms,
  updateTrustedRoom,
  deactivateTrustedRoom,
  reactivateTrustedRoom,
  getAdmissions,
} from "../trustedRooms/engine";
import { logger } from "../utils/logger";

const router = Router();

const createLimit = createRateLimit({
  max: 5,
  keyPrefix: "trusted-room-create",
  message: "Too many trusted room creations. Please wait.",
  duration: 3600,
});

// ===========================================
// POST /api/trusted-rooms
// Designate a room as trusted
// ===========================================
router.post(
  "/",
  authenticate,
  requireVerifiedAdmin,
  createLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        source_type,
        telegram_chat_id,
        conversation_id,
        name,
        membership_cutoff,
        default_trust_score,
        max_members,
      } = req.body;

      if (!source_type || !name || !membership_cutoff) {
        res.status(400).json({
          error: "Missing required fields: source_type, name, membership_cutoff",
        });
        return;
      }

      if (!["telegram", "bchat"].includes(source_type)) {
        res.status(400).json({ error: "source_type must be 'telegram' or 'bchat'" });
        return;
      }

      const cutoffDate = new Date(membership_cutoff);
      if (isNaN(cutoffDate.getTime())) {
        res.status(400).json({ error: "Invalid membership_cutoff date" });
        return;
      }

      const room = await createTrustedRoom(req.user!.id, {
        sourceType: source_type,
        telegramChatId: telegram_chat_id,
        conversationId: conversation_id,
        name,
        membershipCutoff: cutoffDate.toISOString(),
        defaultTrustScore: default_trust_score,
        maxMembers: max_members,
      });

      res.status(201).json({ room });
    } catch (err: any) {
      logger.error("TrustedRoomRoutes", `Create error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/trusted-rooms
// List all trusted rooms
// ===========================================
router.get(
  "/",
  authenticate,
  requireVerifiedAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const rooms = await listTrustedRooms();
      res.json({ rooms });
    } catch (err: any) {
      logger.error("TrustedRoomRoutes", `List error: ${err.message}`);
      res.status(500).json({ error: "Failed to list trusted rooms" });
    }
  }
);

// ===========================================
// GET /api/trusted-rooms/:roomId
// Get room details
// ===========================================
router.get(
  "/:roomId",
  authenticate,
  requireVerifiedAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const room = await getTrustedRoom(req.params.roomId);
      if (!room) {
        res.status(404).json({ error: "Trusted room not found" });
        return;
      }
      res.json({ room });
    } catch (err: any) {
      logger.error("TrustedRoomRoutes", `Get error: ${err.message}`);
      res.status(500).json({ error: "Failed to get trusted room" });
    }
  }
);

// ===========================================
// PUT /api/trusted-rooms/:roomId
// Update room settings
// ===========================================
router.put(
  "/:roomId",
  authenticate,
  requireVerifiedAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, default_trust_score, max_members, membership_cutoff } = req.body;

      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (default_trust_score !== undefined) updates.defaultTrustScore = default_trust_score;
      if (max_members !== undefined) updates.maxMembers = max_members;
      if (membership_cutoff !== undefined) {
        const cutoffDate = new Date(membership_cutoff);
        if (isNaN(cutoffDate.getTime())) {
          res.status(400).json({ error: "Invalid membership_cutoff date" });
          return;
        }
        updates.membershipCutoff = cutoffDate.toISOString();
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      const room = await updateTrustedRoom(req.params.roomId, req.user!.id, updates);
      res.json({ room });
    } catch (err: any) {
      logger.error("TrustedRoomRoutes", `Update error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/trusted-rooms/:roomId/deactivate
// Deactivate a trusted room
// ===========================================
router.post(
  "/:roomId/deactivate",
  authenticate,
  requireVerifiedAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        res.status(400).json({ error: "Missing reason" });
        return;
      }

      const room = await deactivateTrustedRoom(req.params.roomId, req.user!.id, reason);
      res.json({ room });
    } catch (err: any) {
      logger.error("TrustedRoomRoutes", `Deactivate error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/trusted-rooms/:roomId/reactivate
// Reactivate a deactivated trusted room
// ===========================================
router.post(
  "/:roomId/reactivate",
  authenticate,
  requireVerifiedAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const room = await reactivateTrustedRoom(req.params.roomId, req.user!.id);
      res.json({ room });
    } catch (err: any) {
      logger.error("TrustedRoomRoutes", `Reactivate error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/trusted-rooms/:roomId/admissions
// List users admitted via this room
// ===========================================
router.get(
  "/:roomId/admissions",
  authenticate,
  requireVerifiedAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const room = await getTrustedRoom(req.params.roomId);
      if (!room) {
        res.status(404).json({ error: "Trusted room not found" });
        return;
      }

      const admissions = await getAdmissions(req.params.roomId);
      res.json({ admissions });
    } catch (err: any) {
      logger.error("TrustedRoomRoutes", `Admissions error: ${err.message}`);
      res.status(500).json({ error: "Failed to get admissions" });
    }
  }
);

export default router;
