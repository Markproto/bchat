-- =============================================================
-- bchat Phase 5 Migration: Trust Engine Tables
-- Run: psql -d bchat -f 005_trust_engine.sql
-- =============================================================

-- ===================== COLUMNS ON USERS TABLE =====================
-- Add trust-related columns if they don't exist yet
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score NUMERIC(5,4) DEFAULT 0.5000;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS can_invite BOOLEAN DEFAULT true;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES users(id);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_depth INTEGER DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified_admin BOOLEAN DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS fingerprint TEXT;
END $$;

-- ===================== BANNED DEVICES =====================
-- Prevents re-registration from banned hardware
CREATE TABLE IF NOT EXISTS banned_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     TEXT UNIQUE NOT NULL,
  banned_by     UUID REFERENCES users(id),
  reason        TEXT NOT NULL,
  original_user_id UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banned_devices_device
  ON banned_devices(device_id);

-- ===================== BAN EVENTS =====================
-- Audit log of every ban action
CREATE TABLE IF NOT EXISTS ban_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  UUID NOT NULL REFERENCES users(id),
  admin_id        UUID NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL,
  device_banned   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ban_events_target
  ON ban_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_ban_events_admin
  ON ban_events(admin_id);

-- ===================== CASCADE EVENTS =====================
-- Records every cascade penalty applied up the invite chain
CREATE TABLE IF NOT EXISTS cascade_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banned_user_id   UUID NOT NULL REFERENCES users(id),
  affected_user_id UUID NOT NULL REFERENCES users(id),
  level            INTEGER NOT NULL,          -- 1 = direct inviter, 2 = inviter's inviter
  penalty          NUMERIC(5,4) NOT NULL,     -- Amount subtracted from score
  previous_score   NUMERIC(5,4) NOT NULL,
  new_score        NUMERIC(5,4) NOT NULL,
  invite_revoked   BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cascade_banned
  ON cascade_events(banned_user_id);
CREATE INDEX IF NOT EXISTS idx_cascade_affected
  ON cascade_events(affected_user_id);

-- ===================== COMMUNITY FLAGS =====================
-- Users flag suspicious behavior; threshold triggers auto-restriction
CREATE TABLE IF NOT EXISTS community_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flagger_id      UUID NOT NULL REFERENCES users(id),
  target_user_id  UUID NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL,
  resolved        BOOLEAN DEFAULT false,
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flags_target
  ON community_flags(target_user_id);
CREATE INDEX IF NOT EXISTS idx_flags_flagger
  ON community_flags(flagger_id);
CREATE INDEX IF NOT EXISTS idx_flags_unresolved
  ON community_flags(target_user_id) WHERE resolved = false;

-- Prevent duplicate flags in cooldown window (enforced at app level too)
CREATE UNIQUE INDEX IF NOT EXISTS idx_flags_cooldown
  ON community_flags(flagger_id, target_user_id, (created_at::date));

-- ===================== INVITE CODES =====================
-- Add revoked columns if not present from earlier phases
DO $$ BEGIN
  ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT false;
  ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
END $$;

-- ===================== MESSAGES TABLE (for activity scoring) =====================
-- Minimal messages table if not created in Phase 3/4
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES users(id),
  channel_id  UUID,
  content_hash TEXT,    -- We never store plaintext (E2EE)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_recent
  ON messages(sender_id, created_at DESC);

-- ===================== TRUST SCORE INDEX =====================
-- Fast lookups for leaderboard and trust distribution queries
CREATE INDEX IF NOT EXISTS idx_users_trust_score
  ON users(trust_score DESC) WHERE is_banned = false;

CREATE INDEX IF NOT EXISTS idx_users_banned
  ON users(is_banned) WHERE is_banned = true;

CREATE INDEX IF NOT EXISTS idx_users_invited_by
  ON users(invited_by);

-- ===================== DONE =====================
-- Verify with: \dt to see all tables
-- Verify columns: \d users
