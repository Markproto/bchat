import { useState } from "react";

// ===================== THEME (matches App.tsx) =====================
const T = {
  bg: "#0a0b10", card: "#111827", border: "#1f2937", text: "#e2e8f0",
  muted: "#6b7b8d", accent: "#94a3b8", danger: "#ff4757", warn: "#ffa502",
  input: "#0d1117", silver: "#c9d1d9", bright: "#e6edf3",
};

// ===================== SLIDE DATA =====================
interface Slide {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  bullets: { label: string; detail: string; color?: string }[];
  diagram?: string[];
  tip?: string;
}

const SLIDES: Slide[] = [
  // ── 1. Welcome ────────────────────────────────────────────
  {
    id: "welcome",
    icon: "\u{1F6E1}",
    title: "Welcome to X Shield",
    subtitle: "Fraud-elimination messaging for crypto communities. This walkthrough covers setup through daily operation.",
    bullets: [
      { label: "End-to-end encrypted", detail: "NaCl box encryption — the server never sees your messages" },
      { label: "Cryptographic identity", detail: "Every user has an ed25519 keypair — unforgeable proof of who you are" },
      { label: "AI scam detection", detail: "12 built-in patterns catch seed theft, phishing, and social engineering in real time" },
      { label: "Trust scoring", detail: "5-factor scoring from 0.00 to 1.00 tracks reputation across the community" },
    ],
    tip: "Swipe through each slide or use the Next button below.",
  },

  // ── 2. Telegram Bot Setup ─────────────────────────────────
  {
    id: "telegram-setup",
    icon: "\u{1F916}",
    title: "Step 1 \u2014 Telegram Bot Setup",
    subtitle: "X Shield uses Telegram as the entry gate. Users must join your Telegram channel before they can create a X Shield account.",
    bullets: [
      { label: "Create the bot", detail: "Open Telegram, message @BotFather, send /newbot, pick a name and username" },
      { label: "Get the token", detail: "BotFather gives you a token like 123456789:ABCdef... \u2014 save this" },
      { label: "Create your channel", detail: "Make a Telegram group or channel. Add your bot as an administrator" },
      { label: "Configure .env", detail: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in your server .env file" },
    ],
    diagram: [
      "User joins Telegram channel",
      "\u2193",
      "Bot records join event in database",
      "\u2193",
      "User opens X Shield web app",
      "\u2193",
      "Server verifies Telegram join record",
      "\u2193",
      "Account created \u2192 JWT issued \u2192 user is in",
    ],
    tip: "Bot commands: /start (welcome), /invite (admin: generate invite code), /verify (check join status)",
  },

  // ── 3. Creator (Root Admin) ────────────────────────────────
  {
    id: "creator-setup",
    icon: "\u{1F451}",
    title: "Step 2 \u2014 Creator Setup",
    subtitle: "The Creator is the root of trust. Every admin, every verification chain, every cryptographic proof traces back to this single identity.",
    bullets: [
      { label: "One-time action", detail: "POST /api/admin/initialize \u2014 only works once, ever. Second call fails." },
      { label: "What happens", detail: "Your ed25519 public key becomes the root trust anchor for the entire system" },
      { label: "Root of trust", detail: "Like HTTPS root certificates \u2014 all admin proofs chain back to your key" },
      { label: "Unforgeable", detail: "Private key never leaves your device. Scammers can copy your name but never forge your signature." },
    ],
    diagram: [
      "Creator (root pubkey: 7a3f...b2c1)",
      "\u2502",
      "\u251C\u2500 Promotes Admin_Alice (signed by Creator)",
      "\u2502   \u2514\u2500 Promotes Admin_Bob (signed by Alice)",
      "\u2502",
      "\u2514\u2500 Any user clicks 'Verify Admin'",
      "    Server walks chain \u2192 Bob \u2192 Alice \u2192 Creator \u2713",
    ],
    tip: "Back up your private key from localStorage (bchat_e2ee_keypair). If you lose it, you can't sign new admin promotions.",
  },

  // ── 4. Inviting Users ──────────────────────────────────────
  {
    id: "inviting",
    icon: "\u{1F4E8}",
    title: "Step 3 \u2014 Inviting Users",
    subtitle: "X Shield is invite-only. Every user is permanently linked to whoever invited them, creating accountability chains.",
    bullets: [
      { label: "Generate codes", detail: "Settings > Invite Codes > Generate. 8-char code, single-use, expires in 24h." },
      { label: "Accountability", detail: "If your invitee gets banned, YOUR trust score drops 15%. Their inviter drops 8%." },
      { label: "Trust required", detail: "You need trust score \u2265 0.80 (or admin status) to generate invite codes" },
      { label: "Anti-impersonation", detail: "New accounts with names too similar to admins are auto-blocked at signup" },
    ],
    diagram: [
      "Creator",
      "\u251C\u2500 invites User_A (code: abc12345)",
      "\u2502   \u251C\u2500 invites User_B",
      "\u2502   \u2514\u2500 invites User_C",
      "\u2502",
      "If User_C gets banned:",
      "  User_C: score \u2192 0 (deactivated)",
      "  User_B: \u221215% (direct inviter)",
      "  User_A: \u22128%  (one level up)",
      "  Creator: \u22124%  (two levels up)",
    ],
  },

  // ── 5. Trusted Rooms ──────────────────────────────────────
  {
    id: "trusted-rooms",
    icon: "\u{1F3E0}",
    title: "Step 4b \u2014 Trusted Rooms",
    subtitle: "Admins can designate Telegram groups as trusted sources. Members who joined before a cutoff date get auto-access \u2014 no personal invite code needed.",
    bullets: [
      { label: "Membership cutoff", detail: "Only members who joined the Telegram group BEFORE the admin-set cutoff date qualify. Post-cutoff joins need a regular invite." },
      { label: "Lower trust score", detail: "Trusted-room users start at 0.40 (vs 0.50 for personally invited users) \u2014 nobody vouched for them individually." },
      { label: "Room creator accountability", detail: "If a trusted-room user gets banned, cascade penalties flow to the admin who created the trusted room (at 50% dampening)." },
      { label: "Auto-deactivation", detail: "If 3+ users from a trusted room get banned, the room is automatically deactivated as a safety measure." },
    ],
    diagram: [
      "Admin runs /trustroom enable 2026-02-25",
      "\u2193",
      "Bot checks each joiner's join date vs cutoff",
      "\u2193",
      "Joined BEFORE cutoff \u2192 auto-access granted",
      "Joined AFTER cutoff  \u2192 invite code required",
      "\u2193",
      "All protections still apply: cooling, scam detection, device binding",
    ],
    tip: "Trusted room users go through the same 72-hour cooling period and AI scam detection as everyone else. Auto-access only skips the invite code.",
  },

  // ── 6. Promoting Sub-Admins ────────────────────────────────
  {
    id: "sub-admins",
    icon: "\u{1F46E}",
    title: "Step 5 \u2014 Promoting Sub-Admins",
    subtitle: "Admin promotion requires a cryptographic signature. You sign a statement saying 'I vouch for this person' with your private key.",
    bullets: [
      { label: "Signed payload", detail: "targetUserId | targetPubkey | role | timestamp \u2014 signed with promoter's ed25519 key" },
      { label: "Stored forever", detail: "The signature is stored in admin_chain table. Anyone can verify it later." },
      { label: "Cascade revocation", detail: "Revoking Admin_Alice also revokes everyone she promoted. Chain breaks downstream." },
      { label: "Verify Admin button", detail: "Users can click this on any support ticket to see the full cryptographic proof chain." },
    ],
    tip: "Only promote when you need someone to manage tickets, ban users, or manage scam patterns. Regular users don't need admin.",
  },

  // ── 6. Trust Engine ────────────────────────────────────────
  {
    id: "trust-engine",
    icon: "\u{1F3AF}",
    title: "Step 5 \u2014 Trust Scoring",
    subtitle: "Every user has a trust score from 0.00 to 1.00. It's calculated from 5 weighted factors and visible to everyone.",
    bullets: [
      { label: "Account age (20%)", detail: "Days since registration, maxes out at 365 days", color: T.accent },
      { label: "Invite quality (25%)", detail: "Ratio of good vs banned invitees \u2014 the heaviest factor", color: T.accent },
      { label: "Community standing (20%)", detail: "Inverse of flags received from other users", color: T.accent },
      { label: "Activity level (15%)", detail: "Messages in last 30 days, maxes at 100 messages", color: T.accent },
      { label: "Inviter trust (20%)", detail: "Trust score of the person who invited you", color: T.accent },
    ],
    diagram: [
      "Score      Label      Invite Access",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      "0.80+      Trusted    Yes",
      "0.50-0.79  Caution    No",
      "0.40-0.49  Warning    Revoked",
      "< 0.40     Danger     Revoked",
    ],
  },

  // ── 7. AI Scam Detection ───────────────────────────────────
  {
    id: "scam-detection",
    icon: "\u{1F9E0}",
    title: "Step 6 \u2014 AI Scam Detection",
    subtitle: "Every message is scanned against pattern rules. Alerts are shown ONLY to the recipient \u2014 the sender never knows they were flagged.",
    bullets: [
      { label: "Seed theft (CRITICAL)", detail: "'seed phrase', 'private key', '12/24 word phrase', 'mnemonic' \u2192 weight 0.40", color: T.danger },
      { label: "Investment fraud (CRITICAL)", detail: "'double your money', 'guaranteed returns', '100% profit' \u2192 weight 0.40", color: T.danger },
      { label: "Fund theft / phishing (HIGH)", detail: "'send me your ETH', 'connect your wallet', suspicious links \u2192 weight 0.25", color: T.warn },
      { label: "Social engineering (MEDIUM)", detail: "'act now', 'trust me', 'I'm from support' \u2192 weight 0.15", color: "#ffcc00" },
    ],
    diagram: [
      "Message scanned against all active patterns",
      "\u2193",
      "Composite score = sum of severity weights",
      "\u2193",
      "Score < 0.60: Alerts created, sender NOT restricted",
      "Score \u2265 0.60: Alerts + sender AUTO-RESTRICTED",
      "             \u221215% trust score, invites revoked",
    ],
    tip: "Admins can add custom patterns via Settings > Scam Patterns. Example: catch fake airdrop scams with a regex like 'free\\s*airdrop|claim\\s*tokens'.",
  },

  // ── 8. Contact Cooling ─────────────────────────────────────
  {
    id: "cooling",
    icon: "\u{2744}",
    title: "Step 7 \u2014 Contact Cooling Periods",
    subtitle: "When two users first interact, a 72-hour cooling window blocks dangerous content. Normal text flows freely.",
    bullets: [
      { label: "Blocked during cooling", detail: "Wallet addresses (0x..., bc1...), external links, seed phrase keywords" },
      { label: "Why 72 hours", detail: "Most crypto scams happen on first contact. The delay breaks the urgency trick." },
      { label: "One-time", detail: "Once the 72h expires, it never restarts \u2014 even if you re-add the contact" },
      { label: "Admin bypass", detail: "Admins can click 'Exempt' to instantly clear cooling for contacts they know" },
    ],
    tip: "A yellow banner appears in chat during cooling: 'Cooling period active \u2014 Xh remaining'.",
  },

  // ── 9. E2EE ────────────────────────────────────────────────
  {
    id: "e2ee",
    icon: "\u{1F512}",
    title: "Step 8 \u2014 End-to-End Encryption",
    subtitle: "Messages use NaCl box encryption (X25519 + XSalsa20-Poly1305) \u2014 the same primitive used by Signal.",
    bullets: [
      { label: "Key exchange", detail: "Your ed25519 keypair generates X25519 keys. Shared secret derived per-contact." },
      { label: "Server sees NOTHING", detail: "Only encrypted bytes + metadata (who, when, size). Content is opaque." },
      { label: "Scam detection tradeoff", detail: "Client sends a plaintext hint alongside ciphertext. Server checks it in-memory, never stores it." },
      { label: "Key storage", detail: "Keypair lives in browser localStorage. Future: derive from BIP39 mnemonic for recovery." },
    ],
    diagram: [
      "You type 'Hello'",
      "\u2193",
      "Client: nacl.box('Hello', nonce, recipientPubKey, yourSecretKey)",
      "\u2193",
      "Server stores: { ciphertext, nonce, senderPublicKey }",
      "Server CANNOT read the message",
      "\u2193",
      "Recipient: nacl.box.open(ciphertext, nonce, senderPubKey, theirSecretKey)",
      "\u2193",
      "'Hello' appears in chat",
    ],
  },

  // ── 10. Support Tickets ────────────────────────────────────
  {
    id: "support",
    icon: "\u{1F3AB}",
    title: "Step 9 \u2014 Support Tickets",
    subtitle: "All support happens inside X Shield \u2014 never via Telegram DMs. This prevents the 'fake admin DMs you' scam.",
    bullets: [
      { label: "Create a ticket", detail: "Support tab > New Ticket > fill subject, category, priority" },
      { label: "Lifecycle", detail: "OPEN \u2192 ASSIGNED \u2192 VERIFIED \u2192 RESOLVED \u2192 CLOSED" },
      { label: "Verify Admin", detail: "Click 'Verify Admin' to trigger an ed25519 challenge-response. Server walks the chain to Creator." },
      { label: "Green badge", detail: "Verified admins show 'Cryptographically Verified' with timestamp. Scammers cannot fake this." },
    ],
    tip: "If someone on Telegram claims to be support and DMs you \u2014 it's a scam. Real support only happens through X Shield tickets.",
  },

  // ── 11. Admin Day-to-Day ───────────────────────────────────
  {
    id: "admin-ops",
    icon: "\u{1F6E0}",
    title: "Step 10 \u2014 Daily Admin Operations",
    subtitle: "Quick reference for the actions admins perform regularly.",
    bullets: [
      { label: "Ban a user", detail: "POST /api/trust/ban \u2014 deactivates account, bans device, cascades trust penalties up invite chain" },
      { label: "Monitor scam patterns", detail: "GET /api/scam/stats \u2014 see which patterns are catching real scams vs generating noise" },
      { label: "Add custom patterns", detail: "POST /api/scam/patterns \u2014 name, regex, severity, category, alert message" },
      { label: "Recalculate trust", detail: "POST /api/trust/recalculate/:userId \u2014 forces a fresh score computation" },
    ],
    tip: "Check scam stats weekly. If a pattern has zero hits in 30 days, consider if it's still needed. If you see a new scam technique, add a pattern immediately.",
  },

  // ── 12. Future: Beyond Chat ────────────────────────────────
  {
    id: "future",
    icon: "\u{1F680}",
    title: "What's Next \u2014 Beyond Chat",
    subtitle: "The same security primitives that protect messages today can protect any crypto interaction tomorrow.",
    bullets: [
      { label: "Wallet screening", detail: "Cross-reference shared addresses against known scam databases (ChainAbuse, ScamSniffer)" },
      { label: "On-chain correlation", detail: "Flag users whose wallet behavior matches scam patterns (dust attacks, drain contracts)" },
      { label: "Smart contract alerts", detail: "Detect unlimited token approvals, unverified contracts, and honeypot tokens" },
      { label: "API-first integration", detail: "Trading bots, DAOs, and browser extensions can query X Shield's trust and scam data" },
    ],
    tip: "The pattern engine already supports any regex \u2014 add wallet address patterns, contract addresses, and phishing domains right now.",
  },
];

// ===================== TUTORIAL POPUP COMPONENT =====================
export default function TutorialPopup({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const slide = SLIDES[page];
  const total = SLIDES.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.70)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: T.bg,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div style={{
          padding: "16px 20px 12px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{slide.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{slide.title}</div>
              <div style={{ fontSize: 10, color: T.muted }}>{page + 1} of {total}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: T.muted,
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close tutorial"
          >
            \u2715
          </button>
        </div>

        {/* ── Progress bar ────────────────────────────────── */}
        <div style={{ height: 3, background: T.input, flexShrink: 0 }}>
          <div
            style={{
              height: "100%",
              width: `${((page + 1) / total) * 100}%`,
              background: T.accent,
              borderRadius: 2,
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* ── Scrollable content ──────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
          {/* Subtitle */}
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, margin: "0 0 16px" }}>
            {slide.subtitle}
          </p>

          {/* Bullet cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {slide.bullets.map((b, i) => (
              <div
                key={i}
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  borderLeft: `3px solid ${b.color || T.accent}`,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12, color: b.color || T.accent, marginBottom: 3 }}>
                  {b.label}
                </div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.45 }}>
                  {b.detail}
                </div>
              </div>
            ))}
          </div>

          {/* Diagram (if present) */}
          {slide.diagram && (
            <div
              style={{
                marginTop: 14,
                background: T.input,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "12px 16px",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                How it works
              </div>
              {slide.diagram.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: line.startsWith("\u2500") || line === "\u2193" ? T.muted : T.text,
                    lineHeight: 1.6,
                    whiteSpace: "pre",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Tip (if present) */}
          {slide.tip && (
            <div
              style={{
                marginTop: 14,
                background: T.accent + "0a",
                border: `1px solid ${T.accent}22`,
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{"\u{1F4A1}"}</span>
              <p style={{ fontSize: 11, color: T.accent, lineHeight: 1.45, margin: 0 }}>
                {slide.tip}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer nav ─────────────────────────────────── */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          {/* Page dots */}
          <div style={{ display: "flex", gap: 5 }}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                style={{
                  width: i === page ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  border: "none",
                  background: i === page ? T.accent : T.border,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  padding: 0,
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            {page > 0 && (
              <button
                onClick={() => setPage(page - 1)}
                style={{
                  padding: "7px 16px",
                  background: "rgba(255,255,255,0.06)",
                  color: T.muted,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                Back
              </button>
            )}
            {page < total - 1 ? (
              <button
                onClick={() => setPage(page + 1)}
                style={{
                  padding: "7px 18px",
                  background: T.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                Next
              </button>
            ) : (
              <button
                onClick={onClose}
                style={{
                  padding: "7px 18px",
                  background: T.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
