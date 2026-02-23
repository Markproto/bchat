// =============================================================
// bchat Phase 6: Cooling Period Middleware
// src/middleware/coolingPeriod.ts
//
// 72-hour restriction window for new contacts.
// High-risk actions (wallet addresses, external links, seed
// keywords) are blocked until the cooling period expires.
// =============================================================

import { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool";
import { AuthenticatedRequest } from "./authenticate";
import { logger } from "../utils/logger";

// ===================== CONSTANTS =====================

// Cooling period duration in hours
export const COOLING_PERIOD_HOURS = 72;

// High-risk content patterns blocked during cooling
// These are the attack vectors scammers use in first contact
export const BLOCKED_PATTERNS = {
  // Cryptocurrency wallet addresses
  walletAddresses: [
    /\b(0x[a-fA-F0-9]{40})\b/,                          // Ethereum / EVM
    /\b([13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/,            // Bitcoin legacy
    /\b(bc1[a-zA-HJ-NP-Z0-9]{25,90})\b/,                // Bitcoin bech32
    /\b([LM][a-km-zA-HJ-NP-Z1-9]{26,33})\b/,            // Litecoin
    /\b(4[0-9AB][1-9A-HJ-NP-Za-km-z]{93})\b/,           // Monero
    /\b(r[0-9a-zA-Z]{24,34})\b/,                         // XRP
    /\b(addr1[a-z0-9]{58,})\b/i,                         // Cardano
    /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/,                // Solana (broad)
  ],

  // External links and URLs
  externalLinks: [
    /https?:\/\/[^\s]+/i,
    /www\.[^\s]+/i,
    /[a-zA-Z0-9-]+\.(com|org|net|io|xyz|app|dev|co|me|info|link|click)\b/i,
  ],

  // Seed phrase / private key related keywords
  seedKeywords: [
    /\b(seed\s*phrase)\b/i,
    /\b(recovery\s*(phrase|words|key))\b/i,
    /\b(mnemonic\s*(phrase|words)?)\b/i,
    /\b(private\s*key)\b/i,
    /\b(secret\s*key)\b/i,
    /\b(wallet\s*backup)\b/i,
    /\b(12[\s-]*word|24[\s-]*word)\b/i,
    /\b(master\s*seed)\b/i,
    /\b(keystore\s*file)\b/i,
    /\b(json\s*key)\b/i,
  ],
};

// Human-readable category names for error messages
const CATEGORY_LABELS: Record<string, string> = {
  walletAddresses: "wallet addresses",
  externalLinks: "external links",
  seedKeywords: "seed phrase / private key references",
};

// ===================== TYPES =====================

export interface CoolingStatus {
  contactPairId: string;
  userId: string;
  contactUserId: string;
  firstInteraction: string;
  coolingExpiresAt: string;
  isCooling: boolean;
  hoursRemaining: number;
  restrictedActions: string[];
  allowedActions: string[];
}

export interface ContentCheckResult {
  blocked: boolean;
  category: string | null;
  pattern: string | null;
  message: string | null;
}

// ===================== CORE FUNCTIONS =====================

/**
 * Get or create a contact pair between two users.
 * Records the first interaction timestamp.
 * Returns the cooling status.
 */
export async function getOrCreateContactPair(
  userId: string,
  contactUserId: string
): Promise<CoolingStatus> {
  const client = await pool.connect();
  try {
    // Normalize the pair — always store with lower UUID first
    // so (A,B) and (B,A) map to the same row
    const [userA, userB] =
      userId < contactUserId
        ? [userId, contactUserId]
        : [contactUserId, userId];

    // Upsert: create pair if it doesn't exist
    const res = await client.query(
      `INSERT INTO contact_pairs (user_a, user_b, first_interaction)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_a, user_b) DO NOTHING
       RETURNING *`,
      [userA, userB]
    );

    // If no row returned, it already existed — fetch it
    let pair;
    if (res.rows.length > 0) {
      pair = res.rows[0];
      logger.info(
        "Cooling",
        `New contact pair created: ${userId} <-> ${contactUserId}`
      );
    } else {
      const existing = await client.query(
        `SELECT * FROM contact_pairs
         WHERE user_a = $1 AND user_b = $2`,
        [userA, userB]
      );
      pair = existing.rows[0];
    }

    return buildCoolingStatus(pair, userId, contactUserId);
  } finally {
    client.release();
  }
}

/**
 * Check cooling status between two users without creating a pair.
 * Returns null if they have never interacted.
 */
export async function checkCoolingStatus(
  userId: string,
  contactUserId: string
): Promise<CoolingStatus | null> {
  const [userA, userB] =
    userId < contactUserId
      ? [userId, contactUserId]
      : [contactUserId, userId];

  const res = await pool.query(
    `SELECT * FROM contact_pairs
     WHERE user_a = $1 AND user_b = $2`,
    [userA, userB]
  );

  if (res.rows.length === 0) return null;
  return buildCoolingStatus(res.rows[0], userId, contactUserId);
}

/**
 * Build the CoolingStatus object from a contact_pairs row.
 */
function buildCoolingStatus(
  pair: any,
  userId: string,
  contactUserId: string
): CoolingStatus {
  const firstInteraction = new Date(pair.first_interaction);
  const expiresAt = new Date(
    firstInteraction.getTime() + COOLING_PERIOD_HOURS * 60 * 60 * 1000
  );
  const now = new Date();
  const isCooling = now < expiresAt;
  const hoursRemaining = isCooling
    ? Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000))
    : 0;

  return {
    contactPairId: pair.id,
    userId,
    contactUserId,
    firstInteraction: firstInteraction.toISOString(),
    coolingExpiresAt: expiresAt.toISOString(),
    isCooling,
    hoursRemaining,
    restrictedActions: isCooling
      ? ["wallet_addresses", "external_links", "seed_keywords"]
      : [],
    allowedActions: isCooling
      ? ["text_messages", "images", "voice_messages"]
      : ["all"],
  };
}

/**
 * Scan message content for blocked patterns during cooling.
 * Returns which category was triggered (if any).
 */
export function checkMessageContent(content: string): ContentCheckResult {
  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return {
          blocked: true,
          category,
          pattern: pattern.source,
          message:
            `Sharing ${CATEGORY_LABELS[category] || category} is restricted ` +
            `during the ${COOLING_PERIOD_HOURS}-hour cooling period for new contacts.`,
        };
      }
    }
  }
  return { blocked: false, category: null, pattern: null, message: null };
}

