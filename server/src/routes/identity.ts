/**
 * Identity API Routes
 *
 * These endpoints are called AUTOMATICALLY by the app — not manually by users.
 * The app checks identity on every conversation open, every new message from
 * someone claiming admin, and on profile views.
 *
 * GET  /api/identity/:userId       — Get identity card (fingerprint, colors, admin status)
 * GET  /api/identity/:userId/badge — Lightweight admin badge check (for message rendering)
 * POST /api/identity/report        — Report a suspected impersonator
 */

import { Router, Request, Response } from 'express';
import { verifyToken, extractBearerToken } from '../crypto/identity';
import {
  getUserIdentityCard,
  generatePubkeyFingerprint,
  checkNameImpersonation,
} from '../admin/identity-guard';
import { verifyAdmin } from '../admin/verification';
import { query } from '../db/pool';

const router = Router();

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
 * GET /api/identity/:userId
 * Full identity card. The app calls this when:
 *   - Opening a conversation with someone
 *   - Viewing someone's profile
 *   - Receiving a message from someone new
 *
 * Returns fingerprint, identity colors, admin chain status, and
 * impersonation warnings. The app renders this as:
 *   - Colored ring around avatar (derived from pubkey — can't be faked)
 *   - Fingerprint code below name (e.g., "AB12:CD34:EF56")
 *   - Green "Verified Admin" or "Creator" badge (only if chain checks out)
 *   - Red warning if name resembles an admin but isn't one
 */
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const card = await getUserIdentityCard(req.params.userId);
    res.json(card);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * GET /api/identity/:userId/badge
 * Lightweight check — just returns whether this user is a verified admin.
 * Called on every incoming message to render the correct badge.
 *
 * This is the key piece: the badge is NOT a cosmetic label that anyone
 * can slap on their profile. It's computed from the cryptographic chain.
 * No chain = no badge. Period.
 */
router.get('/:userId/badge', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const verification = await verifyAdmin(targetUserId);

    const user = await query(
      'SELECT identity_pubkey FROM users WHERE id = $1',
      [targetUserId]
    );

    const fingerprint = user.rows[0]
      ? generatePubkeyFingerprint(user.rows[0].identity_pubkey)
      : null;

    res.json({
      userId: targetUserId,
      badge: verification.isAdmin ? verification.role : null, // 'creator' | 'admin' | null
      chainVerified: verification.isAdmin,
      fingerprint,
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /api/identity/report
 * Report a suspected impersonator. Triggers admin review and
 * auto-flags the account if impersonation is detected.
 */
router.post('/report', async (req: Request, res: Response) => {
  try {
    const reporterId = (req as any).userId;
    const { suspectUserId, reason } = req.body;

    if (!suspectUserId) {
      return res.status(400).json({ error: 'suspectUserId required' });
    }

    // Get suspect's info
    const suspect = await query(
      'SELECT id, first_name, telegram_username, role, identity_pubkey FROM users WHERE id = $1',
      [suspectUserId]
    );
    if (suspect.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Auto-check for impersonation
    const nameCheck = await checkNameImpersonation(
      suspect.rows[0].first_name,
      suspect.rows[0].id
    );

    // Log the report
    await query(
      `INSERT INTO audit_log (user_id, event_type, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [
        reporterId,
        'impersonation_report',
        JSON.stringify({
          suspectUserId,
          suspectName: suspect.rows[0].first_name,
          suspectRole: suspect.rows[0].role,
          reason,
          autoDetected: nameCheck.impersonating,
          targetAdmin: nameCheck.targetAdmin,
        }),
        req.ip,
      ]
    );

    // If impersonation confirmed, auto-flag the account
    if (nameCheck.impersonating) {
      await query(
        'UPDATE users SET is_active = FALSE WHERE id = $1',
        [suspectUserId]
      );
    }

    res.json({
      reported: true,
      autoDetected: nameCheck.impersonating,
      action: nameCheck.impersonating
        ? 'Account has been automatically suspended pending admin review.'
        : 'Report submitted. An admin will review this shortly.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
