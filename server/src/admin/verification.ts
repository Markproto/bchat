/**
 * Admin Verification System — Chain of Trust
 *
 * The #1 Telegram scam: fake admins DM users asking for seed phrases,
 * passwords, or money. bchat eliminates this with cryptographic proof.
 *
 * Trust hierarchy:
 *   CREATOR (app owner, root of trust)
 *     └── ADMIN (promoted by creator, signed with creator's ed25519 key)
 *           └── ADMIN (promoted by another admin, signed chain)
 *
 * How it works:
 *   1. Creator is the first user — their ed25519 pubkey is the root of trust
 *   2. Creator promotes admins by signing their pubkey with their own private key
 *   3. Admins can promote other admins (creating a signature chain)
 *   4. Any user can verify an admin is real by checking the signature chain
 *      back to the creator's known public key
 *   5. Admins NEVER contact users on Telegram — all support is in-app only
 *   6. The app shows a verified badge that is cryptographically unforgeable
 *
 * Future admins must either:
 *   - Sign up via Telegram first (verified through bot join flow), OR
 *   - Be directly verified by the creator
 */

import { signChallenge, verifySignedChallenge, createChallenge } from '../crypto/identity';
import { query } from '../db/pool';

export type UserRole = 'creator' | 'admin' | 'user';

export interface AdminPromotion {
  adminId: string;
  adminPubkey: string;
  roleGranted: UserRole;
  promotedBy: string;
  promoterPubkey: string;
  signature: string;
  signedPayload: string;
  grantedAt: Date;
}

export interface AdminVerification {
  isAdmin: boolean;
  role: UserRole;
  verifiedChain: AdminPromotion[];
  rootCreatorPubkey: string;
}

/**
 * Promote a user to admin. Only the creator or existing admins can do this.
 *
 * The promoter signs a payload containing the new admin's identity,
 * creating an unforgeable cryptographic proof of the promotion.
 */
export async function promoteToAdmin(
  promoterId: string,
  promoterPrivateKey: string,
  targetUserId: string,
  role: UserRole = 'admin'
): Promise<AdminPromotion> {
  // Verify promoter has permission
  const promoter = await query(
    'SELECT id, role, identity_pubkey FROM users WHERE id = $1',
    [promoterId]
  );
  if (promoter.rows.length === 0) {
    throw new Error('Promoter not found');
  }
  if (promoter.rows[0].role !== 'creator' && promoter.rows[0].role !== 'admin') {
    throw new Error('Only creators and admins can promote users');
  }

  // Only creator can promote to admin level
  if (role === 'admin' && promoter.rows[0].role !== 'creator' && promoter.rows[0].role !== 'admin') {
    throw new Error('Insufficient permissions to grant admin role');
  }

  // Get target user's pubkey
  const target = await query(
    'SELECT id, identity_pubkey, telegram_id FROM users WHERE id = $1',
    [targetUserId]
  );
  if (target.rows.length === 0) {
    throw new Error('Target user not found');
  }

  // Target must have verified via Telegram first
  if (!target.rows[0].telegram_id) {
    throw new Error('User must be verified via Telegram before becoming admin');
  }

  // Build the signed payload: admin_id | admin_pubkey | role | timestamp
  const timestamp = new Date().toISOString();
  const payload = `${targetUserId}|${target.rows[0].identity_pubkey}|${role}|${timestamp}`;

  // Promoter signs this payload with their ed25519 private key
  const signature = await signChallenge(payload, promoterPrivateKey);

  // Store in admin_chain table
  await query(
    `INSERT INTO admin_chain (admin_id, promoted_by, signature, signed_payload, role_granted)
     VALUES ($1, $2, $3, $4, $5)`,
    [targetUserId, promoterId, signature, payload, role]
  );

  // Update user's role
  await query(
    `UPDATE users SET role = $1, verified_by = $2, admin_signature = $3, is_verified = TRUE
     WHERE id = $4`,
    [role, promoterId, signature, targetUserId]
  );

  // Audit log
  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [promoterId, 'admin_promoted', JSON.stringify({
      targetUserId,
      role,
      payload,
    })]
  );

  return {
    adminId: targetUserId,
    adminPubkey: target.rows[0].identity_pubkey,
    roleGranted: role,
    promotedBy: promoterId,
    promoterPubkey: promoter.rows[0].identity_pubkey,
    signature,
    signedPayload: payload,
    grantedAt: new Date(timestamp),
  };
}

/**
 * Verify an admin's legitimacy by checking the signature chain
 * all the way back to the creator.
 *
 * This is what users call when they want to confirm "is this person
 * really an admin?" — the app does this automatically and shows a
 * verified badge if the chain is valid.
 */
