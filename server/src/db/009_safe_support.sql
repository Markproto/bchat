-- =============================================================
-- bchat Phase 9 Migration: Safe Support System
-- Run: psql -d bchat -f 009_safe_support.sql
-- =============================================================

-- ===================== SIGNING KEY COLUMN =====================
-- ed25519 public key for challenge-response verification.
-- Should already exist from Phase 2 — add if missing.
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS
    signing_public_key TEXT;  -- Base64 ed25519 public key
END $$;

-- ===================== TICKET NUMBER SEQUENCE =====================
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1000;

-- ===================== SUPPORT TICKETS =====================
-- Every support interaction happens INSIDE bchat.
-- No DMs from "support" accounts. No external channels.
CREATE TABLE IF NOT EXISTS support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number     INTEGER UNIQUE NOT NULL DEFAULT nextval('ticket_number_seq'),
  user_id           UUID NOT NULL REFERENCES users(id),
  assigned_admin_id UUID REFERENCES users(id),

  -- Verification state
  admin_verified    BOOLEAN DEFAULT false,
  verified_at       TIMESTAMPTZ,

  -- Ticket metadata
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN (
                      'open', 'assigned', 'pending_verification',
                      'verified', 'resolved', 'closed'
                    )),
  priority          TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category          TEXT NOT NULL
                    CHECK (category IN (
                      'account', 'security', 'billing',
                      'technical', 'report_user', 'general'
                    )),
  subject           TEXT NOT NULL,

  -- Timestamps
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_user
  ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_admin
  ON support_tickets(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status
  ON support_tickets(status) WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX IF NOT EXISTS idx_tickets_priority
  ON support_tickets(priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_number
  ON support_tickets(ticket_number);

-- ===================== TICKET MESSAGES =====================
-- E2EE messages within a ticket. Separate from DM messages.
-- System messages are stored in plaintext (they contain no
-- user content — only status updates like "Admin joined").
CREATE TABLE IF NOT EXISTS ticket_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id           UUID REFERENCES users(id),  -- NULL for system messages

  -- E2EE payload (NULL for system messages)
  ciphertext          TEXT,
  nonce               TEXT,
  sender_public_key   TEXT,

  -- Message metadata
  message_type        TEXT NOT NULL DEFAULT 'text'
                      CHECK (message_type IN ('text', 'image', 'file', 'system')),
  is_system_message   BOOLEAN DEFAULT false,
  system_message_text TEXT,  -- Plaintext ONLY for system-generated status messages

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_msgs_ticket
  ON ticket_messages(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_msgs_sender
  ON ticket_messages(sender_id);

-- ===================== VERIFICATION CHALLENGES =====================
-- Cryptographic challenge-response for admin identity proof.
CREATE TABLE IF NOT EXISTS ticket_verification_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_id    UUID NOT NULL REFERENCES users(id),
  nonce       TEXT NOT NULL,          -- Base64 random nonce (32 bytes)
  expires_at  TIMESTAMPTZ NOT NULL,   -- 5-minute window
  verified    BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  expired     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_challenges_ticket
  ON ticket_verification_challenges(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_challenges_admin
  ON ticket_verification_challenges(admin_id);
CREATE INDEX IF NOT EXISTS idx_ticket_challenges_pending
  ON ticket_verification_challenges(ticket_id)
  WHERE verified = false AND expired = false;

-- ===================== TICKET EVENTS =====================
-- Full audit log of every ticket lifecycle event.
CREATE TABLE IF NOT EXISTS ticket_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id),  -- NULL for system events
  event_type  TEXT NOT NULL,               -- created, admin_assigned, admin_verified, etc.
  detail      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket
  ON ticket_events(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_events_actor
  ON ticket_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_type
  ON ticket_events(event_type);
