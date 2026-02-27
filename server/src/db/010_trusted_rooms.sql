-- =============================================================
-- bchat Phase 10 Migration: Trusted Room Auto-Access
-- Run: psql -d bchat -f 010_trusted_rooms.sql
-- =============================================================

-- ===================== TRUSTED ROOMS =====================
-- Rooms (Telegram groups or bchat conversations) whose members
-- get auto-access without individual invite codes.
-- A membership_cutoff date ensures only members who joined
-- BEFORE the admin opened the pathway qualify.
CREATE TABLE IF NOT EXISTS trusted_rooms (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source type: 'telegram' for Telegram groups, 'bchat' for bchat conversations
  source_type         TEXT NOT NULL CHECK (source_type IN ('telegram', 'bchat')),

  -- For Telegram groups: the chat ID (bigint from Telegram API)
  telegram_chat_id    BIGINT UNIQUE,

  -- For bchat groups: FK to conversations table
  conversation_id     UUID REFERENCES conversations(id),

  -- Human-readable label (e.g. "Alpha Traders VIP")
  name                TEXT NOT NULL,

  -- The admin who designated this room as trusted
  created_by          UUID NOT NULL REFERENCES users(id),

  -- Trust score assigned to users auto-admitted via this room.
  -- Default 0.40 (below the standard 0.50 for invite-code users).
  default_trust_score NUMERIC(5,4) DEFAULT 0.4000,

  -- Only members who joined the source room BEFORE this timestamp qualify.
  -- Anyone joining after must go through the normal invite flow.
  membership_cutoff   TIMESTAMPTZ NOT NULL,

  -- Maximum users that can be auto-admitted via this room (0 = unlimited)
  max_members         INTEGER DEFAULT 0,

  -- Current count of users auto-admitted via this room
  admitted_count      INTEGER DEFAULT 0,

  -- Whether this room is currently active for auto-access
  is_active           BOOLEAN DEFAULT TRUE,

  -- If deactivated, who did it and why
  deactivated_by      UUID REFERENCES users(id),
  deactivated_at      TIMESTAMPTZ,
  deactivation_reason TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure either telegram_chat_id or conversation_id is set (not both, not neither)
  CONSTRAINT trusted_rooms_source_check CHECK (
    (source_type = 'telegram' AND telegram_chat_id IS NOT NULL AND conversation_id IS NULL) OR
    (source_type = 'bchat' AND conversation_id IS NOT NULL AND telegram_chat_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_trusted_rooms_telegram
  ON trusted_rooms(telegram_chat_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_trusted_rooms_conversation
  ON trusted_rooms(conversation_id) WHERE is_active = TRUE;

-- ===================== TRUSTED ROOM ADMISSIONS =====================
-- Audit trail: every user auto-admitted via a trusted room.
CREATE TABLE IF NOT EXISTS trusted_room_admissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trusted_room_id   UUID NOT NULL REFERENCES trusted_rooms(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  telegram_user_id  BIGINT,
  admitted_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (trusted_room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_room_admissions_user
  ON trusted_room_admissions(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_room_admissions_room
  ON trusted_room_admissions(trusted_room_id);

-- ===================== USERS TABLE: ADMISSION SOURCE =====================
-- Track how a user was admitted, for cascade penalty routing.
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS
    admission_source TEXT DEFAULT 'invite';  -- 'invite' | 'trusted_room'
  ALTER TABLE users ADD COLUMN IF NOT EXISTS
    trusted_room_id UUID REFERENCES trusted_rooms(id);
END $$;

CREATE INDEX IF NOT EXISTS idx_users_trusted_room
  ON users(trusted_room_id) WHERE trusted_room_id IS NOT NULL;
