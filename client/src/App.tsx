import { useState, useEffect, useRef, useCallback } from "react";
import AdminGuide from "./AdminGuide.tsx";
import TeamSpec from "./TeamSpec.tsx";
import LandingPage from "./LandingPage.tsx";
import LoginScreen from "./LoginScreen.tsx";
import { useAuth } from "./context/AuthContext.tsx";
import { useWebSocket, type WsEvent } from "./hooks/useWebSocket.ts";

// ===================== ICONS =====================
interface IconProps {
  d?: React.ReactNode;
  size?: number;
  color?: string;
  fill?: string;
}

const Icon = ({ d, size = 20, color = "currentColor", fill = "none" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

const ShieldIcon = (p: Partial<IconProps>) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
const LockIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>} />;
const SendIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>} />;
const AlertIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="17" r="0.5" /></>} />;
const ChatIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></>} />;
const UserIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>} />;
const SettingsIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>} />;
const TicketIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><path d="M15 5v2" /><path d="M15 11v2" /><path d="M15 17v2" /><path d="M5 5h14a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 000-4V7a2 2 0 012-2z" /></>} />;
const CheckIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><polyline points="20 6 9 17 4 12" /></>} />;
const XIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>} />;
const BrainIcon = (p: Partial<IconProps>) => <Icon {...p} d="M9.5 2A5.5 5.5 0 004 7.5c0 1.5.5 2.8 1.3 3.8L4 14l3-1 .7.3A5.5 5.5 0 0015 14.7l.7-.3 3 1-1.3-2.7A5.5 5.5 0 0014.5 2h-5z" />;
const ClockIcon = (p: Partial<IconProps>) => <Icon {...p} d={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} />;

// ===================== THEME =====================
const T = {
  bg: "#0a0a14", card: "#12122a", border: "#1e1e3a", text: "#e0e0ee",
  muted: "#6b6b8a", accent: "#00d26a", danger: "#ff4757", warn: "#ffa502",
  input: "#0e0e1e",
};

