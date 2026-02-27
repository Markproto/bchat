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

// ===================== DATA =====================

interface Capability {
  name: string;
  what: string;
  teamUse: string;
  status: string;
}

interface UseCase {
  role: string;
  icon: string;
  description: string;
  features: string[];
}

interface ArchLayer {
  layer: string;
  tech: string;
  purpose: string;
}

const CAPABILITIES: Capability[] = [
  {
    name: "Hardware Device Binding",
    what: "Each account is cryptographically bound to a single hardware device ID. One device = one identity. No multi-accounting.",
    teamUse: "Your team members each get one verified account tied to their work device. Eliminates fake accounts and unauthorized access from personal devices.",
    status: "Built",
  },
  {
    name: "BIP39 Identity Recovery",
    what: "Every user receives a 24-word recovery phrase (same standard as hardware crypto wallets) that can restore their account on a new device.",
    teamUse: "Team members can securely recover their accounts if they change devices. IT can audit that recovery phrases are stored according to company policy.",
    status: "Built",
  },
  {
    name: "ed25519 Cryptographic Fingerprints",
    what: "Every user has a unique fingerprint (e.g. A7F2:3B91:E4C8) derived from their public key, displayed as a colored ring on their avatar.",
    teamUse: "Your team can visually verify they're communicating with the right person. Compare fingerprints during onboarding calls to establish verified channels.",
    status: "Built",
  },
  {
    name: "Invite-Only Access with Chain Tracking",
    what: "New users can only join via invite codes from existing users. Every invite is permanently linked to the inviter, creating an accountability chain.",
    teamUse: "You control who joins your organization's X Shield network. If a team member invites someone who causes problems, the invite chain makes it traceable.",
    status: "Built",
  },
  {
    name: "Anti-Impersonation (Homoglyph Detection)",
    what: "The system detects when a new user tries to register a name that looks like an existing user's name using Unicode tricks (e.g. Cyrillic letters that look identical to Latin).",
    teamUse: "Prevents external attackers from impersonating your team leads, executives, or IT staff inside the platform.",
    status: "Built",
  },
  {
    name: "Trust Scoring Engine",
    what: "Every user has a transparent, composite trust score (0.0–1.0) calculated from account age, invite quality, community standing, activity level, and inviter trust.",
    teamUse: "Instantly assess risk when communicating with anyone. New external contacts with low trust scores get flagged automatically. Your long-standing team members will naturally build high scores.",
    status: "Built",
  },
  {
    name: "Cascade Accountability",
    what: "When a user is banned, trust score penalties cascade up the invite chain: 15% to direct inviter, 8% to second level, 4% to third. Below 0.40, invite privileges are revoked.",
    teamUse: "Creates real accountability for who your team brings into the network. Discourages careless invitations and creates natural quality control.",
    status: "Built",
  },
  {
    name: "72-Hour Contact Cooling Period",
    what: "First-time contacts cannot share wallet addresses, external links, seed phrases, or recovery keywords for 72 hours. Normal text is unrestricted.",
    teamUse: "Protects your team from social engineering attacks targeting new relationships. A 3-day buffer is enough to verify legitimacy through other channels.",
    status: "Built",
  },
  {
    name: "AI Scam Detection (Real-Time)",
    what: "Every message is scanned against pattern databases scoring CRITICAL, HIGH, MEDIUM, and LOW severity. Composite scores above 0.85 auto-restrict the sender.",
    teamUse: "Your team is protected from phishing, seed phrase theft, fake investment schemes, and urgency-based manipulation — automatically and silently.",
    status: "Built",
  },
  {
    name: "End-to-End Encryption (NaCl Box)",
    what: "All messages use curve25519-xsalsa20-poly1305 encryption. The server only sees ciphertext. No plaintext is ever stored or transmitted to the server.",
    teamUse: "Sensitive business communications, financial discussions, and internal strategy stay completely private. Even a server breach exposes zero readable content.",
    status: "Built",
  },
  {
    name: "In-App Verified Support",
    what: "Support tickets with cryptographic admin verification (ed25519 challenge-response). Users can prove an admin's identity before sharing any information.",
    teamUse: "Your team members can get help without fear of social engineering. The cryptographic verification is impossible to fake.",
    status: "Built",
  },
];

