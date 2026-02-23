/**
 * Rate-limiting middleware using rate-limiter-flexible.
 * Provides reusable factories for global and per-endpoint limiters.
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

export interface RateLimitOptions {
  /** Max requests within the window */
  points: number;
  /** Window duration in seconds */
  duration: number;
}

/**
 * Create an Express middleware that enforces the given rate limit per IP.
 */
export function rateLimit(opts: RateLimitOptions) {
  const limiter = new RateLimiterMemory({
    points: opts.points,
    duration: opts.duration,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await limiter.consume(req.ip || 'unknown');
      next();
    } catch {
      res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    }
  };
}

export interface CreateRateLimitOptions {
  /** Max requests within the window (default 60s) */
  max: number;
  /** Prefix for the rate limiter key */
  keyPrefix: string;
  /** Custom error message */
  message: string;
  /** Window duration in seconds (default 60) */
  duration?: number;
}

/**
 * Create a named rate limiter for specific actions (e.g. ban, flag).
 * Uses IP + keyPrefix for isolation between different action types.
 */
export function createRateLimit(opts: CreateRateLimitOptions) {
  const limiter = new RateLimiterMemory({
    points: opts.max,
    duration: opts.duration || 60,
    keyPrefix: opts.keyPrefix,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await limiter.consume(`${opts.keyPrefix}:${req.ip || 'unknown'}`);
      next();
    } catch {
      res.status(429).json({ error: opts.message });
    }
  };
}
