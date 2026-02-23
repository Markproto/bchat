/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token, attaching the decoded
 * payload to `req.user` for downstream route handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyToken, TokenPayload } from '../crypto/identity';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
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
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