const USE_CASES: UseCase[] = [
  {
    role: "Executive Team",
    icon: "👔",
    description: "Secure channel for sensitive discussions that can't leak, even if the platform infrastructure is compromised.",
    features: [
      "E2EE means zero server-side plaintext — even under subpoena, there's nothing to produce",
      "Fingerprint verification for 1-on-1 confirmations with board members or partners",
      "Trust scores give instant visibility into any contact's standing",
      "Support tickets with cryptographic admin proof for IT requests",
    ],
  },
  {
    role: "Finance & Treasury",
    icon: "💰",
    description: "Eliminates the #1 attack vector: social engineering around financial transactions.",
    features: [
      "72-hour cooling blocks wallet addresses and links from new contacts",
      "AI detection catches 'send me crypto' and 'double your money' patterns automatically",
      "No one can impersonate your CFO using look-alike usernames",
      "All contacts are traceable through the invite chain — no anonymous accounts",
    ],
  },
  {
    role: "Engineering & IT",
    icon: "⚙️",
    description: "Verified internal communications for your technical team with full auditability.",
    features: [
      "Device binding ensures only authorized hardware accesses the platform",
      "BIP39 recovery for team members changing laptops or phones",
      "Scam pattern database is admin-manageable — your security team writes the rules",
      "Full audit trail on support tickets, trust events, and admin actions",
    ],
  },
  {
    role: "Community & Partnerships",
    icon: "🤝",
    description: "Safe onboarding for external collaborators with graduated trust.",
    features: [
      "Invite codes let you bring in partners while maintaining accountability",
      "Cooling periods protect both sides during early interactions",
      "Trust scores build naturally as the relationship matures",
      "Community flagging lets your team collectively identify bad actors",
    ],
  },
];

const ARCHITECTURE: ArchLayer[] = [
  { layer: "Client", tech: "React 18 + TypeScript + Vite", purpose: "All encryption/decryption happens here. Keys never leave the device." },
  { layer: "Crypto", tech: "tweetnacl (NaCl box) + ed25519", purpose: "Industry-standard encryption. Same primitives used by Signal, Keybase, and hardware wallets." },
  { layer: "API", tech: "Express.js + TypeScript", purpose: "Stateless REST API. Handles routing, auth, rate limiting. Never sees plaintext." },
  { layer: "Auth", tech: "JWT + ed25519 signatures", purpose: "Token-based auth with hardware device binding. No passwords." },
  { layer: "Database", tech: "PostgreSQL", purpose: "Stores ciphertext, trust data, invite chains, tickets. No plaintext messages." },
  { layer: "Detection", tech: "Regex pattern engine + severity scoring", purpose: "Admin-configurable scam patterns with composite scoring and auto-restrict." },
];

