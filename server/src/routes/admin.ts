/**
 * Admin API Routes
 *
 * POST /api/admin/promote          — Promote a user to admin (creator/admin only)
 * POST /api/admin/revoke           — Revoke admin status
 * GET  /api/admin/verify/:userId   — Verify if a user is a legit admin
 * GET  /api/admin/list             — List all active admins
 * POST /api/admin/initialize       — One-time creator setup
 */

import { Router, Request, Response } from 'express';
import { verifyToken, extractBearerToken } from '../crypto/identity';
import {
  verifyAdmin,
  revokeAdmin,
  getCreatorPubkey,
  initializeCreator,
} from '../admin/verification';
import { query } from '../db/pool';

const router = Router();

/**
 * Middleware: require authentication
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

/**
 * POST /api/admin/initialize
 * One-time setup: make the first user the creator (root of trust).
 */
router.post('/initialize', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    await initializeCreator(userId);

    res.json({
      success: true,
      message: 'You are now the creator — the root of trust for all admin verifications.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/promote
 * Promote a user to admin. Client signs on-device, sends signature + payload.
 */
router.post('/promote', requireAuth, async (req: Request, res: Response) => {
  try {
    const promoterId = (req as any).userId;
    const { targetUserId, signature, signedPayload } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId required' });
    }

    if (!signature || !signedPayload) {
      return res.status(400).json({
        error: 'Provide signature and signedPayload (sign on-device)',
      });
    }

    const promoter = await query(
      'SELECT identity_pubkey, role FROM users WHERE id = $1',
      [promoterId]
    );
    if (!promoter.rows[0] || (promoter.rows[0].role !== 'creator' && promoter.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only creators and admins can promote users' });
    }

    const target = await query(
      'SELECT identity_pubkey, telegram_id FROM users WHERE id = $1',
      [targetUserId]
    );
    if (!target.rows[0]) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    if (!target.rows[0].telegram_id) {
      return res.status(400).json({ error: 'Target must verify via Telegram first' });
    }

    await query(
      `INSERT INTO admin_chain (admin_id, promoted_by, signature, signed_payload, role_granted)
       VALUES ($1, $2, $3, $4, 'admin')`,
      [targetUserId, promoterId, signature, signedPayload]
    );
    await query(
      `UPDATE users SET role = 'admin', verified_by = $1, admin_signature = $2, is_verified = TRUE
       WHERE id = $3`,
      [promoterId, signature, targetUserId]
    );
    await query(
      `INSERT INTO audit_log (user_id, event_type, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [promoterId, 'admin_promoted', JSON.stringify({ targetUserId }), req.ip]
    );

    res.json({
      success: true,
      admin: {
        userId: targetUserId,
        pubkey: target.rows[0].identity_pubkey,
        promotedBy: promoterId,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/revoke
 * Revoke admin status. Cascades to anyone they promoted.
 */
router.post('/revoke', requireAuth, async (req: Request, res: Response) => {
  try {
    const revokerId = (req as any).userId;
    const { targetAdminId } = req.body;

    if (!targetAdminId) {
      return res.status(400).json({ error: 'targetAdminId required' });
    }

    await revokeAdmin(revokerId, targetAdminId);

    res.json({
      success: true,
      message: `Admin ${targetAdminId} revoked. Any admins they promoted have also been revoked.`,
    });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

/**
 * GET /api/admin/verify/:userId
 * Verify if someone is a real admin. Returns cryptographic proof chain.
 */
router.get('/verify/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const verification = await verifyAdmin(targetUserId);

    res.json({
      userId: targetUserId,
      isVerifiedAdmin: verification.isAdmin,
      role: verification.role,
      chainLength: verification.verifiedChain.length,
      chain: verification.verifiedChain.map(link => ({
        adminId: link.adminId,
        promotedBy: link.promotedBy,
        role: link.roleGranted,
        grantedAt: link.grantedAt,
        adminPubkey: link.adminPubkey,
        promoterPubkey: link.promoterPubkey,
        signature: link.signature,
        signedPayload: link.signedPayload,
      })),
      rootCreatorPubkey: verification.rootCreatorPubkey,
      warning: verification.isAdmin
        ? null
        : 'THIS USER IS NOT A VERIFIED ADMIN. Do not share sensitive information.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/admin/list
 * List all active admins with their verification status.
 */
router.get('/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const admins = await query(
      `SELECT u.id, u.telegram_username, u.first_name, u.role,
              u.identity_pubkey, u.verified_by, u.created_at
       FROM users u
       WHERE u.role IN ('creator', 'admin') AND u.is_active = TRUE
       ORDER BY u.role DESC, u.created_at ASC`
    );

    res.json({
      admins: admins.rows,
      creatorPubkey: await getCreatorPubkey(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/ban
 * Ban a user. Deactivates their account.
 */
router.post('/ban', requireAuth, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;

    const admin = await query('SELECT role FROM users WHERE id = $1', [adminId]);
    if (admin.rows[0]?.role !== 'creator' && admin.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can ban users' });
    }

    const { targetUserId, reason } = req.body;
    if (!targetUserId || !reason) {
      return res.status(400).json({ error: 'targetUserId and reason required' });
    }

    const target = await query('SELECT role FROM users WHERE id = $1', [targetUserId]);
    if (target.rows[0]?.role === 'admin' && admin.rows[0]?.role !== 'creator') {
      return res.status(403).json({ error: 'Only the creator can ban admins' });
    }
    if (target.rows[0]?.role === 'creator') {
      return res.status(403).json({ error: 'Cannot ban the creator' });
    }

    await query(
      'UPDATE users SET is_active = FALSE WHERE id = $1',
      [targetUserId]
    );

    await query(
      `INSERT INTO audit_log (user_id, event_type, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [adminId, 'user_banned', JSON.stringify({ targetUserId, reason }), req.ip]
    );

    res.json({
      success: true,
      message: `User ${targetUserId} banned.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
