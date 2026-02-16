/**
 * Invite Chain Accountability
 *
 * Every user enters through an invite from someone. We track
 * who invited whom. If someone keeps inviting bad actors
 * (banned users), their invite privileges get revoked.
 *
 * This creates social cost: if you hand out your invite link
 * to strangers who turn out to be scammers, YOU lose the ability
 * to invite more people. This makes the community self-policing.
 *
 * Trust score formula:
 *   score = 1.0 - (invites_banned / invites_sent * penalty_weight)
 *   If score drops below 0.3, invite privileges are revoked.
 */

import { query } from '../db';

const PENALTY_WEIGHT = 2.0;  // Each banned invitee costs 2x
const MIN_TRUST_SCORE = 0.3; // Below this, can't invite
const MAX_INVITES_NEW_USER = 3; // New users get limited invites

/**
 * Record an invite chain link when a new user registers.
 */
export async function recordInviteChain(
  inviterId: string,
  inviteeId: string,
  inviteCode?: string
): Promise<void> {
  await query(
    `INSERT INTO invite_chain (inviter_id, invitee_id, invite_code)
     VALUES ($1, $2, $3)`,
    [inviterId, inviteeId, inviteCode]
  );

  // Initialize or update inviter reputation
  await query(
    `INSERT INTO inviter_reputation (user_id, invites_sent)
     VALUES ($1, 1)
     ON CONFLICT (user_id) DO UPDATE SET
       invites_sent = inviter_reputation.invites_sent + 1,
       updated_at = NOW()`,
    [inviterId]
  );
}

/**
 * When a user gets banned, penalize everyone up the invite chain.
 * The direct inviter gets the most penalty; upstream inviters get less.
 */
export async function penalizeInviteChain(bannedUserId: string): Promise<{
  penalized: Array<{ userId: string; newScore: number; invitesRevoked: boolean }>;
}> {
  const penalized: Array<{ userId: string; newScore: number; invitesRevoked: boolean }> = [];

  // Walk up the invite chain
  let currentUserId = bannedUserId;
  let depth = 0;
  const maxDepth = 3; // Only penalize 3 levels up

  while (depth < maxDepth) {
    const inviter = await query(
      'SELECT inviter_id FROM invite_chain WHERE invitee_id = $1 ORDER BY created_at DESC LIMIT 1',
      [currentUserId]
    );

    if (inviter.rows.length === 0) break;

    const inviterId = inviter.rows[0].inviter_id;

    // Increase the inviter's ban count
    await query(
      `INSERT INTO inviter_reputation (user_id, invites_banned)
       VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE SET
         invites_banned = inviter_reputation.invites_banned + 1,
         updated_at = NOW()`,
      [inviterId]
    );

    // Recalculate trust score
    const rep = await query(
      'SELECT invites_sent, invites_banned FROM inviter_reputation WHERE user_id = $1',
      [inviterId]
    );

    if (rep.rows.length > 0) {
      const { invites_sent, invites_banned } = rep.rows[0];
      const penaltyFactor = depth === 0 ? PENALTY_WEIGHT : PENALTY_WEIGHT / (depth + 1);
      const newScore = Math.max(0, 1.0 - (invites_banned / Math.max(invites_sent, 1)) * penaltyFactor);
      const invitesRevoked = newScore < MIN_TRUST_SCORE;

      await query(
        `UPDATE inviter_reputation SET trust_score = $1, can_invite = $2, updated_at = NOW()
         WHERE user_id = $3`,
        [newScore, !invitesRevoked, inviterId]
      );

      penalized.push({ userId: inviterId, newScore, invitesRevoked });

      // Audit
      await query(
        `INSERT INTO audit_log (user_id, event_type, details)
         VALUES ($1, $2, $3)`,
        [inviterId, 'invite_penalty', JSON.stringify({
          bannedUserId,
          depth,
          newScore,
          invitesRevoked,
        })]
      );
    }

    currentUserId = inviterId;
    depth++;
  }

  return { penalized };
}

/**
 * Check if a user can still send invites.
 */
export async function canUserInvite(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  remainingInvites?: number;
  trustScore: number;
}> {
  const rep = await query(
    'SELECT invites_sent, invites_banned, trust_score, can_invite FROM inviter_reputation WHERE user_id = $1',
    [userId]
  );

  // New user — no reputation yet, give them limited invites
  if (rep.rows.length === 0) {
    return {
      allowed: true,
      remainingInvites: MAX_INVITES_NEW_USER,
      trustScore: 1.0,
    };
  }

  const r = rep.rows[0];

  if (!r.can_invite) {
    return {
      allowed: false,
      reason: `Invite privileges revoked. ${r.invites_banned} of your invitees were banned.`,
      trustScore: r.trust_score,
    };
  }

  // Higher trust = more invites allowed
  const maxInvites = Math.floor(r.trust_score * 20) + MAX_INVITES_NEW_USER;
  const remaining = maxInvites - r.invites_sent;

  if (remaining <= 0) {
    return {
      allowed: false,
      reason: 'You have used all your invite slots. Build reputation to earn more.',
      remainingInvites: 0,
      trustScore: r.trust_score,
    };
  }

  return {
    allowed: true,
    remainingInvites: remaining,
    trustScore: r.trust_score,
  };
}

/**
 * Get the full invite tree for a user (who invited them, and who they invited).
 */
export async function getInviteTree(userId: string): Promise<{
  invitedBy: string | null;
  invitees: Array<{ userId: string; bannedStatus: boolean; createdAt: Date }>;
}> {
  const invitedBy = await query(
    'SELECT inviter_id FROM invite_chain WHERE invitee_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  const invitees = await query(
    `SELECT ic.invitee_id as user_id, u.is_active, ic.created_at
     FROM invite_chain ic
     JOIN users u ON u.id = ic.invitee_id
     WHERE ic.inviter_id = $1
     ORDER BY ic.created_at DESC`,
    [userId]
  );

  return {
    invitedBy: invitedBy.rows[0]?.inviter_id || null,
    invitees: invitees.rows.map(r => ({
      userId: r.user_id,
      bannedStatus: !r.is_active,
      createdAt: r.created_at,
    })),
  };
}
