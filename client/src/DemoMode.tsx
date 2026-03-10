import React, { useState, useRef, useEffect } from "react";

const T = {
  bg: "#0a0b10", card: "#111827", border: "#1f2937", text: "#e2e8f0",
  muted: "#6b7b8d", accent: "#94a3b8", danger: "#ff4757", warn: "#ffa502",
  input: "#0d1117", silver: "#c9d1d9", bright: "#e6edf3",
};

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`;

/* ---------- helpers ---------- */

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue},55%,55%)`;
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
        background: color + "22", color, border: `1px solid ${color}44`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function Avatar({ initials, fp }: { initials: string; fp: string }) {
  const c = hashColor(fp);
  return (
    <div
      style={{
        width: 40, height: 40, borderRadius: "50%", background: c + "22",
        border: `2px solid ${c}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 14, fontWeight: 700, color: c,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

/* ---------- SVG icons ---------- */

const svgBase: React.CSSProperties = {
  width: 20, height: 20, fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

function Icon({ children, size, style }: { children: React.ReactNode; size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ ...svgBase, width: size || 20, height: size || 20, ...style }}
    >
      {children}
    </svg>
  );
}

const ShieldIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Icon>
);
const LockIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><rect x={3} y={11} width={18} height={11} rx={2} /><path d="M7 11V7a5 5 0 0110 0v4" /></Icon>
);
const SendIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><line x1={22} y1={2} x2={11} y2={13} /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Icon>
);
const AlertIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1={12} y1={9} x2={12} y2={13} /><circle cx={12} cy={17} r={0.5} />
  </Icon>
);
const ChatIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Icon>
);
const UserIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx={12} cy={7} r={4} /></Icon>
);
const GearIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}>
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z" />
  </Icon>
);
const TicketIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}>
    <path d="M15 5v2" /><path d="M15 11v2" /><path d="M15 17v2" />
    <path d="M5 5h14a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 000-4V7a2 2 0 012-2z" />
  </Icon>
);
const CheckIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><polyline points="20 6 9 17 4 12" /></Icon>
);
const XIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} /></Icon>
);
const ClockIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}><circle cx={12} cy={12} r={10} /><polyline points="12 6 12 12 16 14" /></Icon>
);
const BrainIcon = ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
  <Icon size={size} style={style}>
    <path d="M9.5 2A5.5 5.5 0 004 7.5c0 1.5.5 2.8 1.3 3.8L4 14l3-1 .7.3A5.5 5.5 0 0015 14.7l.7-.3 3 1-1.3-2.7A5.5 5.5 0 0014.5 2h-5z" />
  </Icon>
);

/* ---------- mock data ---------- */

interface Contact {
  id: number;
  name: string;
  fingerprint: string;
  trustScore: number;
  admin: boolean;
  cooling: boolean;
  unread: number;
  lastMsg: string;
}

const CONTACTS: Contact[] = [
  { id: 1, name: "CryptoAlice", fingerprint: "A7F2:3B91:E4C8", trustScore: 0.95, admin: true, cooling: false, unread: 0, lastMsg: "Hey, did you see the latest governance vote?" },
  { id: 2, name: "Suspicious_User", fingerprint: "D1E5:9A04:7F3C", trustScore: 0.23, admin: false, cooling: true, unread: 3, lastMsg: "I need your help urgently..." },
  { id: 3, name: "NewUser_Jake", fingerprint: "B8C6:2D7E:1A5F", trustScore: 0.55, admin: false, cooling: false, unread: 1, lastMsg: "Can you connect your wallet real quick?" },
  { id: 4, name: "ModBot_v2", fingerprint: "E3F1:8B2C:6D9A", trustScore: 0.88, admin: true, cooling: false, unread: 0, lastMsg: "Auto-moderation report: 0 flags today." },
  { id: 5, name: "Unknown_Trader", fingerprint: "C4A9:5E71:3B8D", trustScore: 0.41, admin: false, cooling: false, unread: 2, lastMsg: "Limited time offer — act now!!" },
];

interface Message {
  id: number;
  from: "them" | "me";
  text: string;
  time: string;
}

const INIT_MESSAGES: Record<number, Message[]> = {
  1: [
    { id: 1, from: "them", text: "Hey! Welcome to the community.", time: "10:02 AM" },
    { id: 2, from: "me", text: "Thanks! Glad to be here.", time: "10:03 AM" },
    { id: 3, from: "them", text: "Did you see the latest governance vote?", time: "10:15 AM" },
    { id: 4, from: "me", text: "Not yet, I'll check it out.", time: "10:16 AM" },
  ],
  2: [
    { id: 1, from: "them", text: "Hey, are you an admin here?", time: "9:30 AM" },
    { id: 2, from: "me", text: "Yes, how can I help?", time: "9:31 AM" },
    { id: 3, from: "them", text: "I need your help urgently... my tokens are stuck.", time: "9:32 AM" },
    { id: 4, from: "them", text: "Can you send me your seed phrase so I can verify your wallet?", time: "9:33 AM" },
  ],
  3: [
    { id: 1, from: "them", text: "Hi! I'm new here.", time: "11:00 AM" },
    { id: 2, from: "me", text: "Welcome! Let me know if you have questions.", time: "11:01 AM" },
    { id: 3, from: "them", text: "Can you connect your wallet real quick? I have a special airdrop.", time: "11:05 AM" },
  ],
  4: [
    { id: 1, from: "them", text: "Daily moderation report: All clear.", time: "8:00 AM" },
    { id: 2, from: "them", text: "Auto-moderation report: 0 flags today.", time: "12:00 PM" },
  ],
  5: [
    { id: 1, from: "them", text: "Hey, I have an amazing opportunity for you!", time: "2:00 PM" },
    { id: 2, from: "them", text: "Limited time offer — act now!! 10x guaranteed returns!", time: "2:01 PM" },
  ],
};

const SCAM_PATTERNS = [
  { pattern: /seed\s*phrase/i, label: "Seed Phrase Request", severity: "CRITICAL" as const },
  { pattern: /connect\s*(your)?\s*wallet/i, label: "Wallet Connect Scam", severity: "HIGH" as const },
  { pattern: /private\s*key/i, label: "Private Key Request", severity: "CRITICAL" as const },
  { pattern: /send\s*(me\s*)?(your\s*)?seed/i, label: "Seed Phrase Request", severity: "CRITICAL" as const },
  { pattern: /act\s*now|urgent|limited\s*time/i, label: "Urgency Pressure", severity: "MEDIUM" as const },
  { pattern: /guaranteed\s*returns/i, label: "Investment Scam", severity: "HIGH" as const },
];

type TabKey = "chats" | "alerts" | "trust" | "support" | "contacts" | "settings";

interface ScamAlert {
  id: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  label: string;
  from: string;
  description: string;
}

/* ---------- main component ---------- */

export default function DemoMode({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<TabKey>("chats");
  const [activeContact, setActiveContact] = useState(1);
  const [messages, setMessages] = useState<Record<number, Message[]>>(() =>
    JSON.parse(JSON.stringify(INIT_MESSAGES))
  );
  const [inputText, setInputText] = useState("");
  const [scamPopup, setScamPopup] = useState<{ label: string; severity: string } | null>(null);
  const [scamBanner, setScamBanner] = useState<{ label: string; severity: string } | null>(null);
  const [alerts, setAlerts] = useState<ScamAlert[]>([
    { id: 1, severity: "CRITICAL", label: "Seed Phrase Request", from: "Suspicious_User", description: "Never share your seed phrase. No legitimate admin will ever ask for it." },
    { id: 2, severity: "HIGH", label: "Wallet Connect Scam", from: "NewUser_Jake", description: "Be cautious of unsolicited wallet connection requests." },
    { id: 3, severity: "MEDIUM", label: "Urgency Pressure", from: "Unknown_Trader", description: "This user is using urgency tactics common in scam attempts." },
  ]);
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);
  const [ticket2Verified, setTicket2Verified] = useState(false);
  const [verifyAnimating, setVerifyAnimating] = useState(false);
  const [inviteCodes, setInviteCodes] = useState(["XSHLD-A1B2-C3D4"]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeContact]);

  useEffect(() => {
    if (scamPopup) {
      const t = setTimeout(() => setScamPopup(null), 4000);
      return () => clearTimeout(t);
    }
  }, [scamPopup]);

  useEffect(() => {
    if (scamBanner) {
      const t = setTimeout(() => setScamBanner(null), 6000);
      return () => clearTimeout(t);
    }
  }, [scamBanner]);

  const contact = CONTACTS.find((c) => c.id === activeContact)!;
  const chatMsgs = messages[activeContact] || [];

  function sendMessage() {
    const text = inputText.trim();
    if (!text) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const newMsg: Message = { id: Date.now(), from: "me", text, time };
    setMessages((prev) => ({
      ...prev,
      [activeContact]: [...(prev[activeContact] || []), newMsg],
    }));
    setInputText("");

    for (const sp of SCAM_PATTERNS) {
      if (sp.pattern.test(text)) {
        setScamBanner({ label: sp.label, severity: sp.severity });
        setScamPopup({ label: sp.label, severity: sp.severity });
        break;
      }
    }
  }

  function handleVerifyAdmin() {
    setVerifyAnimating(true);
    setTimeout(() => {
      setTicket2Verified(true);
      setVerifyAnimating(false);
    }, 1500);
  }

  function generateInviteCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setInviteCodes((prev) => [...prev, `XSHLD-${seg()}-${seg()}`]);
  }

  const severityColor = (s: string) =>
    s === "CRITICAL" ? T.danger : s === "HIGH" ? T.warn : T.accent;

  const trustColor = (s: number) =>
    s >= 0.8 ? "#22c55e" : s >= 0.5 ? T.warn : T.danger;

  const trustLabel = (s: number) =>
    s >= 0.8 ? "Trusted" : s >= 0.5 ? "Moderate" : "Untrusted";

  /* ---------- sidebar tabs ---------- */
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "chats", label: "Chats", icon: <ChatIcon size={22} /> },
    { key: "alerts", label: "Alerts", icon: <AlertIcon size={22} /> },
    { key: "trust", label: "Trust", icon: <ShieldIcon size={22} /> },
    { key: "support", label: "Support", icon: <TicketIcon size={22} /> },
    { key: "contacts", label: "Contacts", icon: <UserIcon size={22} /> },
    { key: "settings", label: "Settings", icon: <GearIcon size={22} /> },
  ];

  /* ---------- render helpers ---------- */

  function renderSidebar() {
    return (
      <div
        style={{
          width: 68, minWidth: 68, height: "100%", background: T.card,
          borderRight: `1px solid ${T.border}`, display: "flex",
          flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 4,
        }}
      >
        <div style={{ marginBottom: 12, color: T.accent }}>
          <ShieldIcon size={28} />
        </div>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              width: 52, height: 52, borderRadius: 12, border: "none",
              background: tab === t.key ? T.accent + "22" : "transparent",
              color: tab === t.key ? T.bright : T.muted,
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
              fontSize: 9, fontFamily: FONT, fontWeight: tab === t.key ? 600 : 400,
              transition: "all 0.15s",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  function renderDemoBanner() {
    return (
      <div
        style={{
          background: `linear-gradient(90deg, ${T.accent}18, ${T.accent}08)`,
          borderBottom: `1px solid ${T.accent}33`, padding: "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 13, fontFamily: FONT, color: T.accent, flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BrainIcon size={16} />
          <span>
            <strong>INTERACTIVE DEMO</strong> — Explore X Shield without an account. All data is simulated.
          </span>
        </div>
        <button
          onClick={onExit}
          style={{
            background: T.danger + "22", color: T.danger, border: `1px solid ${T.danger}44`,
            borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontSize: 12,
            fontWeight: 600, fontFamily: FONT,
          }}
        >
          Exit Demo
        </button>
      </div>
    );
  }

  /* ---------- CHATS tab ---------- */

  function renderChats() {
    return (
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* contact list */}
        <div
          style={{
            width: 280, minWidth: 280, borderRight: `1px solid ${T.border}`,
            overflowY: "auto", background: T.bg,
          }}
        >
          <div style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, color: T.bright, borderBottom: `1px solid ${T.border}` }}>
            Messages
          </div>
          {CONTACTS.map((c) => (
            <div
              key={c.id}
              onClick={() => { setActiveContact(c.id); setScamBanner(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                cursor: "pointer", borderBottom: `1px solid ${T.border}`,
                background: activeContact === c.id ? T.card : "transparent",
                transition: "background 0.15s",
              }}
            >
              <Avatar initials={c.fingerprint.slice(0, 2)} fp={c.fingerprint} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.bright }}>{c.name}</span>
                  {c.cooling && <Badge text="COOLING" color={T.warn} />}
                </div>
                <div style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.lastMsg}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <Badge text={`${Math.round(c.trustScore * 100)}%`} color={trustColor(c.trustScore)} />
                {c.unread > 0 && (
                  <span
                    style={{
                      background: T.accent, color: T.bg, borderRadius: "50%",
                      width: 18, height: 18, fontSize: 10, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {c.unread}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* chat view */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: T.bg, overflow: "hidden" }}>
          {/* header */}
          <div
            style={{
              padding: "12px 18px", borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", gap: 12, background: T.card, flexShrink: 0,
            }}
          >
            <Avatar initials={contact.fingerprint.slice(0, 2)} fp={contact.fingerprint} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.bright }}>{contact.name}</span>
                <Badge text={trustLabel(contact.trustScore)} color={trustColor(contact.trustScore)} />
              </div>
              <div style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>{contact.fingerprint}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#22c55e" }}>
              <LockIcon size={14} />
              <span style={{ fontSize: 10, fontWeight: 600 }}>E2EE</span>
            </div>
          </div>

          {/* cooling period banner */}
          {contact.cooling && (
            <div
              style={{
                background: T.warn + "18", borderBottom: `1px solid ${T.warn}44`,
                padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, color: T.warn, flexShrink: 0,
              }}
            >
              <ClockIcon size={16} style={{ color: T.warn }} />
              <span style={{ flex: 1 }}>
                <strong>Cooling period active — 48h remaining.</strong> Wallet addresses, links, and seed keywords are restricted.
              </span>
              <button
                style={{
                  background: T.warn + "22", color: T.warn, border: `1px solid ${T.warn}44`,
                  borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontSize: 11,
                  fontWeight: 600, fontFamily: FONT,
                }}
              >
                Exempt
              </button>
            </div>
          )}

          {/* scam detection banner */}
          {scamBanner && (
            <div
              style={{
                background: T.danger + "18", borderBottom: `1px solid ${T.danger}44`,
                padding: "10px 18px", display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, color: T.danger, flexShrink: 0,
              }}
            >
              <AlertIcon size={16} style={{ color: T.danger }} />
              <span style={{ flex: 1 }}>
                <strong>AI detected a suspicious pattern</strong> — <Badge text={scamBanner.severity} color={severityColor(scamBanner.severity)} /> {scamBanner.label}
              </span>
              <button onClick={() => setScamBanner(null)} style={{ background: "none", border: "none", color: T.danger, cursor: "pointer" }}>
                <XIcon size={14} />
              </button>
            </div>
          )}

          {/* E2EE notice */}
          <div
            style={{
              textAlign: "center", padding: "8px 0", fontSize: 10, color: T.muted,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0,
            }}
          >
            <LockIcon size={10} style={{ color: T.muted }} />
            Messages are end-to-end encrypted. Only you and {contact.name} can read them.
          </div>

          {/* messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px" }}>
            {chatMsgs.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: m.from === "me" ? "flex-end" : "flex-start",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    maxWidth: "70%", padding: "8px 14px", borderRadius: 12,
                    background: m.from === "me" ? "#16432a" : T.card,
                    border: `1px solid ${m.from === "me" ? "#22c55e33" : T.border}`,
                    color: T.text, fontSize: 13,
                  }}
                >
                  <div>{m.text}</div>
                  <div style={{ fontSize: 9, color: T.muted, marginTop: 4, textAlign: "right" }}>{m.time}</div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* input */}
          <div
            style={{
              padding: "10px 18px", borderTop: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", gap: 10, background: T.card, flexShrink: 0,
            }}
          >
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              style={{
                flex: 1, background: T.input, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: "10px 14px", color: T.text, fontSize: 13,
                outline: "none", fontFamily: FONT,
              }}
            />
            <button
              onClick={sendMessage}
              style={{
                background: T.accent + "22", border: `1px solid ${T.accent}44`,
                borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                color: T.accent, display: "flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 600, fontFamily: FONT,
              }}
            >
              <SendIcon size={14} />
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- ALERTS tab ---------- */

  function renderAlerts() {
    return (
      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        <h2 style={{ color: T.bright, fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertIcon size={20} /> Scam Alerts
        </h2>
        {alerts.length === 0 && (
          <div style={{ color: T.muted, textAlign: "center", padding: 40 }}>No active alerts.</div>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            style={{
              background: T.card, border: `1px solid ${severityColor(a.severity)}44`,
              borderRadius: 10, padding: 16, marginBottom: 12,
              borderLeft: `4px solid ${severityColor(a.severity)}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge text={a.severity} color={severityColor(a.severity)} />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.bright }}>{a.label}</span>
              </div>
              <button
                onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                style={{ background: "none", border: "none", color: T.muted, cursor: "pointer" }}
              >
                <XIcon size={16} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>
              From: <span style={{ color: T.accent }}>{a.from}</span>
            </div>
            <div style={{ fontSize: 13, color: T.text }}>{a.description}</div>
          </div>
        ))}
      </div>
    );
  }

  /* ---------- TRUST tab ---------- */

  function renderTrust() {
    const score = 0.82;
    const stats = [
      { label: "Invite Depth", value: "2" },
      { label: "Community Flags", value: "0" },
      { label: "Can Invite", value: "Yes" },
      { label: "Admin", value: "Verified" },
      { label: "Invited By", value: "Creator" },
      { label: "Account Age", value: "45d" },
    ];
    return (
      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        <h2 style={{ color: T.bright, fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldIcon size={20} /> Trust Profile
        </h2>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <Avatar initials="DA" fp="F1B2:C3D4:E5F6" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.bright }}>Demo_Admin</div>
              <div style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>F1B2:C3D4:E5F6</div>
            </div>
            <Badge text="Trusted" color="#22c55e" />
          </div>

          {/* score bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.muted, marginBottom: 6 }}>
              <span>Trust Score</span>
              <span style={{ color: trustColor(score), fontWeight: 700 }}>{Math.round(score * 100)}%</span>
            </div>
            <div style={{ background: T.border, borderRadius: 6, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${score * 100}%`, height: "100%", background: trustColor(score), borderRadius: 6, transition: "width 0.5s" }} />
            </div>
          </div>

          {/* stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: "12px 14px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.bright }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- SUPPORT tab ---------- */

  function renderSupport() {
    const tickets = [
      { id: 1001, subject: "Account recovery help", status: "VERIFIED", priority: "normal", category: "account" },
      { id: 1002, subject: "Suspicious user report", status: "ASSIGNED", priority: "high", category: "report_user" },
    ];
    return (
      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        <h2 style={{ color: T.bright, fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <TicketIcon size={20} /> Support Tickets
        </h2>
        {tickets.map((tk) => (
          <div
            key={tk.id}
            style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
              marginBottom: 12, overflow: "hidden",
            }}
          >
            <div
              onClick={() => setExpandedTicket(expandedTicket === tk.id ? null : tk.id)}
              style={{
                padding: "14px 18px", display: "flex", alignItems: "center",
                justifyContent: "space-between", cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: T.muted }}>#{tk.id}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.bright }}>{tk.subject}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge text={tk.status} color={tk.status === "VERIFIED" ? "#22c55e" : T.accent} />
                <Badge text={tk.priority} color={tk.priority === "high" ? T.warn : T.muted} />
                <Badge text={tk.category} color={T.accent} />
              </div>
            </div>
            {expandedTicket === tk.id && (
              <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                {tk.id === 1001 && (
                  <div
                    style={{
                      background: "#22c55e18", border: "1px solid #22c55e44",
                      borderRadius: 8, padding: "12px 16px", display: "flex",
                      alignItems: "center", gap: 10,
                    }}
                  >
                    <CheckIcon size={16} style={{ color: "#22c55e" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>Admin Identity Verified</div>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        ed25519 challenge-response verified at {new Date().toISOString().replace("T", " ").slice(0, 19)}
                      </div>
                    </div>
                  </div>
                )}
                {tk.id === 1002 && !ticket2Verified && (
                  <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <button
                      onClick={handleVerifyAdmin}
                      disabled={verifyAnimating}
                      style={{
                        background: verifyAnimating ? T.accent + "22" : T.accent + "33",
                        color: T.accent, border: `1px solid ${T.accent}44`,
                        borderRadius: 8, padding: "10px 24px", cursor: verifyAnimating ? "wait" : "pointer",
                        fontSize: 13, fontWeight: 600, fontFamily: FONT,
                        transition: "all 0.3s",
                      }}
                    >
                      {verifyAnimating ? "Verifying..." : "Verify Admin"}
                    </button>
                  </div>
                )}
                {tk.id === 1002 && ticket2Verified && (
                  <div
                    style={{
                      background: "#22c55e18", border: "1px solid #22c55e44",
                      borderRadius: 8, padding: "12px 16px", display: "flex",
                      alignItems: "center", gap: 10,
                      animation: "fadeIn 0.3s ease-in",
                    }}
                  >
                    <CheckIcon size={16} style={{ color: "#22c55e" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>Admin Identity Verified</div>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        ed25519 challenge-response verified at {new Date().toISOString().replace("T", " ").slice(0, 19)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  /* ---------- CONTACTS tab ---------- */

  function renderContacts() {
    return (
      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        <h2 style={{ color: T.bright, fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <UserIcon size={20} /> Contacts
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {CONTACTS.map((c) => (
            <div
              key={c.id}
              style={{
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                padding: 16, display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar initials={c.fingerprint.slice(0, 2)} fp={c.fingerprint} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.bright }}>{c.name}</span>
                    {c.admin && <Badge text="ADMIN" color="#22c55e" />}
                    {c.cooling && <Badge text="COOLING" color={T.warn} />}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{c.fingerprint}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Badge text={`Trust: ${Math.round(c.trustScore * 100)}%`} color={trustColor(c.trustScore)} />
                <button
                  onClick={() => { setActiveContact(c.id); setTab("chats"); }}
                  style={{
                    background: T.accent + "22", color: T.accent, border: `1px solid ${T.accent}44`,
                    borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontSize: 11,
                    fontWeight: 600, fontFamily: FONT,
                  }}
                >
                  Message
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- SETTINGS tab ---------- */

  function renderSettings() {
    const securityItems = [
      { label: "E2EE Messaging", active: true },
      { label: "Device Binding", active: true },
      { label: "BIP39 Backup", active: true },
      { label: "Two-Factor Auth", active: true },
    ];
    return (
      <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        <h2 style={{ color: T.bright, fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <GearIcon size={20} /> Settings
        </h2>

        {/* account info */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.bright, marginBottom: 12 }}>Account</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <Avatar initials="DA" fp="F1B2:C3D4:E5F6" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.bright }}>Demo_Admin</div>
              <div style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>F1B2:C3D4:E5F6</div>
            </div>
          </div>
        </div>

        {/* security */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.bright, marginBottom: 12 }}>Security</div>
          {securityItems.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 0", borderBottom: `1px solid ${T.border}`,
              }}
            >
              <span style={{ fontSize: 13, color: T.text }}>{s.label}</span>
              <Badge text="ACTIVE" color="#22c55e" />
            </div>
          ))}
        </div>

        {/* invite codes */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.bright }}>Invite Codes</div>
            <button
              onClick={generateInviteCode}
              style={{
                background: T.accent + "22", color: T.accent, border: `1px solid ${T.accent}44`,
                borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 11,
                fontWeight: 600, fontFamily: FONT,
              }}
            >
              Generate Code
            </button>
          </div>
          {inviteCodes.map((code, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 6, marginBottom: 6, fontFamily: "monospace", fontSize: 13, color: T.bright,
              }}
            >
              {code}
              <Badge text="ACTIVE" color="#22c55e" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- content router ---------- */

  function renderContent() {
    switch (tab) {
      case "chats": return renderChats();
      case "alerts": return renderAlerts();
      case "trust": return renderTrust();
      case "support": return renderSupport();
      case "contacts": return renderContacts();
      case "settings": return renderSettings();
    }
  }

  /* ---------- main render ---------- */

  return (
    <div
      style={{
        width: "100vw", height: "100vh", background: T.bg, color: T.text,
        fontFamily: FONT, display: "flex", overflow: "hidden", position: "relative",
      }}
    >
      {renderSidebar()}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {renderDemoBanner()}
        {renderContent()}
      </div>

      {/* scam popup overlay */}
      {scamPopup && (
        <div
          style={{
            position: "fixed", top: 20, right: 20, zIndex: 9999,
            background: T.card, border: `2px solid ${T.danger}`,
            borderRadius: 12, padding: "16px 20px", maxWidth: 360,
            boxShadow: `0 8px 32px ${T.danger}33`,
            animation: "slideIn 0.3s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <AlertIcon size={20} style={{ color: T.danger }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: T.danger }}>Scam Pattern Detected</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Badge text={scamPopup.severity} color={severityColor(scamPopup.severity)} />
            <span style={{ fontSize: 13, color: T.bright }}>{scamPopup.label}</span>
          </div>
          <div style={{ fontSize: 12, color: T.muted }}>
            This message has been flagged by AI analysis. Exercise extreme caution.
          </div>
          <button
            onClick={() => setScamPopup(null)}
            style={{
              position: "absolute", top: 8, right: 8, background: "none",
              border: "none", color: T.muted, cursor: "pointer",
            }}
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* inline keyframes */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
