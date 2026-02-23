/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token, attaching the decoded
 * payload to `req.user` for downstream route handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyToken, TokenPayload } from '../crypto/identity';
import { query } from '../db/pool';

export interface AuthenticatedUser extends TokenPayload {
  id: string;
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

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).user = { ...payload, id: payload.userId };
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

  query('SELECT is_admin, role FROM users WHERE id = $1', [user.id])
    .then((result) => {
      const row = result.rows[0];
      if (!row || (!row.is_admin && row.role !== 'admin' && row.role !== 'creator')) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }
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
      next();
    })
    .catch(() => {
      res.status(500).json({ error: 'Failed to verify admin status' });
    });
}
