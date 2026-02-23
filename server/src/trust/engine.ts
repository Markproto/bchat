/**
 * Trust Engine — Phase 5
 *
 * Core trust scoring, banning, cascading penalties,
 * community flagging, and platform statistics.
 */

import { query } from "../db/pool";

// ── Types ────────────────────────────────────────────────────────────────

export interface TrustProfile {
  userId: string;
  username: string;
  trustScore: number;
  canInvite: boolean;
  isBanned: boolean;
  isAdmin: boolean;
  isVerifiedAdmin: boolean;
  inviteDepth: number;
  invitedBy: string | null;
  flagCount: number;
  createdAt: Date;
}

export interface CascadeResult {
  username: string;
  userId: string;
  level: number;
  previousScore: number;
  newScore: number;
  inviteRevoked: boolean;
}

export interface BanResult {
  bannedUsername: string;
  deviceBanned: boolean;
  cascadeResults: CascadeResult[];
}

// ── Cascade Config ───────────────────────────────────────────────────────

const CASCADE_PENALTIES: Record<number, number> = {
  1: 0.15, // direct inviter
  2: 0.08, // inviter's inviter
  3: 0.04, // 3 levels up
};
const MAX_CASCADE_LEVELS = 3;
const INVITE_REVOKE_THRESHOLD = 0.4;

// ── Trust Profile ────────────────────────────────────────────────────────

export async function getTrustProfile(
  userId: string
): Promise<TrustProfile | null> {
  const result = await query(
    `SELECT u.id, u.telegram_username, u.trust_score, u.can_invite,
            u.is_banned, u.is_admin, u.is_verified_admin,
            u.invite_depth, u.invited_by, u.created_at,
            COUNT(cf.id) FILTER (WHERE cf.resolved = false) AS flag_count
     FROM users u
     LEFT JOIN community_flags cf ON cf.target_user_id = u.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  if (row.is_banned) return null;

  return {
    userId: row.id,
    username: row.telegram_username || "unknown",
    trustScore: parseFloat(row.trust_score),
    canInvite: row.can_invite,
    isBanned: row.is_banned,
    isAdmin: row.is_admin,
    isVerifiedAdmin: row.is_verified_admin,
    inviteDepth: row.invite_depth,
    invitedBy: row.invited_by,
    flagCount: parseInt(row.flag_count, 10),
    createdAt: row.created_at,
  };
}

// ── Ban User ─────────────────────────────────────────────────────────────

export async function banUser(
  targetUserId: string,
  adminId: string,
  reason: string
): Promise<BanResult> {
  // Get target info
  const target = await query(
    `SELECT id, telegram_username, device_id, fingerprint
     FROM users WHERE id = $1`,
    [targetUserId]
  );
  if (target.rows.length === 0) {
    throw new Error("User not found");
  }

  const targetRow = target.rows[0];

  // Mark user as banned
  await query(
    `UPDATE users
     SET is_banned = true, banned_at = NOW(), banned_by = $1, ban_reason = $2,
         can_invite = false, is_active = false
     WHERE id = $3`,
    [adminId, reason, targetUserId]
  );

  // Ban device if available
  let deviceBanned = false;
  if (targetRow.device_id) {
    await query(
      `INSERT INTO banned_devices (device_id, banned_by, reason, original_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_id) DO NOTHING`,
      [targetRow.device_id, adminId, reason, targetUserId]
    );
    deviceBanned = true;
  }

  // Record ban event
  await query(
    `INSERT INTO ban_events (target_user_id, admin_id, reason, device_banned)
     VALUES ($1, $2, $3, $4)`,
    [targetUserId, adminId, reason, deviceBanned]
  );

  // Revoke invite codes created by banned user
  await query(
    `UPDATE invite_codes SET revoked = true, revoked_reason = 'Inviter banned'
     WHERE created_by = $1 AND revoked = false`,
    [targetUserId]
  );

  // Cascade penalties up the invite chain
  const cascadeResults = await applyCascade(targetUserId);

  // Audit log
  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [
      adminId,
      "user_banned",
      JSON.stringify({
        targetUserId,
        reason,
        deviceBanned,
        cascadeLevels: cascadeResults.length,
      }),
    ]
  );

  return {
    bannedUsername: targetRow.telegram_username || "unknown",
    deviceBanned,
    cascadeResults,
  };
}

// ── Cascade Penalties ────────────────────────────────────────────────────

async function applyCascade(bannedUserId: string): Promise<CascadeResult[]> {
  const results: CascadeResult[] = [];
  let currentUserId = bannedUserId;

  for (let level = 1; level <= MAX_CASCADE_LEVELS; level++) {
    // Find who invited the current user
    const inviter = await query(
      `SELECT u.id, u.telegram_username, u.trust_score, u.can_invite
       FROM users u
       WHERE u.id = (SELECT invited_by FROM users WHERE id = $1)
         AND u.is_banned = false`,
      [currentUserId]
    );

    if (inviter.rows.length === 0) break;

    const inviterRow = inviter.rows[0];
    const penalty = CASCADE_PENALTIES[level] || 0;
    const previousScore = parseFloat(inviterRow.trust_score);
    const newScore = Math.max(0, previousScore - penalty);
    const inviteRevoked = newScore < INVITE_REVOKE_THRESHOLD;

    // Apply penalty
    await query(
      `UPDATE users SET trust_score = $1, can_invite = $2 WHERE id = $3`,
      [newScore, inviteRevoked ? false : inviterRow.can_invite, inviterRow.id]
    );

    // Record cascade event
    await query(
      `INSERT INTO cascade_events
       (banned_user_id, affected_user_id, level, penalty, previous_score, new_score, invite_revoked)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        bannedUserId,
        inviterRow.id,
        level,
        penalty,
        previousScore,
        newScore,
        inviteRevoked,
      ]
    );

    results.push({
      username: inviterRow.telegram_username || "unknown",
      userId: inviterRow.id,
      level,
      previousScore,
      newScore,
      inviteRevoked,
    });

    currentUserId = inviterRow.id;
  }

  return results;
}

