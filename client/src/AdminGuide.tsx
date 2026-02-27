import { useState } from "react";

// ===================== THEME (matches App.tsx) =====================
const T = {
  bg: "#0a0b10", card: "#111827", border: "#1f2937", text: "#e2e8f0",
  muted: "#6b7b8d", accent: "#94a3b8", danger: "#ff4757", warn: "#ffa502",
  input: "#0d1117", silver: "#c9d1d9", bright: "#e6edf3",
};

// ===================== COMPONENTS =====================
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, ...style }}>{children}</div>;
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}44`, whiteSpace: "nowrap" }}>{text}</span>;
}

interface Step {
  title: string;
  content: string;
  tips?: string[];
}

interface Section {
  id: string;
  title: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
  description: string;
  steps: Step[];
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "1",
    description: "First steps after your account is created and device is bound.",
    steps: [
      {
        title: "Your Account Is Device-Bound",
        content: "When your account was created, it was permanently linked to your hardware device ID. This means one device = one account. You cannot create multiple accounts on the same phone or computer. This is the first layer of fraud prevention.",
        tips: ["Your device ID is shown in Settings under 'Security'.", "If you lose your device, use your 24-word recovery phrase to restore access on a new device."],
      },
      {
        title: "Understand Your Fingerprint",
        content: "Your identity fingerprint (e.g. A7F2:3B91:E4C8) is derived from your ed25519 public key. Every user has a unique fingerprint and a unique color ring on their avatar. When communicating with someone, compare fingerprints out-of-band to verify you're talking to the real person.",
        tips: ["The color ring is generated deterministically — if it changes, something is wrong.", "Your fingerprint is visible on every message header and profile card."],
      },
      {
        title: "Your Trust Score",
        content: "Every user starts with a trust score of 0.50. This score is visible to everyone you interact with. It increases over time based on account age, invite quality, community standing, and activity. High trust (0.80+) unlocks privileges like inviting others.",
        tips: ["You cannot fake a high trust score — it is calculated from verified on-chain data.", "If someone's trust score is below 0.50, exercise extreme caution."],
      },
    ],
  },
  {
    id: "contacts-cooling",
    title: "Contacts & Cooling Periods",
    icon: "2",
    description: "How new contact interactions work and what gets restricted.",
    steps: [
      {
        title: "72-Hour Cooling Period",
        content: "When you message someone for the first time (or they message you), a 72-hour cooling period activates. During this window, neither party can send wallet addresses, external links, seed phrases, or recovery keywords. Normal conversation is unrestricted.",
        tips: ["The cooling timer appears in the chat header as a yellow banner.", "This blocks the #1 crypto scam pattern: rushing new contacts into financial actions."],
      },
      {
        title: "What Gets Blocked During Cooling",
        content: "Ethereum addresses (0x...), Bitcoin addresses (bc1...), HTTP/HTTPS links, www links, seed phrase keywords, private key mentions, and 12/24-word recovery phrase references are all blocked. The system checks every outgoing message against these patterns.",
        tips: ["You'll see a clear error if your message is blocked — it won't be sent.", "After 72 hours, all restrictions lift automatically. No action needed."],
      },
      {
        title: "Trusted Contacts Are Unrestricted",
        content: "Once the cooling period expires, you can share anything freely with that contact. The system remembers your contact pair permanently. Re-adding someone doesn't restart the timer.",
      },
    ],
  },
  {
    id: "scam-detection",
    title: "AI Scam Detection",
    icon: "3",
    badge: "ALWAYS ON",
    badgeColor: T.accent,
    description: "How the real-time scam detection protects you and your contacts.",
    steps: [
      {
        title: "How Detection Works",
        content: "Every message passes through a pattern engine that checks for known scam phrases and tactics. Patterns are scored by severity: CRITICAL (seed phrase requests, private key phishing), HIGH (crypto transfer demands, wallet connect scams), MEDIUM (urgency pressure, trust manipulation), and LOW (suspicious phrasing).",
        tips: ["Detection happens client-side on the hint text — the server never sees your plaintext.", "Senders are NOT notified when a scam alert fires. Only the recipient sees it."],
      },
      {
        title: "Reading Your Alerts",
        content: "Open the Alerts tab (triangle icon in the sidebar) to see all active alerts. Each alert shows the severity level, the sender, the detection pattern that triggered, and the protective advice. You can dismiss alerts after reviewing them.",
        tips: ["CRITICAL alerts mean someone is almost certainly trying to steal from you.", "A single sender triggering multiple patterns is a major red flag."],
      },
      {
        title: "Composite Scoring & Auto-Restrict",
        content: "When a message triggers multiple patterns, the system calculates a composite severity score. Scores above 0.85 automatically restrict the sender from contacting you further. This happens silently — the attacker just sees their messages fail to deliver.",
      },
      {
        title: "Admin: Managing Patterns",
        content: "As an admin, you can create, edit, and delete scam detection patterns. Navigate to the admin panel to manage the pattern database. Every change is audited. New patterns take effect immediately after cache invalidation (within 60 seconds).",
        tips: ["Test new patterns on sample messages before deploying.", "Severity levels affect the composite scoring algorithm — CRITICAL patterns have the highest weight."],
      },
    ],
  },
  {
    id: "e2ee",
    title: "End-to-End Encryption",
    icon: "4",
    badge: "E2EE",
    badgeColor: T.accent,
    description: "Understanding how your messages stay private.",
    steps: [
      {
        title: "How E2EE Works in X Shield",
        content: "Every message is encrypted using NaCl box (curve25519-xsalsa20-poly1305) before leaving your device. The server only ever sees ciphertext, a nonce, and your public key. It cannot read your messages, even under a court order or data breach.",
        tips: ["The 'E2EE' badge in every chat header confirms encryption is active.", "The lock icon at the top of each conversation is your visual confirmation."],
      },
      {
        title: "Key Management",
        content: "Your encryption keys are derived from your ed25519 signing keypair. They are stored only on your device. When you register, your public key is uploaded to the server so others can encrypt messages to you. Your private key never leaves your device.",
      },
      {
        title: "What the Server Sees",
        content: "The server stores: your user ID, the ciphertext blob, a random nonce, your sender public key, and a timestamp. It does NOT store: plaintext, message previews, or any decrypted content. The scam detection hint is checked ephemerally and never persisted.",
      },
    ],
  },
  {
    id: "support-tickets",
    title: "Support & Admin Verification",
    icon: "5",
    description: "How in-app support works and how to verify an admin's identity.",
    steps: [
      {
        title: "Creating a Support Ticket",
        content: "Go to the Support tab and click 'New Ticket'. Choose a category (account, security, billing, technical, report_user, general), describe your issue, and set a priority. An admin will be assigned automatically based on workload.",
        tips: ["Support only happens inside X Shield. If anyone contacts you via DM claiming to be support, they are a scammer.", "Never share credentials in a support ticket — admins never need them."],
      },
      {
        title: "Verifying Admin Identity",
        content: "After an admin is assigned to your ticket, you can request cryptographic identity verification at any time. Click 'Verify Admin' to send a challenge. The admin must sign a random 32-byte nonce with their ed25519 private key. If the signature checks out, the ticket is marked 'Cryptographically Verified'.",
        tips: ["A green 'Verified' badge with checkmark means the admin's identity is proven.", "Verification is optional but recommended for any sensitive issue."],
      },
      {
        title: "Ticket Lifecycle",
        content: "Tickets progress through states: Open → Assigned → Verified (optional) → Resolved → Closed. You can close your own ticket at any time. Admins can change status, priority, and assignment. Every action is logged in the ticket's audit trail.",
      },
    ],
  },
  {
    id: "trust-system",
    title: "Trust Scoring Deep Dive",
    icon: "6",
    description: "How trust scores are calculated and how the cascade system works.",
    steps: [
      {
        title: "Score Calculation",
        content: "Your trust score is a weighted composite: Account Age (20%) — days since registration, maxes at 365d. Invite Quality (25%) — ratio of good vs banned invitees. Community Standing (20%) — inverse of flags received. Activity (15%) — messages sent in last 30d, maxes at 100. Inviter Trust (20%) — the trust score of the person who invited you.",
      },
      {
        title: "Cascade Penalties",
        content: "When a user is banned, penalties cascade up the invite chain: Level 1 (direct inviter) loses 15% of their score. Level 2 (inviter's inviter) loses 8%. Level 3 loses 4%. If any inviter's score drops below 0.40, their invite privileges are automatically revoked.",
        tips: ["This is why trust scores matter — inviting a scammer penalizes YOU.", "The cascade system creates strong incentives to only invite people you personally know and trust."],
      },
      {
        title: "Community Flagging",
        content: "Any user can flag another for suspicious behavior. Each flagger has a 24-hour cooldown per target. At 10 flags, the system auto-restricts the flagged user. Admins can review flags and take action.",
      },
    ],
  },
  {
    id: "invite-system",
    title: "Inviting New Users",
    icon: "7",
    description: "How the invite chain works and your accountability.",
    steps: [
      {
        title: "Generating Invite Codes",
        content: "If your trust score is 0.80 or above, you can generate invite codes from the Settings tab. Each code is formatted XSHLD-XXXX-XXXX and can only be used once. The code permanently links the new user to you in the invite chain.",
        tips: ["Only invite people you know in real life or have verified through trusted channels.", "If your invitee gets banned, YOUR trust score takes a 15% hit."],
      },
      {
        title: "Sybil Defense",
        content: "The system prevents one person from creating multiple accounts using: hardware device binding (one account per device), device ID banning (banned device = banned hardware), and invite chain tracking (every account traces back to a known inviter).",
      },
      {
        title: "Anti-Impersonation",
        content: "When registering, the system checks your chosen username against existing users using Unicode normalization and homoglyph detection. Names like 'Admіn_Mark' (with a Cyrillic і) that look like 'Admin_Mark' are automatically blocked if similarity exceeds 75%.",
      },
    ],
  },
  {
    id: "trusted-rooms",
    title: "Trusted Rooms",
    icon: "8",
    badge: "NEW",
    badgeColor: T.accent,
    description: "Auto-access from designated Telegram groups with membership cutoff enforcement.",
    steps: [
      {
        title: "Designating a Trusted Room",
        content: "Admins can designate a Telegram group as a trusted source via the /trustroom enable YYYY-MM-DD bot command or the POST /api/trusted-rooms API. The date is the membership cutoff: only users who joined the Telegram group BEFORE that date get auto-access to X Shield. Anyone joining after must get a regular invite code.",
        tips: ["Use /trustroom enable 2026-02-25 directly in the Telegram group.", "The cutoff date is required and cannot be omitted."],
      },
      {
        title: "Managing Settings",
        content: "Each trusted room has configurable settings: default trust score (default 0.40, lower than the standard 0.50), maximum member cap (0 = unlimited), and the membership cutoff date. Update these via PUT /api/trusted-rooms/:id or the admin dashboard.",
        tips: ["Trust score changes only apply to future admissions, not retroactively.", "Set a member cap on large groups as a safety valve."],
      },
      {
        title: "Monitoring & Safety",
        content: "View all users admitted via a trusted room at GET /api/trusted-rooms/:id/admissions. If 3 or more users from a single room get banned, the room is automatically deactivated. You can also manually deactivate via /trustroom disable or POST /api/trusted-rooms/:id/deactivate.",
        tips: ["Deactivation stops future auto-admissions but does NOT ban existing users.", "Review admissions regularly for suspicious patterns."],
      },
      {
        title: "Cascade Accountability",
        content: "The admin who created the trusted room absorbs cascade penalties when a trusted-room user is banned. Penalties are dampened to 50% of normal levels (e.g., 7.5% instead of 15% for direct inviter). This reflects the group-level nature of the trust decision versus a personal endorsement.",
        tips: ["Only trust rooms you genuinely trust \u2014 your trust score is at stake.", "Auto-deactivation protects you from cascading damage if a room is compromised."],
      },
    ],
  },
];

// ===================== MAIN COMPONENT =====================
export default function AdminGuide({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  function toggleStep(key: string) {
    setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, color: T.text }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 14, fontFamily: "inherit" }}>&larr; Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: T.text, fontWeight: 700 }}>Admin User Guide</h1>
          <p style={{ margin: 0, fontSize: 11, color: T.muted }}>Step-by-step walkthrough of every X Shield feature</p>
        </div>
        <Badge text="v1.0" color={T.accent} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {/* Quick start banner */}
        <Card style={{ marginBottom: 20, background: T.accent + "08", borderColor: T.accent + "33" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 24 }}>🛡️</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: T.text, margin: 0 }}>Welcome to X Shield</p>
              <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0" }}>
                X Shield eliminates fraud through 9 integrated security layers: device binding, cryptographic identity, invite chain accountability, anti-impersonation, trust scoring, contact cooling periods, AI scam detection, end-to-end encryption, and verified in-app support. This guide walks you through each one.
              </p>
            </div>
          </div>
        </Card>

        {/* Important warning */}
        <Card style={{ marginBottom: 20, background: T.danger + "08", borderColor: T.danger + "33" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, color: T.danger, margin: 0 }}>Critical Security Rules</p>
              <ul style={{ fontSize: 12, color: T.text, margin: "8px 0 0", paddingLeft: 16, lineHeight: 1.8 }}>
                <li><strong>Never share your seed phrase</strong> — no admin, support agent, or developer will ever ask for it.</li>
                <li><strong>Support only happens inside this app</strong> — anyone DMing you as "support" is a scammer.</li>
                <li><strong>Always verify admin identity</strong> — use the cryptographic challenge before sharing sensitive info.</li>
                <li><strong>Check trust scores</strong> — a score below 0.50 means the user has poor standing.</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Section list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            return (
              <Card key={section.id} style={{ cursor: "pointer", borderColor: isActive ? T.accent + "44" : T.border }}>
                {/* Section header */}
                <div
                  onClick={() => setActiveSection(isActive ? null : section.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: isActive ? T.accent : T.input,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 14, color: isActive ? "#000" : T.muted, flexShrink: 0,
                  }}>
                    {section.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{section.title}</span>
                      {section.badge && <Badge text={section.badge} color={section.badgeColor || T.muted} />}
                    </div>
                    <p style={{ fontSize: 11, color: T.muted, margin: "2px 0 0" }}>{section.description}</p>
                  </div>
                  <span style={{ color: T.muted, fontSize: 18 }}>{isActive ? "−" : "+"}</span>
                </div>

                {/* Expanded steps */}
                {isActive && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                    {section.steps.map((step, i) => {
                      const stepKey = `${section.id}-${i}`;
                      const expanded = expandedSteps[stepKey] !== false; // default open
                      return (
                        <div key={i} style={{ padding: "10px 0", borderBottom: i < section.steps.length - 1 ? `1px solid ${T.border}` : "none" }}>
                          <div
                            onClick={(e) => { e.stopPropagation(); toggleStep(stepKey); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                          >
                            <div style={{
                              width: 20, height: 20, borderRadius: "50%", background: T.accent + "22", border: `1px solid ${T.accent}44`,
                              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.accent, fontWeight: 700, flexShrink: 0,
                            }}>
                              {i + 1}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 13, color: T.text, flex: 1 }}>{step.title}</span>
                            <span style={{ color: T.muted, fontSize: 14 }}>{expanded ? "▾" : "▸"}</span>
                          </div>
                          {expanded && (
                            <div style={{ marginLeft: 28, marginTop: 8 }}>
                              <p style={{ fontSize: 12, color: T.text, lineHeight: 1.7, margin: 0 }}>{step.content}</p>
                              {step.tips && step.tips.length > 0 && (
                                <div style={{ marginTop: 10, padding: "8px 12px", background: T.accent + "08", borderRadius: 8, border: `1px solid ${T.accent}22` }}>
                                  <p style={{ fontSize: 10, fontWeight: 700, color: T.accent, margin: "0 0 4px" }}>TIPS</p>
                                  {step.tips.map((tip, j) => (
                                    <p key={j} style={{ fontSize: 11, color: T.muted, margin: "4px 0", paddingLeft: 8, borderLeft: `2px solid ${T.accent}33` }}>{tip}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0 8px", color: T.muted, fontSize: 10 }}>
          X Shield Admin Guide v1.0 — 9 Security Layers | Zero Trust Architecture | Full Audit Trail
        </div>
      </div>
    </div>
  );
}
