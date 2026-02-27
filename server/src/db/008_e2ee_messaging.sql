-- =============================================================
-- bchat Phase 8 Migration: E2EE Messaging Support
-- Run: psql -d bchat -f 008_e2ee_messaging.sql
-- =============================================================

-- Add sender's encryption public key to messages so recipients
-- can decrypt without a separate key lookup per message.
DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_public_key TEXT;
END $$;

-- Add message_type for distinguishing text/image/file on the envelope
DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
END $$;

-- Ensure users.encryption_pubkey is indexed for key lookups
CREATE INDEX IF NOT EXISTS idx_users_encryption_pubkey
  ON users(id) WHERE encryption_pubkey IS NOT NULL;

-- Composite index for fetching conversation messages efficiently
CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq
  ON messages(conversation_id, sequence_num DESC);
