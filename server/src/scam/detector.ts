/**
 * Scam Detection Engine — Phase 7
 *
 * Scans messages against admin-configurable regex patterns,
 * generates recipient-only alerts, and auto-restricts senders
 * who trigger too many high-severity patterns.
 */

import { query } from "../db/pool";
import { logger } from "../utils/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface ScamPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  regex: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  alertMessage: string;
  isActive: boolean;
  isBuiltIn: boolean;
  createdBy: string | null;
  createdAt: Date;
}

export interface ScanMatch {
  patternId: string;
  patternName: string;
  category: string;
  severity: string;
  matchedText: string;
  alertMessage: string;
}

export interface ScanResult {
  triggered: boolean;
  matches: ScanMatch[];
  compositeScore: number;
  autoRestricted: boolean;
}

export interface ScamAlert {
  id: string;
  messageId: string | null;
  senderId: string;
  recipientId: string;
  patternId: string;
  severity: string;
  matchedText: string | null;
  alertMessage: string;
  shownToRecipient: boolean;
  dismissed: boolean;
  createdAt: Date;
}

export interface PatternStats {
  patternId: string;
  patternName: string;
  category: string;
  severity: string;
  totalAlerts: number;
  last7Days: number;
  last30Days: number;
}

// ── Severity Weights ─────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 0.4,
  HIGH: 0.25,
  MEDIUM: 0.15,
  LOW: 0.05,
};

const AUTO_RESTRICT_THRESHOLD = 0.6;
const AUTO_RESTRICT_PENALTY = 0.15;
const MATCHED_TEXT_MAX_LEN = 100;

// ── Pattern Cache ────────────────────────────────────────────────────────
// Patterns change infrequently. Cache them to avoid hitting DB on every message.

let patternCache: ScamPattern[] = [];
let patternCacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function loadPatterns(): Promise<ScamPattern[]> {
  const now = Date.now();
  if (patternCache.length > 0 && now - patternCacheTime < CACHE_TTL_MS) {
    return patternCache;
  }

  const result = await query(
    `SELECT * FROM scam_patterns WHERE is_active = true ORDER BY severity, name`
  );

  patternCache = result.rows.map(mapPatternRow);
  patternCacheTime = now;
  return patternCache;
}

export function invalidatePatternCache(): void {
  patternCache = [];
  patternCacheTime = 0;
}

// ── Scan Message ─────────────────────────────────────────────────────────

/**
 * Scan a message against all active scam patterns.
 * If matches are found, alerts are created for the recipient.
 * If composite score exceeds threshold, sender is auto-restricted.
 */