// ===================== HELPERS =====================
function fpColor(fp: string | undefined) {
  if (!fp) return T.accent;
  const h = fp.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${h},70%,55%)`;
}

function genHex(n: number) {
  return Array.from({length: n}, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");
}

function genFp() { return genHex(4) + ":" + genHex(4) + ":" + genHex(4); }

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

// ===================== SIMULATED DATA =====================
interface User {
  id: string;
  username: string;
  fp: string;
  trustScore: number;
  isAdmin: boolean;
  isVerifiedAdmin: boolean;
}

interface Contact extends User {
  unread: number;
  lastMsg: string;
  lastAt: string;
  cooling: boolean;
  coolHrs: number;
}

interface Message {
  id: string;
  sender: string;
  text: string;
  time: number;
}

interface Alert {
  id: string;
  sender: string;
  severity: string;
  message: string;
  pattern: string;
  time: number;
}

interface Ticket {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  admin: string;
  adminFp: string;
  adminVerified: boolean;
  created: string;
}

// ME is now derived from auth state inside the app component.
// This default is only used as a fallback for components that render before auth loads.
const DEFAULT_ME: User = { id: "u1", username: "Guest", fp: genFp(), trustScore: 0, isAdmin: false, isVerifiedAdmin: false };

const CONTACTS: Contact[] = [
  { id: "u2", username: "Alice_Dev", fp: genFp(), trustScore: 0.88, isAdmin: false, isVerifiedAdmin: true, unread: 2, lastMsg: "Hey, did you see the update?", lastAt: new Date(Date.now() - 3600000).toISOString(), cooling: false, coolHrs: 0 },
  { id: "u3", username: "Bob_Trader", fp: genFp(), trustScore: 0.71, isAdmin: false, isVerifiedAdmin: false, unread: 0, lastMsg: "Thanks for the tip!", lastAt: new Date(Date.now() - 86400000).toISOString(), cooling: false, coolHrs: 0 },
  { id: "u4", username: "NewUser_Jake", fp: genFp(), trustScore: 0.35, isAdmin: false, isVerifiedAdmin: false, unread: 1, lastMsg: "Can you help me set up?", lastAt: new Date(Date.now() - 7200000).toISOString(), cooling: true, coolHrs: 48 },
  { id: "u5", username: "Carol_Mod", fp: genFp(), trustScore: 0.95, isAdmin: false, isVerifiedAdmin: true, unread: 0, lastMsg: "All clear on the audit.", lastAt: new Date(Date.now() - 172800000).toISOString(), cooling: false, coolHrs: 0 },
];

const MOCK_MSGS: Record<string, Message[]> = {
  u2: [
    { id: "m1", sender: "u2", text: "Hey, did you see the update?", time: Date.now() - 3600000 },
    { id: "m2", sender: "u1", text: "Not yet, what changed?", time: Date.now() - 3500000 },
    { id: "m3", sender: "u2", text: "Trust scoring now cascades 3 levels. Pretty sick.", time: Date.now() - 3400000 },
  ],
  u4: [
    { id: "m4", sender: "u4", text: "Hey I'm new here. Can you help me set up?", time: Date.now() - 7200000 },
    { id: "m5", sender: "u1", text: "Sure, what do you need?", time: Date.now() - 7100000 },
  ],
};

const MOCK_ALERTS: Alert[] = [
  { id: "a1", sender: "Unknown_X99", severity: "CRITICAL", message: "NEVER share your seed phrase with anyone.", pattern: "Seed Phrase Request", time: Date.now() - 1800000 },
  { id: "a2", sender: "SketchyDave", severity: "HIGH", message: "Be cautious of links from new contacts.", pattern: "Suspicious Link", time: Date.now() - 86400000 },
];

const MOCK_TICKETS: Ticket[] = [
  { id: "t1", number: 1042, subject: "Can't verify my device", status: "verified", priority: "normal", category: "technical", admin: "Admin_Mark", adminFp: "A7F2:3B91:E4C8", adminVerified: true, created: new Date(Date.now() - 259200000).toISOString() },
  { id: "t2", number: 1043, subject: "Suspicious DM from cloned account", status: "assigned", priority: "high", category: "security", admin: "Carol_Mod", adminFp: CONTACTS[3].fp, adminVerified: false, created: new Date(Date.now() - 86400000).toISOString() },
];

// ===================== COMPONENTS =====================

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: color + "22", color, border: `1px solid ${color}44`, whiteSpace: "nowrap" }}>{text}</span>
  );
}

function Avatar({ fp, size = 36, verified = false }: { fp?: string; size?: number; verified?: boolean }) {
  const c = fpColor(fp);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${c}`, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, color: c, fontWeight: 700 }}>
        {fp?.slice(0, 2) || "??"}
      </div>
      {verified && (
        <div style={{ position: "absolute", bottom: -1, right: -1, background: T.accent, borderRadius: "50%", width: size * 0.38, height: size * 0.38, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckIcon size={size * 0.22} color="#000" />
        </div>
      )}
    </div>
  );
}

function Card({ children, style = {}, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, ...style }} {...p}>{children}</div>;
}

function Btn({ children, onClick, variant = "primary", small, disabled, ...p }: { children: React.ReactNode; onClick?: () => void; variant?: string; small?: boolean; disabled?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, { bg: string; c: string }> = { primary: { bg: T.accent, c: "#000" }, danger: { bg: T.danger, c: "#fff" }, ghost: { bg: "rgba(255,255,255,0.06)", c: T.muted }, warn: { bg: T.warn, c: "#000" } };
  const v = variants[variant] || variants.primary;
  return <button onClick={onClick} disabled={disabled} style={{ padding: small ? "5px 12px" : "9px 18px", background: disabled ? "#222" : v.bg, color: disabled ? "#555" : v.c, border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: small ? 11 : 13, fontFamily: "inherit", transition: "all .15s" }} {...p}>{children}</button>;
}

function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} style={{ padding: "8px 12px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", ...(p.style || {}) }} />;
}

