import { useState } from "react";

// ===================== THEME (matches App.tsx) =====================
const T = {
  bg: "#0a0a14", card: "#12122a", border: "#1e1e3a", text: "#e0e0ee",
  muted: "#6b6b8a", accent: "#00d26a", danger: "#ff4757", warn: "#ffa502",
  input: "#0e0e1e",
};

function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}44`, whiteSpace: "nowrap" }}>{text}</span>;
}

// ===================== SECURITY LAYER ITEMS =====================
const LAYERS = [
  { name: "Hardware Device Binding", desc: "One device = one identity. No multi-accounting." },
  { name: "BIP39 Recovery", desc: "24-word mnemonic backup, same as hardware wallets." },
  { name: "ed25519 Fingerprints", desc: "Cryptographic identity with unique color-coded avatars." },
  { name: "Invite Chain Tracking", desc: "Every account traces to a known, accountable inviter." },
  { name: "Anti-Impersonation", desc: "Unicode homoglyph detection blocks look-alike usernames." },
  { name: "Trust Scoring", desc: "Transparent 0.0-1.0 score with cascade penalties." },
  { name: "72h Cooling Periods", desc: "New contacts can't send wallets, links, or seeds for 72 hours." },
  { name: "AI Scam Detection", desc: "Real-time pattern matching with auto-restrict at 0.85 severity." },
  { name: "End-to-End Encryption", desc: "NaCl box encryption. Server never sees plaintext." },
];

// ===================== MAIN COMPONENT =====================
export default function LandingPage({ onOpenGuide, onOpenSpec, onOpenApp }: {
  onOpenGuide: () => void;
  onOpenSpec: () => void;
  onOpenApp: () => void;
}) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", overflowY: "auto" }}>

      {/* ─── HERO ─── */}
      <div style={{ padding: "60px 24px 40px", textAlign: "center", maxWidth: 800, margin: "0 auto" }}>
        {/* Logo */}
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: "50%", background: T.accent + "15", border: `2px solid ${T.accent}33`, marginBottom: 24 }}>
          <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h1 style={{ fontSize: 42, fontWeight: 800, color: T.text, margin: "0 0 12px", letterSpacing: -1 }}>
          b<span style={{ color: T.accent }}>chat</span>
        </h1>
        <p style={{ fontSize: 18, color: T.muted, margin: "0 0 8px", lineHeight: 1.5, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          Fraud-elimination messaging built on 9 integrated security layers.
        </p>
        <p style={{ fontSize: 13, color: T.muted, margin: "0 0 32px" }}>
          Zero plaintext architecture &middot; Cryptographic identity &middot; Invite-only access
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onOpenApp}
            style={{
              padding: "14px 32px", background: T.accent, color: "#000", border: "none", borderRadius: 10,
              cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: "inherit", transition: "all .15s",
            }}
          >
            Open bchat App
          </button>
          <button
            onClick={onOpenGuide}
            style={{
              padding: "14px 32px", background: "rgba(255,255,255,0.06)", color: T.text, border: `1px solid ${T.border}`,
              borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 15, fontFamily: "inherit", transition: "all .15s",
            }}
          >
            Read the Guide
          </button>
        </div>
      </div>

      {/* ─── MAIN CARDS ─── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>

          {/* Admin Guide Card */}
          <div
            onClick={onOpenGuide}
            onMouseEnter={() => setHoveredCard("guide")}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              background: hoveredCard === "guide" ? T.accent + "0a" : T.card,
              border: `1px solid ${hoveredCard === "guide" ? T.accent + "44" : T.border}`,
              borderRadius: 14, padding: 24, cursor: "pointer", transition: "all .2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: T.accent + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                </svg>
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: T.text, margin: 0 }}>Admin User Guide</p>
                <Badge text="7 SECTIONS" color={T.accent} />
              </div>
            </div>
            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
              Step-by-step walkthrough of every bchat feature. Covers device binding, fingerprints, trust scores,
              cooling periods, scam detection, E2EE, support tickets, and the invite system.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["Getting Started", "Cooling Periods", "Scam Detection", "E2EE", "Trust Scoring", "Invites", "Support"].map(t => (
                <span key={t} style={{ padding: "3px 8px", background: T.input, borderRadius: 6, fontSize: 10, color: T.muted, border: `1px solid ${T.border}` }}>{t}</span>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>Open Guide</span>
              <span style={{ color: T.accent }}>&rarr;</span>
            </div>
          </div>

          {/* Team Spec Card */}
          <div
            onClick={onOpenSpec}
            onMouseEnter={() => setHoveredCard("spec")}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              background: hoveredCard === "spec" ? "#4a90d9" + "0a" : T.card,
              border: `1px solid ${hoveredCard === "spec" ? "#4a90d9" + "44" : T.border}`,
              borderRadius: 14, padding: 24, cursor: "pointer", transition: "all .2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#4a90d9" + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#4a90d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: T.text, margin: 0 }}>Team Capability Sheet</p>
                <Badge text="FOR STAKEHOLDERS" color="#4a90d9" />
              </div>
            </div>
            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
              Practical breakdown of how your team uses bchat's 11 security capabilities.
              Organized by role: Executive, Finance, Engineering, and Community. No jargon — just what it does and how your team benefits.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["Capabilities", "Team Use Cases", "Tech Stack", "Security Properties"].map(t => (
                <span key={t} style={{ padding: "3px 8px", background: T.input, borderRadius: 6, fontSize: 10, color: T.muted, border: `1px solid ${T.border}` }}>{t}</span>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#4a90d9" }}>Open Spec Sheet</span>
              <span style={{ color: "#4a90d9" }}>&rarr;</span>
            </div>
          </div>

          {/* Open App Card */}
          <div
            onClick={onOpenApp}
            onMouseEnter={() => setHoveredCard("app")}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              background: hoveredCard === "app" ? T.warn + "0a" : T.card,
              border: `1px solid ${hoveredCard === "app" ? T.warn + "44" : T.border}`,
              borderRadius: 14, padding: 24, cursor: "pointer", transition: "all .2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: T.warn + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={T.warn} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: T.text, margin: 0 }}>Launch bchat App</p>
                <Badge text="LIVE DEMO" color={T.warn} />
              </div>
            </div>
            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
              Open the full bchat messaging interface with E2EE chats, trust scoring, scam alerts,
              support tickets, and all 9 security layers active. Explore every feature hands-on.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["Chats", "Contacts", "Alerts", "Support", "Trust", "Settings"].map(t => (
                <span key={t} style={{ padding: "3px 8px", background: T.input, borderRadius: 6, fontSize: 10, color: T.muted, border: `1px solid ${T.border}` }}>{t}</span>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.warn }}>Open App</span>
              <span style={{ color: T.warn }}>&rarr;</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECURITY LAYERS ─── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p style={{ fontWeight: 700, fontSize: 18, color: T.text, margin: "0 0 6px" }}>9 Integrated Security Layers</p>
          <p style={{ fontSize: 12, color: T.muted }}>Every layer is active by default. Security works because nothing is optional.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
          {LAYERS.map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", background: T.accent + "18", border: `1px solid ${T.accent}33`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.accent, flexShrink: 0, marginTop: 1,
              }}>
                {i + 1}
              </div>
              <div>
                <p style={{ fontWeight: 600, fontSize: 12, color: T.text, margin: 0 }}>{l.name}</p>
                <p style={{ fontSize: 11, color: T.muted, margin: "2px 0 0", lineHeight: 1.4 }}>{l.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <div style={{ textAlign: "center", padding: "20px 24px 32px", borderTop: `1px solid ${T.border}` }}>
        <p style={{ fontSize: 11, color: T.muted }}>bchat v1.0.0 &middot; Zero Plaintext Architecture &middot; Full Audit Trail</p>
      </div>
    </div>
  );
}