export async function scanMessage(
  content: string,
  senderId: string,
  recipientId: string,
  messageId?: string
): Promise<ScanResult> {
  const patterns = await loadPatterns();
  const matches: ScanMatch[] = [];

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.regex, "i");
      const match = content.match(regex);
      if (match) {
        matches.push({
          patternId: pattern.id,
          patternName: pattern.name,
          category: pattern.category,
          severity: pattern.severity,
          matchedText: match[0].slice(0, MATCHED_TEXT_MAX_LEN),
          alertMessage: pattern.alertMessage,
        });
      }
    } catch (regexErr: any) {
      logger.error("ScamDetector", `Invalid regex in pattern ${pattern.id}: ${regexErr.message}`);
    }
  }

  if (matches.length === 0) {
    return { triggered: false, matches: [], compositeScore: 0, autoRestricted: false };
  }

  // Calculate composite score from severity weights
  const compositeScore = Math.min(
    1,
    matches.reduce((sum, m) => sum + (SEVERITY_WEIGHTS[m.severity] || 0), 0)
  );

  // Create alerts for the recipient (one per matched pattern)
  for (const match of matches) {
    try {
      await query(
        `INSERT INTO scam_alerts
         (message_id, sender_id, recipient_id, pattern_id, severity, matched_text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [messageId || null, senderId, recipientId, match.patternId, match.severity, match.matchedText]
      );
    } catch (err: any) {
      logger.error("ScamDetector", `Failed to create alert: ${err.message}`);
    }
  }

  // Auto-restrict if composite score exceeds threshold
  let autoRestricted = false;
  if (compositeScore >= AUTO_RESTRICT_THRESHOLD) {
    autoRestricted = await applyAutoRestriction(
      senderId,
      compositeScore,
      matches
    );
  }

  logger.info(
    "ScamDetector",
    `Scan: ${matches.length} match(es) for sender ${senderId} → ${recipientId} | ` +
    `Score: ${compositeScore.toFixed(4)} | Auto-restricted: ${autoRestricted}`
  );

  return { triggered: true, matches, compositeScore, autoRestricted };
}

// ── Auto-Restrict ────────────────────────────────────────────────────────

async function applyAutoRestriction(
  senderId: string,
  compositeScore: number,
  matches: ScanMatch[]
): Promise<boolean> {
  try {
    // Count recent alerts for this sender (last 24h)
    const recentAlerts = await query(
      `SELECT COUNT(*) AS cnt FROM scam_alerts
       WHERE sender_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [senderId]
    );
    const alertCount = parseInt(recentAlerts.rows[0].cnt, 10);

    // Apply trust score penalty
    await query(
      `UPDATE users SET trust_score = GREATEST(0, trust_score - $1),
       can_invite = false
       WHERE id = $2`,
      [AUTO_RESTRICT_PENALTY, senderId]
    );

    // Record the auto-restrict event
    const patternIds = matches.map((m) => m.patternId);
    await query(
      `INSERT INTO scam_auto_restrict_events
       (sender_id, composite_score, penalty_applied, pattern_ids, alert_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [senderId, compositeScore, AUTO_RESTRICT_PENALTY, patternIds, alertCount]
    );

    logger.warn(
      "ScamDetector",
      `Auto-restricted sender ${senderId} | Score: ${compositeScore} | Penalty: ${AUTO_RESTRICT_PENALTY}`
    );

    return true;
  } catch (err: any) {
    logger.error("ScamDetector", `Auto-restrict failed: ${err.message}`);
    return false;
  }
}

// ── Alert Management ─────────────────────────────────────────────────────

export async function getAlertsForRecipient(
  recipientId: string,
  includeRead: boolean = false
): Promise<ScamAlert[]> {
  const whereClause = includeRead
    ? "WHERE sa.recipient_id = $1"
    : "WHERE sa.recipient_id = $1 AND sa.dismissed = false";

  const result = await query(
    `SELECT sa.*, sp.alert_message
     FROM scam_alerts sa
     JOIN scam_patterns sp ON sp.id = sa.pattern_id
     ${whereClause}
     ORDER BY sa.created_at DESC
     LIMIT 50`,
    [recipientId]
  );

  // Mark as shown
  if (result.rows.length > 0) {
    const alertIds = result.rows
      .filter((r: any) => !r.shown_to_recipient)
      .map((r: any) => r.id);

    if (alertIds.length > 0) {
      await query(
        `UPDATE scam_alerts SET shown_to_recipient = true
         WHERE id = ANY($1)`,
        [alertIds]
      );
    }
  }

  return result.rows.map((row: any) => ({
    id: row.id,
    messageId: row.message_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    patternId: row.pattern_id,
    severity: row.severity,
    matchedText: row.matched_text,
    alertMessage: row.alert_message,
    shownToRecipient: true,
    dismissed: row.dismissed,
    createdAt: row.created_at,
  }));
}

export async function dismissAlert(
  alertId: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE scam_alerts
     SET dismissed = true, dismissed_at = NOW()
     WHERE id = $1 AND recipient_id = $2 AND dismissed = false
     RETURNING id`,
    [alertId, userId]
  );
  return result.rows.length > 0;
}

// ── Pattern CRUD (Admin) ─────────────────────────────────────────────────

export async function getPatterns(
  activeOnly: boolean = false
): Promise<ScamPattern[]> {
  const where = activeOnly ? "WHERE is_active = true" : "";
  const result = await query(
    `SELECT * FROM scam_patterns ${where} ORDER BY severity, name`
  );
  return result.rows.map(mapPatternRow);
}

export async function getPatternById(
  patternId: string
): Promise<ScamPattern | null> {
  const result = await query(
    `SELECT * FROM scam_patterns WHERE id = $1`,
    [patternId]
  );
  if (result.rows.length === 0) return null;
  return mapPatternRow(result.rows[0]);
}

export async function createPattern(
  adminId: string,
  data: {
    name: string;
    description?: string;
    category: string;
    regex: string;
    severity: string;
    alertMessage: string;
  }
): Promise<ScamPattern> {
  // Validate regex before saving
  validateRegex(data.regex);
  validateSeverity(data.severity);

  const result = await query(
    `INSERT INTO scam_patterns (name, description, category, regex, severity, alert_message, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [data.name, data.description || "", data.category, data.regex, data.severity, data.alertMessage, adminId]
  );

  const pattern = mapPatternRow(result.rows[0]);

  // Audit log
  await query(
    `INSERT INTO scam_pattern_audit (pattern_id, admin_id, action, after_state)
     VALUES ($1, $2, 'CREATE', $3)`,
    [pattern.id, adminId, JSON.stringify(result.rows[0])]
  );

  invalidatePatternCache();
  return pattern;
}

export async function updatePattern(
  patternId: string,
  adminId: string,
  data: Partial<{
    name: string;
    description: string;
    category: string;
    regex: string;
    severity: string;
    alertMessage: string;
    isActive: boolean;
  }>
): Promise<ScamPattern> {
  // Fetch current state for audit log
  const current = await query(
    `SELECT * FROM scam_patterns WHERE id = $1`,
    [patternId]
  );
  if (current.rows.length === 0) throw new Error("Pattern not found");

  if (data.regex) validateRegex(data.regex);
  if (data.severity) validateSeverity(data.severity);

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
  if (data.category !== undefined) { sets.push(`category = $${idx++}`); params.push(data.category); }
  if (data.regex !== undefined) { sets.push(`regex = $${idx++}`); params.push(data.regex); }
  if (data.severity !== undefined) { sets.push(`severity = $${idx++}`); params.push(data.severity); }
  if (data.alertMessage !== undefined) { sets.push(`alert_message = $${idx++}`); params.push(data.alertMessage); }
  if (data.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.isActive); }

  sets.push(`updated_by = $${idx++}`);
  params.push(adminId);
  sets.push(`updated_at = NOW()`);

  params.push(patternId);

  const result = await query(
    `UPDATE scam_patterns SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );

  // Audit log
  await query(
    `INSERT INTO scam_pattern_audit (pattern_id, admin_id, action, before_state, after_state)
     VALUES ($1, $2, 'UPDATE', $3, $4)`,
    [patternId, adminId, JSON.stringify(current.rows[0]), JSON.stringify(result.rows[0])]
  );

  invalidatePatternCache();
  return mapPatternRow(result.rows[0]);
}

export async function deletePattern(
  patternId: string,
  adminId: string
): Promise<void> {
  const current = await query(
    `SELECT * FROM scam_patterns WHERE id = $1`,
    [patternId]
  );
  if (current.rows.length === 0) throw new Error("Pattern not found");

  // Built-in patterns can only be deactivated, not deleted
  if (current.rows[0].is_built_in) {
    throw new Error("Built-in patterns cannot be deleted. Deactivate instead.");
  }

  await query(`DELETE FROM scam_patterns WHERE id = $1`, [patternId]);

  // Audit log
  await query(
    `INSERT INTO scam_pattern_audit (pattern_id, admin_id, action, before_state)
     VALUES ($1, $2, 'DELETE', $3)`,
    [patternId, adminId, JSON.stringify(current.rows[0])]
  );

  invalidatePatternCache();
}

// ── Pattern Stats (Admin) ────────────────────────────────────────────────

export async function getPatternStats(): Promise<PatternStats[]> {
  const result = await query(
    `SELECT
       sp.id AS pattern_id,
       sp.name AS pattern_name,
       sp.category,
       sp.severity,
       COUNT(sa.id) AS total_alerts,
       COUNT(sa.id) FILTER (WHERE sa.created_at > NOW() - INTERVAL '7 days') AS last_7_days,
       COUNT(sa.id) FILTER (WHERE sa.created_at > NOW() - INTERVAL '30 days') AS last_30_days
     FROM scam_patterns sp
     LEFT JOIN scam_alerts sa ON sa.pattern_id = sp.id
     GROUP BY sp.id, sp.name, sp.category, sp.severity
     ORDER BY total_alerts DESC`
  );

  return result.rows.map((row: any) => ({
    patternId: row.pattern_id,
    patternName: row.pattern_name,
    category: row.category,
    severity: row.severity,
    totalAlerts: parseInt(row.total_alerts, 10),
    last7Days: parseInt(row.last_7_days, 10),
    last30Days: parseInt(row.last_30_days, 10),
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────

function validateRegex(pattern: string): void {
  try {
    new RegExp(pattern, "i");
  } catch {
    throw new Error(`Invalid regex pattern: ${pattern}`);
  }
}

function validateSeverity(severity: string): void {
  if (!["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(severity)) {
    throw new Error(`Invalid severity: ${severity}. Must be CRITICAL, HIGH, MEDIUM, or LOW.`);
  }
}

function mapPatternRow(row: any): ScamPattern {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    regex: row.regex,
    severity: row.severity,
    alertMessage: row.alert_message,
    isActive: row.is_active,
    isBuiltIn: row.is_built_in,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
