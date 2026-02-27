/**
 * Invite Management Routes
 *
 * POST /api/invites/create    — Create a new invite code (admin only)
 * GET  /api/invites/:code     — Check invite status
 * GET  /api/invites           — List invites created by current user
 */

import { Router, Request, Response } from 'express';
import { verifyToken, extractBearerToken } from '../crypto/identity';
import { query } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /api/invites/create
 * Create a new invite code. Only admins/creator can create invites.
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = verifyToken(token);

    // Verify caller is admin/creator
    const user = await query(
      'SELECT role FROM users WHERE id = $1',
      [payload.userId]
    );
    if (!user.rows[0] || (user.rows[0].role !== 'creator' && user.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can create invites' });
    }

    const code = uuidv4().slice(0, 8);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await query(
      `INSERT INTO invites (code, created_by, expires_at)
       VALUES ($1, $2, $3)`,
      [code, payload.userId, expiresAt]
    );

    res.json({
      code,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/invites/:code
 * Check if an invite code is valid and unused.
 */
router.get('/:code', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT code, used_by, expires_at FROM invites WHERE code = $1',
      [req.params.code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    const invite = result.rows[0];
    const expired = new Date(invite.expires_at) < new Date();

    res.json({
      code: invite.code,
      valid: !invite.used_by && !expired,
      used: !!invite.used_by,
      expired,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/invites
 * List invites created by the current user.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = verifyToken(token);
    const result = await query(
      `SELECT code, used_by, expires_at, created_at
       FROM invites WHERE created_by = $1
       ORDER BY created_at DESC LIMIT 50`,
      [payload.userId]
    );

    res.json({ invites: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
