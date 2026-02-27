-- =============================================================
-- bchat Phase 7 Migration: AI Scam Detection Tables
-- Run: psql -d bchat -f 007_scam_detection.sql
-- =============================================================

-- ===================== SCAM PATTERNS =====================
-- Admin-configurable detection rules.
-- Built-in patterns ship with bchat and can be deactivated but not deleted.
CREATE TABLE IF NOT EXISTS scam_patterns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  category      TEXT NOT NULL,            -- e.g. 'seed_theft', 'investment_fraud', 'phishing', 'impersonation'
  regex         TEXT NOT NULL,            -- The detection regex (validated before saving)
  severity      TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  alert_message TEXT NOT NULL,            -- Shown to the potential victim
  is_active     BOOLEAN DEFAULT true,
  is_built_in   BOOLEAN DEFAULT false,    -- Ships with bchat — can disable, can't delete
  created_by    UUID REFERENCES users(id),
  updated_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scam_patterns_active
  ON scam_patterns(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scam_patterns_category
  ON scam_patterns(category);

-- ===================== SCAM ALERTS =====================
-- Every time a pattern triggers, an alert is stored for
-- the RECIPIENT (victim) only. The sender never sees this.
CREATE TABLE IF NOT EXISTS scam_alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          UUID,                   -- Reference to the flagged message (nullable for previews)
  sender_id           UUID NOT NULL,
  recipient_id        UUID NOT NULL,
  pattern_id          UUID NOT NULL REFERENCES scam_patterns(id),
  severity            TEXT NOT NULL,
  matched_text        TEXT,                    -- The text that triggered the pattern (truncated)
  shown_to_recipient  BOOLEAN DEFAULT false,   -- Has the victim seen this alert?
  dismissed           BOOLEAN DEFAULT false,    -- Victim acknowledged and closed
  dismissed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scam_alerts_recipient
  ON scam_alerts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_scam_alerts_sender
  ON scam_alerts(sender_id);
CREATE INDEX IF NOT EXISTS idx_scam_alerts_pattern
  ON scam_alerts(pattern_id);
CREATE INDEX IF NOT EXISTS idx_scam_alerts_unread
  ON scam_alerts(recipient_id)
  WHERE shown_to_recipient = false AND dismissed = false;
CREATE INDEX IF NOT EXISTS idx_scam_alerts_recent
  ON scam_alerts(created_at DESC);

-- ===================== AUTO-RESTRICT EVENTS =====================
-- When composite scam score exceeds threshold, sender's trust
-- is reduced automatically. Admin still reviews for full ban.
CREATE TABLE IF NOT EXISTS scam_auto_restrict_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID NOT NULL REFERENCES users(id),
  composite_score NUMERIC(5,4) NOT NULL,
  penalty_applied NUMERIC(5,4) NOT NULL,
  pattern_ids     UUID[] NOT NULL,          -- Array of triggered pattern IDs
  alert_count     INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_restrict_sender
  ON scam_auto_restrict_events(sender_id);
CREATE INDEX IF NOT EXISTS idx_auto_restrict_recent
  ON scam_auto_restrict_events(created_at DESC);

-- ===================== PATTERN AUDIT LOG =====================
-- Every create/update/delete of a pattern is logged here.
CREATE TABLE IF NOT EXISTS scam_pattern_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id   UUID NOT NULL,               -- May reference deleted patterns
  admin_id     UUID NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  before_state JSONB,                       -- Full pattern state before change
  after_state  JSONB,                       -- Full pattern state after change
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_audit_pattern
  ON scam_pattern_audit(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_audit_admin
  ON scam_pattern_audit(admin_id);
CREATE INDEX IF NOT EXISTS idx_pattern_audit_recent
  ON scam_pattern_audit(created_at DESC);

-- ===================== SEED DATA: BUILT-IN PATTERNS =====================
INSERT INTO scam_patterns (name, description, category, regex, severity, alert_message, is_built_in)
VALUES
  -- CRITICAL: Seed phrase / private key theft
  (
    'Seed Phrase Request',
    'Detects requests for seed phrases, recovery words, or mnemonic phrases',
    'seed_theft',
    'seed\s*phrase|recovery\s*(phrase|words|key)|mnemonic\s*(phrase|words)?',
    'CRITICAL',
    'NEVER share your seed phrase or recovery words with anyone. No legitimate service will ever ask for these. This is a scam.',
    true
  ),
  (
    'Private Key Request',
    'Detects requests for private keys or secret keys',
    'seed_theft',
    'private\s*key|secret\s*key|keystore\s*file',
    'CRITICAL',
    'NEVER share your private key with anyone. Anyone asking for your private key is attempting to steal your funds.',
    true
  ),
  (
    '12/24 Word Request',
    'Detects references to 12-word or 24-word backup phrases',
    'seed_theft',
    '(12|24|twelve|twenty.?four)[\s-]*(word|phrase)',
    'CRITICAL',
    'Someone is asking about your backup phrase. This is a classic crypto theft technique. NEVER share these words.',
    true
  ),
  -- CRITICAL: Investment doubling scams
  (
    'Investment Doubling Scam',
    'Detects classic "send X get 2X back" fraud',
    'investment_fraud',
    'double\s*(your|the|my)\s*(money|investment|crypto|btc|eth|bitcoin|ethereum)',
    'CRITICAL',
    'This is a classic investment doubling scam. No one can guarantee to double your money. You will lose everything you send.',
    true
  ),
  (
    'Guaranteed Returns',
    'Detects promises of guaranteed investment returns',
    'investment_fraud',
    'guaranteed\s*(return|profit|gain|income)|100%\s*(return|profit|guaranteed)',
    'CRITICAL',
    'No investment has guaranteed returns. This is a hallmark of investment fraud.',
    true
  ),
  -- HIGH: Wallet/crypto transfer requests
  (
    'Crypto Transfer Request',
    'Detects requests to send cryptocurrency',
    'fund_theft',
    'send\s*(me\s*)?(your\s*)?(btc|eth|crypto|bitcoin|ethereum|usdt|usdc|sol|bnb)',
    'HIGH',
    'Someone is asking you to send cryptocurrency. Verify their identity and trust score before any transaction.',
    true
  ),
  (
    'Wallet Connection Request',
    'Detects requests to connect wallet to unknown sites',
    'phishing',
    'connect\s*(your\s*)?(wallet|metamask|phantom|trust.?wallet)',
    'HIGH',
    'Only connect your wallet to verified dApps. Unknown wallet connection requests are a common phishing vector.',
    true
  ),
  (
    'Suspicious Link Sharing',
    'Detects attempts to share links from new contacts',
    'phishing',
    'click\s*(this|here|the|my)\s*(link|url)|check\s*(out\s*)?(this|my)\s*(link|site|page)',
    'HIGH',
    'Be cautious of links from new contacts. This could be a phishing attempt. Verify the sender''s trust score.',
    true
  ),
  -- MEDIUM: Social engineering pressure tactics
  (
    'Urgency Pressure',
    'Detects artificial urgency used in social engineering',
    'social_engineering',
    'urgent|act\s*now|limited\s*time|hurry|expires?\s*(soon|today|tonight)|last\s*chance|don.?t\s*miss',
    'MEDIUM',
    'Scammers create artificial urgency to prevent you from thinking critically. Take your time — legitimate offers don''t expire in minutes.',
    true
  ),
  (
    'Trust Manipulation',
    'Detects language designed to manufacture false trust',
    'social_engineering',
    'trust\s*me|i\s*promise|i\s*swear|on\s*my\s*(life|word|honor)|believe\s*me|honestly',
    'MEDIUM',
    'Legitimate contacts don''t need to say "trust me." This language pattern is associated with social engineering.',
    true
  ),
  (
    'Authority Impersonation',
    'Detects claims of being support, admin, or official staff',
    'impersonation',
    'i.?m\s*(from|with)\s*(support|admin|the\s*team|customer\s*service|help\s*desk)|official\s*(support|admin|staff|team)',
    'MEDIUM',
    'This person claims to be support staff. In X Shield, real admins have verified badges and cryptographic proof. Check their profile.',
    true
  ),
  -- LOW: Suspicious patterns worth noting
  (
    'Screen Share Request',
    'Detects requests to share screen (used to watch seed entry)',
    'social_engineering',
    'share\s*(your\s*)?screen|screen\s*share|anydesk|teamviewer|remote\s*(access|desktop)',
    'LOW',
    'Screen sharing with strangers can expose sensitive information. Be cautious about who you share your screen with.',
    true
  ),
  (
    'QR Code Request',
    'Detects requests to scan QR codes (can contain malicious links)',
    'phishing',
    'scan\s*(this|my|the)\s*qr|qr\s*code',
    'LOW',
    'QR codes from unknown contacts can lead to phishing sites or initiate unwanted transactions. Verify the source first.',
    true
  )
ON CONFLICT DO NOTHING;