// ── Recalculate Trust Score ──────────────────────────────────────────────

export async function recalculateTrustScore(userId: string): Promise<number> {
  const user = await query(
    `SELECT id, trust_score, invite_depth, is_banned FROM users WHERE id = $1`,
    [userId]
  );
  if (user.rows.length === 0) throw new Error("User not found");
  if (user.rows[0].is_banned) throw new Error("User is banned");

  // Factor 1: Account age (max 0.2 bonus)
  const ageResult = await query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 AS age_days
     FROM users WHERE id = $1`,
    [userId]
  );
  const ageDays = parseFloat(ageResult.rows[0].age_days);
  const ageFactor = Math.min(0.2, ageDays / 180 * 0.2);

  // Factor 2: Message activity (max 0.2 bonus)
  const activityResult = await query(
    `SELECT COUNT(*) AS msg_count FROM messages
     WHERE sender_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [userId]
  );
  const msgCount = parseInt(activityResult.rows[0].msg_count, 10);
  const activityFactor = Math.min(0.2, msgCount / 100 * 0.2);

  // Factor 3: Invite quality (max 0.2 bonus, penalty for banned invitees)
  const inviteResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE u.is_banned = false) AS good_invites,
       COUNT(*) FILTER (WHERE u.is_banned = true) AS bad_invites
     FROM users u WHERE u.invited_by = $1`,
    [userId]
  );
  const goodInvites = parseInt(inviteResult.rows[0].good_invites, 10);
  const badInvites = parseInt(inviteResult.rows[0].bad_invites, 10);
  const totalInvites = goodInvites + badInvites;
  const inviteFactor =
    totalInvites > 0
      ? Math.max(-0.2, ((goodInvites - badInvites * 3) / Math.max(totalInvites, 1)) * 0.2)
      : 0;

  // Factor 4: Community flags (penalty)
  const flagResult = await query(
    `SELECT COUNT(*) AS flag_count FROM community_flags
     WHERE target_user_id = $1 AND resolved = false`,
    [userId]
  );
  const flagCount = parseInt(flagResult.rows[0].flag_count, 10);
  const flagPenalty = Math.min(0.3, flagCount * 0.05);

  // Base score + factors
  const baseScore = 0.5;
  const newScore = Math.max(
    0,
    Math.min(1, baseScore + ageFactor + activityFactor + inviteFactor - flagPenalty)
  );

  // Round to 4 decimal places
  const roundedScore = Math.round(newScore * 10000) / 10000;

  await query(`UPDATE users SET trust_score = $1 WHERE id = $2`, [
    roundedScore,
    userId,
  ]);

  return roundedScore;
}

// ── Leaderboard ──────────────────────────────────────────────────────────

export async function getTrustLeaderboard(
  limit: number
): Promise<
  { userId: string; username: string; trustScore: number; inviteDepth: number }[]
> {
  const result = await query(
    `SELECT id, telegram_username, trust_score, invite_depth
     FROM users
     WHERE is_banned = false AND trust_score > 0
     ORDER BY trust_score DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row: any) => ({
    userId: row.id,
    username: row.telegram_username || "anonymous",
    trustScore: parseFloat(row.trust_score),
    inviteDepth: row.invite_depth,
  }));
}

