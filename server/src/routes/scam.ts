/**
 * Scam Detection API Routes — Phase 7
 *
 * Endpoints for scanning messages, managing alerts, and
 * admin CRUD for scam patterns.
 */

import { Router, Response } from "express";
import {
  authenticate,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/authenticate";
import { createRateLimit } from "../middleware/rateLimit";
import {
  scanMessage,
  getAlertsForRecipient,
  dismissAlert,
  getPatterns,
  getPatternById,
  createPattern,
  updatePattern,
  deletePattern,
  getPatternStats,
} from "../scam/detector";
import { logger } from "../utils/logger";

const router = Router();

const scanLimit = createRateLimit({
  max: 60,
  keyPrefix: "scam-scan",
  message: "Too many scan requests.",
});

// ===========================================
// POST /api/scam/scan
// Scan message content for scam patterns
// ===========================================
router.post(
  "/scan",
  authenticate,
  scanLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content, recipient_id, message_id } = req.body;
      if (!content || !recipient_id) {
        res.status(400).json({ error: "Missing content or recipient_id" });
        return;
      }

      const result = await scanMessage(
        content,
        req.user!.id,
        recipient_id,
        message_id
      );

      res.json({
        triggered: result.triggered,
        matchCount: result.matches.length,
        compositeScore: result.compositeScore,
        autoRestricted: result.autoRestricted,
        matches: result.matches.map((m) => ({
          patternName: m.patternName,
          category: m.category,
          severity: m.severity,
          alertMessage: m.alertMessage,
        })),
      });
    } catch (err: any) {
      logger.error("ScamRoutes", `Scan error: ${err.message}`);
      res.status(500).json({ error: "Failed to scan message" });
    }
  }
);

// ===========================================
// GET /api/scam/alerts
// Get scam alerts for the authenticated user
// ===========================================
router.get(
  "/alerts",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const includeRead = req.query.include_read === "true";
      const alerts = await getAlertsForRecipient(req.user!.id, includeRead);
      res.json({ alerts });
    } catch (err: any) {
      logger.error("ScamRoutes", `Get alerts error: ${err.message}`);
      res.status(500).json({ error: "Failed to get alerts" });
    }
  }
);

// ===========================================
// POST /api/scam/alerts/:alertId/dismiss
// Dismiss a scam alert
// ===========================================
router.post(
  "/alerts/:alertId/dismiss",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const dismissed = await dismissAlert(
        req.params.alertId,
        req.user!.id
      );
      if (!dismissed) {
        res.status(404).json({ error: "Alert not found or already dismissed" });
        return;
      }
      res.json({ message: "Alert dismissed" });
    } catch (err: any) {
      logger.error("ScamRoutes", `Dismiss alert error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/scam/patterns
// List all scam patterns (admin only)
// ===========================================
router.get(
  "/patterns",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const activeOnly = req.query.active_only === "true";
      const patterns = await getPatterns(activeOnly);
      res.json({ patterns });
    } catch (err: any) {
      logger.error("ScamRoutes", `List patterns error: ${err.message}`);
      res.status(500).json({ error: "Failed to list patterns" });
    }
  }
);

// ===========================================
// GET /api/scam/patterns/:patternId
// Get a single scam pattern (admin only)
// ===========================================
router.get(
  "/patterns/:patternId",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pattern = await getPatternById(req.params.patternId);
      if (!pattern) {
        res.status(404).json({ error: "Pattern not found" });
        return;
      }
      res.json({ pattern });
    } catch (err: any) {
      logger.error("ScamRoutes", `Get pattern error: ${err.message}`);
      res.status(500).json({ error: "Failed to get pattern" });
    }
  }
);

// ===========================================
// POST /api/scam/patterns
// Create a new scam pattern (admin only)
// ===========================================
router.post(
  "/patterns",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, description, category, regex, severity, alert_message } =
        req.body;

      if (!name || !category || !regex || !severity || !alert_message) {
        res.status(400).json({
          error: "Missing required fields: name, category, regex, severity, alert_message",
        });
        return;
      }

      const pattern = await createPattern(req.user!.id, {
        name,
        description,
        category,
        regex,
        severity,
        alertMessage: alert_message,
      });

      res.status(201).json({ pattern });
    } catch (err: any) {
      logger.error("ScamRoutes", `Create pattern error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// PUT /api/scam/patterns/:patternId
// Update a scam pattern (admin only)
// ===========================================
router.put(
  "/patterns/:patternId",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, description, category, regex, severity, alert_message, is_active } =
        req.body;

      const pattern = await updatePattern(req.params.patternId, req.user!.id, {
        name,
        description,
        category,
        regex,
        severity,
        alertMessage: alert_message,
        isActive: is_active,
      });

      res.json({ pattern });
    } catch (err: any) {
      logger.error("ScamRoutes", `Update pattern error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// DELETE /api/scam/patterns/:patternId
// Delete a scam pattern (admin only, not built-in)
// ===========================================
router.delete(
  "/patterns/:patternId",
  authenticate,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deletePattern(req.params.patternId, req.user!.id);
      res.json({ message: "Pattern deleted" });
    } catch (err: any) {
      logger.error("ScamRoutes", `Delete pattern error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  }
);

// ===========================================
// GET /api/scam/stats
// Pattern effectiveness statistics (admin only)
// ===========================================
router.get(
  "/stats",
  authenticate,
  requireAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getPatternStats();
      res.json({ stats });
    } catch (err: any) {
      logger.error("ScamRoutes", `Stats error: ${err.message}`);
      res.status(500).json({ error: "Failed to get stats" });
    }
  }
);

export default router;