// ===================== EXPRESS MIDDLEWARE =====================

/**
 * Middleware: Enforce cooling period on message sends.
 *
 * Expects req.body to contain:
 *   - recipient_id: string  (the other user)
 *   - content: string       (message text to check)
 *
 * If the pair is still in cooling and the content contains
 * a blocked pattern, the request is rejected with 403.
 *
 * If the pair is past cooling, or the content is clean, next() is called.
 *
 * Usage in routes:
 *   router.post("/send", authenticate, enforceCooling, sendMessageHandler);
 */
export async function enforceCooling(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const senderId = req.user!.id;
    const { recipient_id, content } = req.body;

    if (!recipient_id || !content) {
      // Let the route handler deal with missing fields
      next();
      return;
    }

    // Admins bypass cooling (they need to share links for support)
    if (req.user!.isAdmin || req.user!.isVerifiedAdmin) {
      next();
      return;
    }

    // Get or create the contact pair
    const status = await getOrCreateContactPair(senderId, recipient_id);

    // If cooling period has expired, allow everything
    if (!status.isCooling) {
      next();
      return;
    }

    // Still in cooling — check message content for blocked patterns
    const check = checkMessageContent(content);

    if (check.blocked) {
      // Log the block event for admin stats + scam analysis
      try {
        await pool.query(
          `INSERT INTO cooling_block_events
             (sender_id, recipient_id, blocked_category, matched_pattern, hours_remaining)
           VALUES ($1, $2, $3, $4, $5)`,
          [senderId, recipient_id, check.category, check.pattern, status.hoursRemaining]
        );
      } catch (logErr: any) {
        logger.error("Cooling", `Failed to log block event: ${logErr.message}`);
      }

      logger.warn(
        "Cooling",
        `Block: ${senderId} → ${recipient_id} | ` +
        `Category: ${check.category} | Hours remaining: ${status.hoursRemaining}`
      );

      res.status(403).json({
        error: "cooling_period_restriction",
        message: check.message,
        cooling: {
          hoursRemaining: status.hoursRemaining,
          expiresAt: status.coolingExpiresAt,
          blockedCategory: check.category,
        },
      });
      return;
    }

    // Content is clean — allow through
    next();
  } catch (err: any) {
    logger.error("Cooling", `Middleware error: ${err.message}`);
    // Fail open — don't block messages if cooling check itself fails
    // but log it for investigation
    next();
  }
}

/**
 * Middleware: Attach cooling status to the request for the route handler.
 * Useful for endpoints that need cooling info without blocking.
 *
 * Adds req.coolingStatus to the request object.
 *
 * Usage:
 *   router.get("/chat/:userId", authenticate, attachCoolingStatus, handler);
 */
export async function attachCoolingStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contactUserId =
      req.params.userId || req.params.contactId || req.body.recipient_id;

    if (!contactUserId || !req.user) {
      next();
      return;
    }

    const status = await checkCoolingStatus(req.user.id, contactUserId);
    (req as any).coolingStatus = status;
    next();
  } catch (err: any) {
    logger.error("Cooling", `Attach status error: ${err.message}`);
    next();
  }
}