// ===================== SIDEBAR =====================
function Sidebar({ activeTab, setTab, unreadTotal, alertCount }: { activeTab: string; setTab: (t: string) => void; unreadTotal: number; alertCount: number }) {
  const tabs = [
    { id: "chats", icon: ChatIcon, label: "Chats", badge: unreadTotal, badgeColor: undefined as string | undefined },
    { id: "contacts", icon: UserIcon, label: "Contacts", badge: 0, badgeColor: undefined as string | undefined },
    { id: "alerts", icon: AlertIcon, label: "Alerts", badge: alertCount, badgeColor: T.danger },
    { id: "support", icon: TicketIcon, label: "Support", badge: 0, badgeColor: undefined as string | undefined },
    { id: "trust", icon: ShieldIcon, label: "Trust", badge: 0, badgeColor: undefined as string | undefined },
    { id: "settings", icon: SettingsIcon, label: "Settings", badge: 0, badgeColor: undefined as string | undefined },
  ];
  return (
    <div style={{ width: 68, background: T.card, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 4, flexShrink: 0 }}>
      <div style={{ marginBottom: 12 }}><ShieldIcon size={24} color={T.accent} /></div>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{ width: 52, height: 48, borderRadius: 10, border: "none", background: activeTab === t.id ? "rgba(0,210,106,0.12)" : "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, position: "relative", transition: "all .15s" }}>
          <t.icon size={18} color={activeTab === t.id ? T.accent : T.muted} />
          <span style={{ fontSize: 9, color: activeTab === t.id ? T.accent : T.muted, fontWeight: activeTab === t.id ? 700 : 500 }}>{t.label}</span>
          {t.badge > 0 && <div style={{ position: "absolute", top: 4, right: 6, background: t.badgeColor || T.accent, borderRadius: 8, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#000", padding: "0 4px" }}>{t.badge}</div>}
        </button>
      ))}
    </div>
  );
}

// ===================== CHAT LIST =====================
function ChatList({ contacts, selected, onSelect }: { contacts: Contact[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div style={{ width: 280, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>Messages</span>
          <Badge text="E2EE" color={T.accent} />
        </div>
        <Input placeholder="Search conversations..." style={{ fontSize: 12, padding: "6px 10px" }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {contacts.map(c => (
          <div key={c.id} onClick={() => onSelect(c.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", background: selected === c.id ? "rgba(0,210,106,0.08)" : "transparent", borderLeft: selected === c.id ? `3px solid ${T.accent}` : "3px solid transparent", transition: "all .1s" }}>
            <Avatar fp={c.fp} size={38} verified={c.isVerifiedAdmin} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{c.username}</span>
                <span style={{ fontSize: 10, color: T.muted }}>{timeAgo(c.lastAt)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                <span style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{c.lastMsg}</span>
                {c.unread > 0 && <div style={{ background: T.accent, borderRadius: 8, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#000" }}>{c.unread}</div>}
              </div>
              {c.cooling && <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}><ClockIcon size={10} color={T.warn} /><span style={{ fontSize: 9, color: T.warn }}>{c.coolHrs}h cooling</span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== CHAT VIEW =====================
function ChatView({ contact, messages, onSend, meId }: { contact: Contact | undefined; messages: Message[] | undefined; onSend: (text: string) => void; meId: string }) {
  const [input, setInput] = useState("");
  const [scamWarning, setScamWarning] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const scamPatterns = [/seed\s*phrase/i, /private\s*key/i, /send\s*(me\s*)?(your\s*)?(btc|eth|crypto)/i, /double\s*(your|the)\s*(money|crypto)/i, /connect\s*(your\s*)?wallet/i];

  function handleSend() {
    if (!input.trim()) return;
    const isScam = scamPatterns.some(p => p.test(input));
    onSend(input);
    setInput("");
    if (isScam) setScamWarning("AI detected a suspicious pattern in this conversation.");
  }

  if (!contact) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <LockIcon size={48} color={T.border} /><p style={{ color: T.muted, fontSize: 14 }}>Select a conversation</p>
      <p style={{ color: T.muted, fontSize: 11 }}>All messages are end-to-end encrypted</p>
    </div>
  );

  const trustColor = contact.trustScore >= 0.8 ? T.accent : contact.trustScore >= 0.5 ? T.warn : T.danger;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar fp={contact.fp} size={34} verified={contact.isVerifiedAdmin} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{contact.username}</span>
              {contact.isVerifiedAdmin && <Badge text="VERIFIED" color={T.accent} />}
            </div>
            <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{contact.fp}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge text={`Trust ${contact.trustScore}`} color={trustColor} />
          <LockIcon size={14} color={T.accent} />
          <span style={{ fontSize: 10, color: T.accent }}>E2EE</span>
        </div>
      </div>
      {/* Cooling banner */}
      {contact.cooling && (
        <div style={{ padding: "8px 16px", background: T.warn + "15", borderBottom: `1px solid ${T.warn}33`, display: "flex", alignItems: "center", gap: 8 }}>
          <ClockIcon size={14} color={T.warn} />
          <span style={{ fontSize: 11, color: T.warn }}>Cooling period active — {contact.coolHrs}h remaining. Wallet addresses, links, and seed keywords are restricted.</span>
        </div>
      )}
      {/* Scam warning */}
      {scamWarning && (
        <div style={{ padding: "8px 16px", background: T.danger + "15", borderBottom: `1px solid ${T.danger}33`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BrainIcon size={14} color={T.danger} />
            <span style={{ fontSize: 11, color: T.danger, fontWeight: 600 }}>{scamWarning}</span>
          </div>
          <button onClick={() => setScamWarning(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><XIcon size={14} color={T.danger} /></button>
        </div>
      )}
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ textAlign: "center", padding: 12 }}>
          <LockIcon size={16} color={T.border} />
          <p style={{ color: T.muted, fontSize: 10, marginTop: 4 }}>Messages are end-to-end encrypted. Only you and {contact.username} can read them.</p>
        </div>
        {(messages || []).map(m => {
          const mine = m.sender === meId;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "70%", padding: "8px 12px", borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: mine ? "rgba(0,210,106,0.15)" : T.card, border: `1px solid ${mine ? "rgba(0,210,106,0.2)" : T.border}` }}>
                <p style={{ fontSize: 13, color: T.text, margin: 0, wordBreak: "break-word" }}>{m.text}</p>
                <p style={{ fontSize: 9, color: T.muted, marginTop: 4, textAlign: "right" }}>{new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {/* Input */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSend(); }} placeholder="Type a message..." style={{ flex: 1 }} />
        <Btn onClick={handleSend} small><SendIcon size={16} color="#000" /></Btn>
      </div>
    </div>
  );
}

// ===================== ALERTS TAB =====================
function AlertsTab() {
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  return (
    <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <BrainIcon size={22} color={T.accent} /><span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>Scam Alerts</span>
        <span style={{ fontSize: 11, color: T.muted }}>Visible only to you — senders don't know</span>
      </div>
      {alerts.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40 }}><ShieldIcon size={32} color={T.border} /><p style={{ color: T.muted, marginTop: 8 }}>No active alerts. You're safe.</p></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map(a => {
            const col = a.severity === "CRITICAL" ? T.danger : a.severity === "HIGH" ? T.warn : "#ffcc00";
            return (
              <Card key={a.id} style={{ borderColor: col + "44", background: col + "08" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Badge text={a.severity} color={col} />
                      <span style={{ fontSize: 11, color: T.muted }}>from <strong style={{ color: T.text }}>{a.sender}</strong></span>
                      <span style={{ fontSize: 10, color: T.muted }}>{timeAgo(String(a.time))}</span>
                    </div>
                    <p style={{ fontSize: 13, color: T.text, margin: 0 }}>{a.message}</p>
                    <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Pattern: {a.pattern}</p>
                  </div>
                  <button onClick={() => setAlerts(s => s.filter(x => x.id !== a.id))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><XIcon size={14} color={T.muted} /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===================== TRUST TAB =====================
function TrustTab({ me }: { me: User }) {
  const stats = [
    { label: "Invites Sent", val: "12", color: T.accent },
    { label: "Invitees Banned", val: "0", color: T.accent },
    { label: "Community Flags", val: "0", color: T.accent },
    { label: "Messages (30d)", val: "247", color: T.accent },
    { label: "Inviter Trust", val: "0.95", color: T.accent },
    { label: "Can Invite", val: "Yes", color: T.accent },
  ];
  return (
    <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><ShieldIcon size={22} color={T.accent} /><span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>My Trust Profile</span></div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar fp={me.fp} size={56} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>{me.username}</span>
              <Badge text={me.trustScore >= 0.8 ? "Trusted" : me.trustScore >= 0.5 ? "Caution" : "Warning"} color={me.trustScore >= 0.8 ? T.accent : me.trustScore >= 0.5 ? T.warn : T.danger} />
            </div>
            <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>{me.fp}</span>
            <div style={{ marginTop: 8, height: 8, background: T.input, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, width: `${me.trustScore * 100}%`, background: T.accent, transition: "all .3s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: T.muted }}>
              <span>Trust Score: {me.trustScore}</span><span>Account age: 180 days</span>
            </div>
          </div>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {stats.map((s, i) => (
          <Card key={i} style={{ textAlign: "center", padding: 12 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: 0 }}>{s.val}</p>
            <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{s.label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ===================== SUPPORT TAB =====================
function SupportTab() {
  const [sel, setSel] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const statusColors: Record<string, string> = { open: T.warn, assigned: T.warn, pending_verification: T.warn, verified: T.accent, resolved: T.muted, closed: T.muted };

  if (showNew) return (
    <div style={{ flex: 1, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 13 }}>&larr; Back</button>
        <span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>New Ticket</span>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={{ fontSize: 11, color: T.muted, display: "block", marginBottom: 4 }}>Subject</label><Input placeholder="Describe your issue..." /></div>
          <div>
            <label style={{ fontSize: 11, color: T.muted, display: "block", marginBottom: 4 }}>Category</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["account", "security", "billing", "technical", "report_user", "general"].map(c => <Btn key={c} variant="ghost" small>{c}</Btn>)}</div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: T.muted, display: "block", marginBottom: 4 }}>Priority</label>
            <div style={{ display: "flex", gap: 6 }}>{["low", "normal", "high", "urgent"].map(p => <Btn key={p} variant="ghost" small>{p}</Btn>)}</div>
          </div>
          <Btn onClick={() => setShowNew(false)}>Submit Ticket</Btn>
        </div>
      </Card>
    </div>
  );

  return (
    <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><TicketIcon size={22} color={T.accent} /><span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>Support Tickets</span></div>
        <Btn onClick={() => setShowNew(true)} small>New Ticket</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MOCK_TICKETS.map(t => (
          <Card key={t.id} style={{ cursor: "pointer" }} onClick={() => setSel(sel === t.id ? null : t.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>#{t.number}</span>
                  <Badge text={t.status.toUpperCase()} color={statusColors[t.status] || T.muted} />
                  <Badge text={t.priority} color={t.priority === "urgent" ? T.danger : t.priority === "high" ? T.warn : T.muted} />
                  <Badge text={t.category} color={T.muted} />
                </div>
                <p style={{ fontSize: 13, color: T.text, margin: 0 }}>{t.subject}</p>
                <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Opened {timeAgo(t.created)}</p>
              </div>
              {t.admin && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Avatar fp={t.adminFp} size={28} verified={t.adminVerified} />
                  <div>
                    <p style={{ fontSize: 11, color: T.text, margin: 0, fontWeight: 600 }}>{t.admin}</p>
                    {t.adminVerified
                      ? <span style={{ fontSize: 9, color: T.accent }}>Cryptographically Verified</span>
                      : <span style={{ fontSize: 9, color: T.warn }}>Pending verification</span>}
                  </div>
                </div>
              )}
            </div>
            {sel === t.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                {t.adminVerified ? (
                  <div style={{ padding: 10, background: T.accent + "11", borderRadius: 8, border: `1px solid ${T.accent}33` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckIcon size={14} color={T.accent} /><span style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>Admin Identity Verified</span></div>
                    <p style={{ fontSize: 10, color: T.muted, marginTop: 4, fontFamily: "monospace" }}>Chain: Creator &rarr; {t.admin} | ed25519 signature valid</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small variant="ghost">Verify Admin</Btn>
                    <Btn small variant="ghost">View Messages</Btn>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ===================== CONTACTS TAB =====================
function ContactsTab({ contacts }: { contacts: Contact[] }) {
  return (
    <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><UserIcon size={22} color={T.accent} /><span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>Contacts</span><span style={{ fontSize: 11, color: T.muted }}>{contacts.length} total</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {contacts.map(c => {
          const tc = c.trustScore >= 0.8 ? T.accent : c.trustScore >= 0.5 ? T.warn : T.danger;
          return (
            <Card key={c.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar fp={c.fp} size={42} verified={c.isVerifiedAdmin} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{c.username}</span>
                    {c.isVerifiedAdmin && <Badge text="ADMIN" color={T.accent} />}
                    {c.cooling && <Badge text={`COOLING ${c.coolHrs}h`} color={T.warn} />}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{c.fp}</span>
                    <Badge text={`${c.trustScore}`} color={tc} />
                  </div>
                </div>
                <Btn small variant="ghost">Message</Btn>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ===================== SETTINGS TAB =====================
function SettingsTab({ onOpenGuide, onOpenSpec, me, onLogout }: { onOpenGuide: () => void; onOpenSpec: () => void; me: User; onLogout: () => void }) {
  return (
    <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><SettingsIcon size={22} color={T.accent} /><span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>Settings</span></div>
      <Card style={{ marginBottom: 10 }}>
        <p style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 8 }}>Account</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Avatar fp={me.fp} size={48} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: T.text, margin: 0 }}>{me.username}</p>
            <p style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", margin: "4px 0" }}>{me.fp}</p>
            <Badge text={`Trust ${me.trustScore}`} color={T.accent} />
          </div>
        </div>
        <Btn onClick={onLogout} variant="danger" small style={{ marginTop: 4 }}>Log Out</Btn>
      </Card>
      <Card style={{ marginBottom: 10 }}>
        <p style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 8 }}>Security</p>
        {["E2EE Messaging", "Device Binding", "BIP39 Backup", "Two-Factor Auth"].map(s => (
          <div key={s} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, color: T.text }}>{s}</span><Badge text="ACTIVE" color={T.accent} />
          </div>
        ))}
      </Card>
      <Card style={{ marginBottom: 10 }}>
        <p style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 8 }}>Resources</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={onOpenGuide} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📖</span>
              <div style={{ textAlign: "left" }}>
                <p style={{ fontWeight: 600, fontSize: 13, color: T.text, margin: 0 }}>Admin User Guide</p>
                <p style={{ fontSize: 10, color: T.muted, margin: "2px 0 0" }}>Step-by-step walkthrough of every feature</p>
              </div>
            </div>
            <span style={{ color: T.muted, fontSize: 14 }}>&rarr;</span>
          </button>
          <button onClick={onOpenSpec} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📋</span>
              <div style={{ textAlign: "left" }}>
                <p style={{ fontWeight: 600, fontSize: 13, color: T.text, margin: 0 }}>Team Capability Sheet</p>
                <p style={{ fontSize: 10, color: T.muted, margin: "2px 0 0" }}>How your team can use bchat — share with stakeholders</p>
              </div>
            </div>
            <span style={{ color: T.muted, fontSize: 14 }}>&rarr;</span>
          </button>
        </div>
      </Card>
      <Card>
        <p style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 8 }}>About bchat</p>
        <p style={{ fontSize: 11, color: T.muted }}>Version 1.0.0 — Fraud-Elimination Messaging Platform</p>
        <p style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>BIP39/ed25519 identity | Hardware device binding | Invite chain accountability | AI scam detection | Contact cooling periods | Blind E2EE relay</p>
      </Card>
    </div>
  );
}

// ===================== MAIN APP =====================
export default function BchatApp() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState("chats");
  const [selChat, setSelChat] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, Message[]>>(MOCK_MSGS);
  const [overlay, setOverlay] = useState<"landing" | "login" | "guide" | "spec" | null>("landing");

  // Build ME from auth state, falling back to default for demo data
  const ME: User = user
    ? { id: user.userId, username: user.username, fp: genFp(), trustScore: 0.92, isAdmin: false, isVerifiedAdmin: false }
    : DEFAULT_ME;

  // ── WebSocket: live message delivery ──────────────────────
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === "new_message") {
      // Map the WS envelope into our local Message shape.
      // In a real E2EE flow the ciphertext would be decrypted first;
      // for now we show the ciphertext placeholder so the bubble renders.
      setMsgs(prev => {
        const convId = event.senderId; // mock contacts are keyed by sender ID
        const existing = prev[convId] || [];
        // De-dup in case we receive the same message twice
        if (existing.some(m => m.id === event.messageId)) return prev;
        return {
          ...prev,
          [convId]: [
            ...existing,
            {
              id: event.messageId,
              sender: event.senderId,
              text: "[encrypted]", // placeholder — decrypt with NaCl in production
              time: new Date(event.createdAt).getTime(),
            },
          ],
        };
      });
    }
    // message_sent / typing events can be handled here in future phases
  }, []);

  useWebSocket(handleWsEvent);
  // ──────────────────────────────────────────────────────────

  // When user logs in successfully, dismiss the login overlay
  useEffect(() => {
    if (user && overlay === "login") {
      setOverlay(null);
    }
  }, [user, overlay]);

  const unreadTotal = CONTACTS.reduce((a, c) => a + c.unread, 0);

  function handleSend(text: string) {
    if (!selChat) return;
    setMsgs(prev => ({
      ...prev,
      [selChat]: [...(prev[selChat] || []), { id: "m" + Date.now(), sender: ME.id, text, time: Date.now() }],
    }));
  }

  function handleLogout() {
    logout();
    setOverlay("landing");
    setTab("chats");
    setSelChat(null);
  }

  const contact = CONTACTS.find(c => c.id === selChat);

  // Loading spinner while restoring session
  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, color: T.accent, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
        <p style={{ fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  // Full-screen overlays
  if (overlay === "landing") {
    return (
      <LandingPage
        onOpenGuide={() => setOverlay("guide")}
        onOpenSpec={() => setOverlay("spec")}
        onOpenApp={() => {
          // If already logged in, go straight to app. Otherwise, show login.
          if (user) {
            setOverlay(null);
          } else {
            setOverlay("login");
          }
        }}
      />
    );
  }
  if (overlay === "login") {
    return <LoginScreen onBack={() => setOverlay("landing")} />;
  }
  if (overlay === "guide") {
    return (
      <div style={{ height: "100vh", display: "flex", background: T.bg, color: T.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", fontSize: 14 }}>
        <AdminGuide onBack={() => setOverlay("landing")} />
      </div>
    );
  }
  if (overlay === "spec") {
    return (
      <div style={{ height: "100vh", display: "flex", background: T.bg, color: T.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", fontSize: 14 }}>
        <TeamSpec onBack={() => setOverlay("landing")} />
      </div>
    );
  }

  // If somehow at main app without auth, redirect to login
  if (!user) {
    return <LoginScreen onBack={() => setOverlay("landing")} />;
  }

  return (
    <div style={{ height: "100vh", display: "flex", background: T.bg, color: T.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", fontSize: 14 }}>
      <Sidebar activeTab={tab} setTab={setTab} unreadTotal={unreadTotal} alertCount={MOCK_ALERTS.length} />
      {tab === "chats" && <>
        <ChatList contacts={CONTACTS} selected={selChat} onSelect={id => { setSelChat(id); setTab("chats"); }} />
        <ChatView contact={contact} messages={msgs[selChat || ""]} onSend={handleSend} meId={ME.id} />
      </>}
      {tab === "contacts" && <ContactsTab contacts={CONTACTS} />}
      {tab === "alerts" && <AlertsTab />}
      {tab === "support" && <SupportTab />}
      {tab === "trust" && <TrustTab me={ME} />}
      {tab === "settings" && <SettingsTab onOpenGuide={() => setOverlay("guide")} onOpenSpec={() => setOverlay("spec")} me={ME} onLogout={handleLogout} />}
    </div>
  );
}
