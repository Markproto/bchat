-- =============================================================
-- bchat Phase 6 Migration: Cooling Period Tables
-- Run: psql -d bchat -f 006_cooling_period.sql
-- =============================================================

-- ===================== CONTACT PAIRS =====================
-- Tracks first interaction between two users.
-- UUID pair is normalized (lower UUID always in user_a) to prevent duplicates.
CREATE TABLE IF NOT EXISTS contact_pairs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a            UUID NOT NULL REFERENCES users(id),
  user_b            UUID NOT NULL REFERENCES users(id),
  first_interaction TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_contact_pair UNIQUE (user_a, user_b),
  CONSTRAINT chk_pair_order  CHECK  (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_contact_pairs_user_a
  ON contact_pairs(user_a);
CREATE INDEX IF NOT EXISTS idx_contact_pairs_user_b
  ON contact_pairs(user_b);

-- ===================== COOLING BLOCK EVENTS =====================
-- Audit log of every message blocked by the cooling period.
-- Used for admin dashboards and scam pattern analysis.
CREATE TABLE IF NOT EXISTS cooling_block_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id         UUID NOT NULL REFERENCES users(id),
  recipient_id      UUID NOT NULL REFERENCES users(id),
  blocked_category  TEXT NOT NULL,           -- walletAddresses, externalLinks, seedKeywords
  matched_pattern   TEXT,                    -- regex source that triggered the block
  hours_remaining   INTEGER NOT NULL,        -- hours left in cooling at time of block
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cooling_blocks_sender
  ON cooling_block_events(sender_id);
CREATE INDEX IF NOT EXISTS idx_cooling_blocks_recipient
  ON cooling_block_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_cooling_blocks_category
  ON cooling_block_events(blocked_category);

-- ===================== DONE =====================
-- Verify with: \dt contact_pairs
-- Verify with: \dt cooling_block_events