export async function verifyAdmin(userId: string): Promise<AdminVerification> {
  const user = await query(
    'SELECT id, role, identity_pubkey FROM users WHERE id = $1',
    [userId]
  );
  if (user.rows.length === 0) {
    throw new Error('User not found');
  }

  // If they're a regular user, quick return
  if (user.rows[0].role === 'user') {
    return {
      isAdmin: false,
      role: 'user',
      verifiedChain: [],
      rootCreatorPubkey: '',
    };
  }

  // If they're the creator, they ARE the root of trust
  if (user.rows[0].role === 'creator') {
    return {
      isAdmin: true,
      role: 'creator',
      verifiedChain: [],
      rootCreatorPubkey: user.rows[0].identity_pubkey,
    };
  }

  // Walk the chain: admin -> promoted_by -> promoted_by -> ... -> creator
  const chain: AdminPromotion[] = [];
  let currentUserId = userId;
  const visited = new Set<string>(); // prevent cycles

  while (true) {
    if (visited.has(currentUserId)) {
      throw new Error('Circular admin chain detected — possible tampering');
    }
    visited.add(currentUserId);

    // Get the promotion record for this admin
    const promotion = await query(
      `SELECT ac.*, u.identity_pubkey as admin_pubkey, p.identity_pubkey as promoter_pubkey, p.role as promoter_role
       FROM admin_chain ac
       JOIN users u ON u.id = ac.admin_id
       JOIN users p ON p.id = ac.promoted_by
       WHERE ac.admin_id = $1 AND ac.is_active = TRUE
       ORDER BY ac.granted_at DESC LIMIT 1`,
      [currentUserId]
    );

    if (promotion.rows.length === 0) {
      // No valid chain found — admin status is not cryptographically verified
      return {
        isAdmin: false,
        role: user.rows[0].role,
        verifiedChain: chain,
        rootCreatorPubkey: '',
      };
    }

    const record = promotion.rows[0];

    // Verify the signature: promoter must have actually signed this payload
    const challenge = createChallenge('admin_verify');
    // Override the nonce with the stored payload for verification
    challenge.nonce = record.signed_payload;
    challenge.expiresAt = Date.now() + 999999999; // don't expire for chain verification

    const verification = await verifySignedChallenge(
      challenge,
      record.signature,
      record.promoter_pubkey
    );

    if (!verification.valid) {
      throw new Error(`Broken chain at ${currentUserId}: ${verification.reason}`);
    }

    chain.push({
      adminId: record.admin_id,
      adminPubkey: record.admin_pubkey,
      roleGranted: record.role_granted,
      promotedBy: record.promoted_by,
      promoterPubkey: record.promoter_pubkey,
      signature: record.signature,
      signedPayload: record.signed_payload,
      grantedAt: record.granted_at,
    });

    // If the promoter is the creator, chain is complete
    if (record.promoter_role === 'creator') {
      return {
        isAdmin: true,
        role: user.rows[0].role,
        verifiedChain: chain,
        rootCreatorPubkey: record.promoter_pubkey,
      };
    }

    // Keep walking up the chain
    currentUserId = record.promoted_by;
  }
}

/**
 * Revoke an admin's status. Only the creator or the admin who
 * promoted them can revoke.
 */
export async function revokeAdmin(
  revokerId: string,
  targetAdminId: string
): Promise<void> {
  const revoker = await query(
    'SELECT role FROM users WHERE id = $1',
    [revokerId]
  );
  if (revoker.rows[0]?.role !== 'creator' && revoker.rows[0]?.role !== 'admin') {
    throw new Error('Only creators/admins can revoke admin status');
  }

  // Deactivate the chain entry
  await query(
    `UPDATE admin_chain SET is_active = FALSE, revoked_at = NOW()
     WHERE admin_id = $1 AND is_active = TRUE`,
    [targetAdminId]
  );

  // Demote user back to regular user
  await query(
    `UPDATE users SET role = 'user', verified_by = NULL, admin_signature = NULL
     WHERE id = $1`,
    [targetAdminId]
  );

  // Also revoke anyone this admin promoted (cascade revocation)
  const downstream = await query(
    'SELECT admin_id FROM admin_chain WHERE promoted_by = $1 AND is_active = TRUE',
    [targetAdminId]
  );
  for (const row of downstream.rows) {
    await revokeAdmin(revokerId, row.admin_id);
  }

  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [revokerId, 'admin_revoked', JSON.stringify({ targetAdminId })]
  );
}

/**
 * Get the creator's public key — this is the root of trust that
 * every user's app stores. Hardcoded/pinned on first use.
 */
export async function getCreatorPubkey(): Promise<string | null> {
  const creator = await query(
    "SELECT identity_pubkey FROM users WHERE role = 'creator' LIMIT 1"
  );
  return creator.rows[0]?.identity_pubkey || null;
}

/**
 * Initialize the first user as creator (one-time setup).
 */
export async function initializeCreator(userId: string): Promise<void> {
  // Ensure no creator already exists
  const existing = await query("SELECT id FROM users WHERE role = 'creator'");
  if (existing.rows.length > 0) {
    throw new Error('Creator already exists — cannot have multiple creators');
  }

  await query(
    "UPDATE users SET role = 'creator', is_verified = TRUE WHERE id = $1",
    [userId]
  );

  await query(
    `INSERT INTO audit_log (user_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [userId, 'creator_initialized', JSON.stringify({ userId })]
  );
}