// ===================== MAIN COMPONENT =====================
export default function TeamSpec({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<"capabilities" | "usecases" | "architecture">("capabilities");
  const [expandedCap, setExpandedCap] = useState<number | null>(null);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, color: T.text }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 14, fontFamily: "inherit" }}>&larr; Back</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, color: T.text, fontWeight: 700 }}>X Shield — Team Capability Sheet</h1>
            <p style={{ margin: 0, fontSize: 11, color: T.muted }}>How your team uses each layer of X Shield's security platform</p>
          </div>
          <Badge text="11 CAPABILITIES" color={T.accent} />
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4 }}>
          {([
            { id: "capabilities" as const, label: "Capabilities" },
            { id: "usecases" as const, label: "Team Use Cases" },
            { id: "architecture" as const, label: "Technical Stack" },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
                background: activeTab === t.id ? T.accent : "rgba(255,255,255,0.06)",
                color: activeTab === t.id ? "#000" : T.muted,
                fontWeight: activeTab === t.id ? 700 : 500, fontSize: 12,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {/* ─── Capabilities Tab ─── */}
        {activeTab === "capabilities" && (
          <>
            {/* Summary banner */}
            <Card style={{ marginBottom: 20, background: T.accent + "08", borderColor: T.accent + "33" }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: T.text, margin: 0 }}>What is X Shield?</p>
              <p style={{ fontSize: 12, color: T.muted, margin: "6px 0 0", lineHeight: 1.7 }}>
                X Shield is a messaging platform built from the ground up to eliminate social engineering, impersonation, and financial fraud.
                Every feature below is production-ready and integrated into a single application your team can deploy today.
                There are no add-ons, no premium tiers, and no features behind flags — everything ships together because security only works when it's comprehensive.
              </p>
            </Card>

            {/* Capability list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CAPABILITIES.map((cap, i) => {
                const isExpanded = expandedCap === i;
                return (
                  <Card
                    key={i}
                    style={{ cursor: "pointer", borderColor: isExpanded ? T.accent + "44" : T.border }}
                  >
                    <div onClick={() => setExpandedCap(isExpanded ? null : i)} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: T.accent + "22", border: `1px solid ${T.accent}44`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: T.accent, flexShrink: 0,
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{cap.name}</span>
                          <Badge text={cap.status.toUpperCase()} color={T.accent} />
                        </div>
                      </div>
                      <span style={{ color: T.muted, fontSize: 18 }}>{isExpanded ? "−" : "+"}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                        <div style={{ marginBottom: 12 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>What it does</p>
                          <p style={{ fontSize: 12, color: T.text, lineHeight: 1.7, margin: 0 }}>{cap.what}</p>
                        </div>
                        <div style={{ padding: "10px 12px", background: T.accent + "08", borderRadius: 8, border: `1px solid ${T.accent}22` }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: T.accent, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>How your team uses it</p>
                          <p style={{ fontSize: 12, color: T.text, lineHeight: 1.7, margin: 0 }}>{cap.teamUse}</p>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* ─── Use Cases Tab ─── */}
        {activeTab === "usecases" && (
          <>
            <Card style={{ marginBottom: 20, background: T.accent + "08", borderColor: T.accent + "33" }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: T.text, margin: 0 }}>Team Deployment Scenarios</p>
              <p style={{ fontSize: 12, color: T.muted, margin: "6px 0 0", lineHeight: 1.7 }}>
                X Shield is designed for organizations where trust and security are non-negotiable.
                Below are practical breakdowns of how each team function benefits from the platform's integrated security layers.
              </p>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {USE_CASES.map((uc, i) => (
                <Card key={i}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 28 }}>{uc.icon}</span>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 15, color: T.text, margin: 0 }}>{uc.role}</p>
                      <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0", lineHeight: 1.6 }}>{uc.description}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {uc.features.map((f, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px", background: T.input, borderRadius: 8 }}>
                        <span style={{ color: T.accent, fontSize: 12, flexShrink: 0, marginTop: 1 }}>✓</span>
                        <p style={{ fontSize: 12, color: T.text, margin: 0, lineHeight: 1.5 }}>{f}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* ─── Architecture Tab ─── */}
        {activeTab === "architecture" && (
          <>
            <Card style={{ marginBottom: 20, background: T.accent + "08", borderColor: T.accent + "33" }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: T.text, margin: 0 }}>Technical Architecture</p>
              <p style={{ fontSize: 12, color: T.muted, margin: "6px 0 0", lineHeight: 1.7 }}>
                X Shield is a full-stack TypeScript application. The client handles all cryptographic operations — the server is a blind relay that never sees plaintext.
                All components are open for audit.
              </p>
            </Card>

            {/* Stack table */}
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.input }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${T.border}` }}>Layer</th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${T.border}` }}>Technology</th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${T.border}` }}>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {ARCHITECTURE.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < ARCHITECTURE.length - 1 ? `1px solid ${T.border}` : "none" }}>
                      <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: T.accent }}>{row.layer}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: T.text, fontFamily: "monospace" }}>{row.tech}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{row.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Security properties */}
            <Card style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: T.text, margin: "0 0 12px" }}>Security Properties</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Encryption", value: "NaCl box (curve25519-xsalsa20-poly1305)", color: T.accent },
                  { label: "Signatures", value: "ed25519 (same as SSH, Signal, Solana)", color: T.accent },
                  { label: "Key Recovery", value: "BIP39 24-word mnemonic", color: T.accent },
                  { label: "Server Plaintext", value: "Zero — blind relay only", color: T.accent },
                  { label: "Device Binding", value: "Hardware ID → one account per device", color: T.accent },
                  { label: "Scam Detection", value: "Regex patterns with severity-weighted composite scoring", color: T.accent },
                  { label: "Contact Cooling", value: "72 hours — blocks wallets, links, seeds", color: T.warn },
                  { label: "Admin Verification", value: "ed25519 challenge-response proof", color: T.accent },
                ].map((p, i) => (
                  <div key={i} style={{ padding: "8px 10px", background: T.input, borderRadius: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, margin: "0 0 2px", textTransform: "uppercase" }}>{p.label}</p>
                    <p style={{ fontSize: 12, color: p.color, margin: 0, fontWeight: 500 }}>{p.value}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* What we don't do */}
            <Card style={{ background: T.danger + "08", borderColor: T.danger + "33" }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: T.text, margin: "0 0 10px" }}>What X Shield Does Not Do</p>
              <p style={{ fontSize: 12, color: T.muted, margin: "0 0 10px", lineHeight: 1.7 }}>
                Transparency about limitations is part of security:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  "Does not store plaintext messages — ever, under any circumstances",
                  "Does not offer password-based auth — all identity is cryptographic",
                  "Does not allow anonymous accounts — every user is device-bound and invite-traced",
                  "Does not provide 'admin backdoor' decryption — E2EE means E2EE",
                  "Does not depend on third-party identity providers — no OAuth, no SSO dependencies",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0" }}>
                    <span style={{ color: T.danger, fontSize: 12, flexShrink: 0 }}>✗</span>
                    <p style={{ fontSize: 12, color: T.text, margin: 0, lineHeight: 1.5 }}>{item}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0 8px", color: T.muted, fontSize: 10 }}>
          X Shield Team Capability Sheet — 11 Integrated Security Layers | Zero Plaintext Architecture | Full Audit Trail
        </div>
      </div>
    </div>
  );
}
