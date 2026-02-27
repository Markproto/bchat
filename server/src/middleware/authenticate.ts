/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token, attaching the decoded
 * payload to `req.user` for downstream route handlers.
 *
 * Also populates isAdmin / isVerifiedAdmin from the DB so downstream
 * middleware (e.g. cooling period) can check admin status without
 * an extra query.
 */

import { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyToken, TokenPayload } from '../crypto/identity';
import { query } from '../db/pool';

export interface AuthenticatedUser extends TokenPayload {
  id: string;
  isAdmin: boolean;
  isVerifiedAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const payload = verifyToken(token);

    // Fetch admin flags so downstream middleware can check without extra queries
    let isAdmin = false;
    let isVerifiedAdmin = false;
    try {
      const result = await query(
        'SELECT is_admin, is_verified_admin, role, is_verified FROM users WHERE id = $1',
        [payload.userId]
      );
      const row = result.rows[0];
      if (row) {
        isAdmin = row.is_admin || row.role === 'admin' || row.role === 'creator';
        isVerifiedAdmin = row.is_verified_admin || (row.is_verified && (row.role === 'admin' || row.role === 'creator'));
      }
    } catch {
      // If DB query fails, proceed without admin flags — fail open for auth,
      // individual admin-gated routes will re-check via requireAdmin/requireVerifiedAdmin
    }

    (req as AuthenticatedRequest).user = {
      ...payload,
      id: payload.userId,
      isAdmin,
      isVerifiedAdmin,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Fast path: already populated by authenticate
  if (user.isAdmin) {
    next();
    return;
  }

  // Fallback: re-check DB in case token was issued before admin promotion
  query('SELECT is_admin, role FROM users WHERE id = $1', [user.id])
    .then((result) => {
      const row = result.rows[0];
      if (!row || (!row.is_admin && row.role !== 'admin' && row.role !== 'creator')) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }
      user.isAdmin = true;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: 'Failed to verify admin status' });
    });
}

export function requireVerifiedAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Fast path
  if (user.isVerifiedAdmin) {
    next();
    return;
  }

  query('SELECT is_verified_admin, is_admin, role, is_verified FROM users WHERE id = $1', [user.id])
    .then((result) => {
      const row = result.rows[0];
      if (!row) {
        res.status(403).json({ error: 'Verified admin access required' });
        return;
      }
      const isVerified = row.is_verified_admin || (row.is_verified && (row.role === 'admin' || row.role === 'creator'));
      if (!isVerified) {
        res.status(403).json({ error: 'Verified admin access required' });
        return;
      }
      user.isVerifiedAdmin = true;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: 'Failed to verify admin status' });
    });
}