// ── Flag User ────────────────────────────────────────────────────────────

const FLAG_COOLDOWN_HOURS = 24;
const AUTO_RESTRICT_FLAG_THRESHOLD = 5;

export async function flagUser(
  flaggerId: string,
  targetUserId: string,
  reason: string
): Promise<void> {
  if (flaggerId === targetUserId) {
    throw new Error("Cannot flag yourself");
  }

  // Check target exists and is not banned
  const target = await query(
    `SELECT id, is_banned FROM users WHERE id = $1`,
    [targetUserId]
  );
  if (target.rows.length === 0) throw new Error("Target user not found");
  if (target.rows[0].is_banned) throw new Error("User is already banned");

  // Check cooldown (one flag per user pair per day)
  const recent = await query(
    `SELECT id FROM community_flags
     WHERE flagger_id = $1 AND target_user_id = $2
       AND created_at > NOW() - INTERVAL '${FLAG_COOLDOWN_HOURS} hours'`,
    [flaggerId, targetUserId]
  );
  if (recent.rows.length > 0) {
    throw new Error("You have already flagged this user recently");
  }

  // Insert flag
  await query(
    `INSERT INTO community_flags (flagger_id, target_user_id, reason)
     VALUES ($1, $2, $3)`,
    [flaggerId, targetUserId, reason]
  );

  // Check if threshold reached for auto-restriction
  const flagCount = await query(
    `SELECT COUNT(*) AS cnt FROM community_flags
     WHERE target_user_id = $1 AND resolved = false`,
    [targetUserId]
  );
  const count = parseInt(flagCount.rows[0].cnt, 10);

  if (count >= AUTO_RESTRICT_FLAG_THRESHOLD) {
    // Auto-restrict: revoke invite privileges and lower trust score
    await query(
      `UPDATE users SET can_invite = false,
       trust_score = GREATEST(0, trust_score - 0.1)
       WHERE id = $1`,
      [targetUserId]
    );
  }
}

// ── Platform Stats ───────────────────────────────────────────────────────

export interface PlatformStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  averageTrustScore: number;
  totalFlags: number;
  unresolvedFlags: number;
  totalBanEvents: number;
  trustDistribution: {
    trusted: number;   // >= 0.8
    caution: number;   // >= 0.5
    warning: number;   // > 0.3
    danger: number;    // <= 0.3
  };
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const [users, flags, bans, distribution] = await Promise.all([
    query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_banned = false) AS active,
        COUNT(*) FILTER (WHERE is_banned = true) AS banned,
        COALESCE(AVG(trust_score) FILTER (WHERE is_banned = false), 0) AS avg_score
      FROM users
    `),
    query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE resolved = false) AS unresolved
      FROM community_flags
    `),
    query(`SELECT COUNT(*) AS total FROM ban_events`),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE trust_score >= 0.8) AS trusted,
        COUNT(*) FILTER (WHERE trust_score >= 0.5 AND trust_score < 0.8) AS caution,
        COUNT(*) FILTER (WHERE trust_score > 0.3 AND trust_score < 0.5) AS warning,
        COUNT(*) FILTER (WHERE trust_score <= 0.3) AS danger
      FROM users WHERE is_banned = false
    `),
  ]);

  return {
    totalUsers: parseInt(users.rows[0].total, 10),
    activeUsers: parseInt(users.rows[0].active, 10),
    bannedUsers: parseInt(users.rows[0].banned, 10),
    averageTrustScore: parseFloat(parseFloat(users.rows[0].avg_score).toFixed(4)),
    totalFlags: parseInt(flags.rows[0].total, 10),
    unresolvedFlags: parseInt(flags.rows[0].unresolved, 10),
    totalBanEvents: parseInt(bans.rows[0].total, 10),
    trustDistribution: {
      trusted: parseInt(distribution.rows[0].trusted, 10),
      caution: parseInt(distribution.rows[0].caution, 10),
      warning: parseInt(distribution.rows[0].warning, 10),
      danger: parseInt(distribution.rows[0].danger, 10),
    },
  };
}
