import { Router, Response } from "express";
import {
  authenticate,
  requireAdmin,
  requireVerifiedAdmin,
  AuthenticatedRequest,
} from "../middleware/authenticate";
import { createRateLimit } from "../middleware/rateLimit";
import {
  getTrustProfile,
  banUser,
  recalculateTrustScore,
  getTrustLeaderboard,
  flagUser,
  getPlatformStats,
} from "../trust/engine";
import { logger } from "../utils/logger";

const router = Router();

const banLimit = createRateLimit({
  max: 5,
  keyPrefix: "ban-action",
  message: "Too many ban actions.",
});

// ===========================================
// GET /api/trust/profile/:userId
// Get trust profile for any user (authenticated)
// ===========================================
router.get(
  "/profile/:userId",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const profile = await getTrustProfile(req.params.userId);
      if (!profile) {
        res.status(404).json({ error: "User not found or banned" });
        return;
      }
      res.json({ profile });
    } catch (err: any) {
      logger.error("Get trust profile error:", err.message);
      res.status(500).json({ error: "Failed to get trust profile" });
    }
  }
);

// ===========================================
// GET /api/trust/me
// Get your own trust profile
// ===========================================
router.get(
  "/me",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const profile = await getTrustProfile(req.user!.id);
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      res.json({ profile });
    } catch (err: any) {
      logger.error("Get own trust profile error:", err.message);
      res.status(500).json({ error: "Failed to get trust profile" });
    }
  }
);

// ===========================================
// POST /api/trust/ban
// Ban a user (admin only) — triggers cascade
// ===========================================
router.post(
  "/ban",
  authenticate,
  requireVerifiedAdmin,
  banLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { target_user_id, reason } = req.body;
      if (!target_user_id || !reason) {
        res.status(400).json({
          error: "Missing target_user_id or reason",
        });
        return;
      }

      // Prevent banning yourself
      if (target_user_id === req.user!.id) {
        res.status(400).json({ error: "Cannot ban yourself" });
        return;
      }

      // Prevent banning other admins (must revoke first)
      const target = await getTrustProfile(target_user_id);
      if (target && target.isAdmin) {
        res.status(400).json({
          error: "Cannot ban an admin. Revoke admin status first.",
        });
        return;
      }

      const result = await banUser(
        target_user_id,
        req.user!.id,
        reason
      );

      res.json({
        message: "User banned successfully",
        ban: {
          username: result.bannedUsername,
          deviceBanned: result.deviceBanned,
          cascadeLevels: result.cascadeResults.length,
          cascade: result.cascadeResults.map((r) => ({
            username: r.username,
            level: r.level,
            previousScore: r.previousScore,
            newScore: r.newScore,
            inviteRevoked: r.inviteRevoked,
          })),
        },
      });
    } catch (err: any) {
      logger.error("Ban user error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/trust/flag
// Flag a user for suspicious behavior
// ===========================================
router.post(
  "/flag",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { target_user_id, reason } = req.body;
      if (!target_user_id || !reason) {
        res.status(400).json({
          error: "Missing target_user_id or reason",
        });
        return;
      }

      await flagUser(req.user!.id, target_user_id, reason);
      res.json({ message: "User flagged successfully" });
    } catch (err: any) {
      logger.error("Flag user error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// POST /api/trust/recalculate/:userId
// Recalculate trust score (admin only)
// ===========================================
router.post(
  "/recalculate/:userId",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const newScore = await recalculateTrustScore(req.params.userId);
      res.json({
        userId: req.params.userId,
        newScore,
        riskLevel:
          newScore >= 0.8
            ? "trusted"
            : newScore >= 0.5
            ? "caution"
            : newScore > 0.3
            ? "warning"
            : "danger",
      });
    } catch (err: any) {
      logger.error("Recalculate trust error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/trust/leaderboard
// Top trusted users (public)
// ===========================================
router.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(
      parseInt(req.query.limit as string) || 20,
      100
    );
    const leaderboard = await getTrustLeaderboard(limit);
    res.json({ leaderboard });
  } catch (err: any) {
    logger.error("Leaderboard error:", err.message);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// ===========================================
// GET /api/trust/stats
// Platform trust statistics (admin only)
// ===========================================
router.get(
  "/stats",
  authenticate,
  requireAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getPlatformStats();
      res.json({ stats });
    } catch (err: any) {
      logger.error("Platform stats error:", err.message);
      res.status(500).json({ error: "Failed to get stats" });
    }
  }
);

export default router;
