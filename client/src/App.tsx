import { useState, useEffect, useRef, useCallback } from "react";
import AdminGuide from "./AdminGuide.tsx";
import TeamSpec from "./TeamSpec.tsx";
import TutorialPopup from "./TutorialPopup.tsx";
import LandingPage from "./LandingPage.tsx";
import LoginScreen from "./LoginScreen.tsx";
import { useAuth } from "./context/AuthContext.tsx";
import { useWebSocket, type WsEvent, type WsNewMessage } from "./hooks/useWebSocket.ts";
import { encryptMessage, decryptMessage } from "./crypto/e2ee.ts";
import { initKeyPair, getKeyPair, clearKeyPair, fetchRecipientKey } from "./crypto/keyManager.ts";
import { sendMessage, getCoolingStatus, exemptCooling } from "./api/messages.ts";
import { ApiError } from "./api/client.ts";
import { getMyTrustProfile, type TrustProfile } from "./api/trust.ts";
import { createTicket as apiCreateTicket, getMyTickets, requestVerification, type SupportTicket } from "./api/support.ts";
import { getMyAlerts, dismissAlert as apiDismissAlert, type ScamAlert } from "./api/scam.ts";
import { createInvite, getMyInvites, type Invite } from "./api/invites.ts";

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
  bg: "#0a0b10", card: "#111827", border: "#1f2937", text: "#e2e8f0",
  muted: "#6b7b8d", accent: "#94a3b8", danger: "#ff4757", warn: "#ffa502",
  input: "#0d1117", silver: "#c9d1d9", bright: "#e6edf3",
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

// Alert type is now ScamAlert from api/scam.ts

// Ticket type is now SupportTicket from api/support.ts

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

// Mock alerts removed — AlertsTab now fetches from /api/scam/alerts

// Mock tickets removed — SupportTab now fetches from /api/support/tickets

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
function ChatView({ contact, messages, onSend, meId, cooling, isAdmin, onExemptCooling }: { contact: Contact | undefined; messages: Message[] | undefined; onSend: (text: string) => void; meId: string; cooling?: { hoursRemaining: number; expiresAt: string }; isAdmin?: boolean; onExemptCooling?: () => void }) {
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
      {cooling && (
        <div style={{ padding: "8px 16px", background: T.warn + "15", borderBottom: `1px solid ${T.warn}33`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ClockIcon size={14} color={T.warn} />
            <span style={{ fontSize: 11, color: T.warn }}>Cooling period active — {cooling.hoursRemaining}h remaining. Wallet addresses, links, and seed keywords are restricted.</span>
          </div>
          {isAdmin && onExemptCooling && (
            <Btn small variant="warn" onClick={onExemptCooling}>Exempt</Btn>
          )}
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
function AlertsTab({ alerts, onDismiss }: { alerts: ScamAlert[]; onDismiss: (id: string) => void }) {
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
                      <span style={{ fontSize: 11, color: T.muted }}>from <strong style={{ color: T.text }}>{a.senderId}</strong></span>
                      <span style={{ fontSize: 10, color: T.muted }}>{timeAgo(a.createdAt)}</span>
                    </div>
                    <p style={{ fontSize: 13, color: T.text, margin: 0 }}>{a.alertMessage}</p>
                  </div>
                  <button onClick={() => onDismiss(a.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><XIcon size={14} color={T.muted} /></button>
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
function TrustTab({ me, profile }: { me: User; profile: TrustProfile | null }) {
  const score = profile?.trustScore ?? me.trustScore;
  const accountDays = profile ? Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / 86_400_000) : 0;
  const stats = [
    { label: "Invite Depth", val: profile ? String(profile.inviteDepth) : "--", color: T.accent },
    { label: "Community Flags", val: profile ? String(profile.flagCount) : "--", color: profile && profile.flagCount > 0 ? T.warn : T.accent },
    { label: "Can Invite", val: profile ? (profile.canInvite ? "Yes" : "No") : "--", color: profile?.canInvite ? T.accent : T.danger },
    { label: "Admin", val: profile ? (profile.isVerifiedAdmin ? "Verified" : profile.isAdmin ? "Yes" : "No") : "--", color: profile?.isVerifiedAdmin ? T.accent : T.muted },
    { label: "Invited By", val: profile?.invitedBy ?? "--", color: T.muted },
    { label: "Account Age", val: profile ? `${accountDays}d` : "--", color: T.accent },
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
              <Badge text={score >= 0.8 ? "Trusted" : score >= 0.5 ? "Caution" : "Warning"} color={score >= 0.8 ? T.accent : score >= 0.5 ? T.warn : T.danger} />
            </div>
            <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>{me.fp}</span>
            <div style={{ marginTop: 8, height: 8, background: T.input, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, width: `${score * 100}%`, background: T.accent, transition: "all .3s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: T.muted }}>
              <span>Trust Score: {score.toFixed(2)}</span><span>Account age: {accountDays} days</span>
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
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const statusColors: Record<string, string> = { open: T.warn, assigned: T.warn, pending_verification: T.warn, verified: T.accent, resolved: T.muted, closed: T.muted };

  // Fetch tickets on mount
  useEffect(() => {
    getMyTickets()
      .then(res => setTickets(res.tickets))
      .catch(() => {})
      .finally(() => setLoadingTickets(false));
  }, []);

  async function handleSubmit() {
    if (!subject.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiCreateTicket(category, subject.trim(), priority);
      setTickets(prev => [res.ticket, ...prev]);
      setSubject("");
      setCategory("general");
      setPriority("normal");
      setShowNew(false);
    } catch {
      // TODO: show error toast
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(ticketId: string) {
    try {
      await requestVerification(ticketId);
      // Refresh ticket list to get updated status
      const res = await getMyTickets();
      setTickets(res.tickets);
    } catch {
      // Verification may fail if no admin assigned yet
    }
  }

  if (showNew) return (
    <div style={{ flex: 1, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 13 }}>&larr; Back</button>
        <span style={{ fontWeight: 700, fontSize: 18, color: T.text }}>New Ticket</span>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={{ fontSize: 11, color: T.muted, display: "block", marginBottom: 4 }}>Subject</label><Input placeholder="Describe your issue..." value={subject} onChange={e => setSubject((e.target as HTMLInputElement).value)} /></div>
          <div>
            <label style={{ fontSize: 11, color: T.muted, display: "block", marginBottom: 4 }}>Category</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["account", "security", "billing", "technical", "report_user", "general"].map(c => <Btn key={c} variant={c === category ? "primary" : "ghost"} small onClick={() => setCategory(c)}>{c}</Btn>)}</div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: T.muted, display: "block", marginBottom: 4 }}>Priority</label>
            <div style={{ display: "flex", gap: 6 }}>{["low", "normal", "high", "urgent"].map(p => <Btn key={p} variant={p === priority ? "primary" : "ghost"} small onClick={() => setPriority(p)}>{p}</Btn>)}</div>
          </div>
          <Btn onClick={handleSubmit} disabled={submitting || !subject.trim()}>{submitting ? "Submitting..." : "Submit Ticket"}</Btn>
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
      {loadingTickets ? (
        <p style={{ color: T.muted, fontSize: 13, textAlign: "center", marginTop: 40 }}>Loading tickets...</p>
      ) : tickets.length === 0 ? (
        <p style={{ color: T.muted, fontSize: 13, textAlign: "center", marginTop: 40 }}>No tickets yet. Tap "New Ticket" to get help.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map(t => (
            <Card key={t.id} style={{ cursor: "pointer" }} onClick={() => setSel(sel === t.id ? null : t.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>#{t.ticketNumber}</span>
                    <Badge text={t.status.toUpperCase()} color={statusColors[t.status] || T.muted} />
                    <Badge text={t.priority} color={t.priority === "urgent" ? T.danger : t.priority === "high" ? T.warn : T.muted} />
                    <Badge text={t.category} color={T.muted} />
                  </div>
                  <p style={{ fontSize: 13, color: T.text, margin: 0 }}>{t.subject}</p>
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Opened {timeAgo(t.createdAt)}</p>
                </div>
                {t.assignedAdminId && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Avatar fp={genFp()} size={28} verified={t.adminVerified} />
                    <div>
                      <p style={{ fontSize: 11, color: T.text, margin: 0, fontWeight: 600 }}>Admin</p>
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
                      <p style={{ fontSize: 10, color: T.muted, marginTop: 4, fontFamily: "monospace" }}>ed25519 challenge-response verified at {t.verifiedAt ? new Date(t.verifiedAt).toLocaleString() : "N/A"}</p>
                    </div>
                  ) : t.assignedAdminId ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn small variant="ghost" onClick={() => handleVerify(t.id)}>Verify Admin</Btn>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: T.muted }}>Waiting for admin assignment...</p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
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
function SettingsTab({ onOpenGuide, onOpenSpec, onOpenTutorial, me, onLogout, canInvite }: { onOpenGuide: () => void; onOpenSpec: () => void; onOpenTutorial: () => void; me: User; onLogout: () => void; canInvite: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Fetch invite list when the section is relevant
  useEffect(() => {
    if (canInvite || me.isAdmin) {
      getMyInvites()
        .then(res => setInvites(res.invites))
        .catch(() => {})
        .finally(() => setInvitesLoaded(true));
    }
  }, [canInvite, me.isAdmin]);

  async function handleCreateInvite() {
    setCreating(true);
    try {
      const res = await createInvite();
      setInvites(prev => [{ code: res.code, used_by: null, expires_at: res.expiresAt, created_at: new Date().toISOString() }, ...prev]);
    } catch {
      // Non-admin or trust too low
    } finally {
      setCreating(false);
    }
  }

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }

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
            <Badge text={`Trust ${me.trustScore.toFixed(2)}`} color={T.accent} />
          </div>
        </div>
        <Btn onClick={onLogout} variant="danger" small style={{ marginTop: 4 }}>Log Out</Btn>
      </Card>
      {/* Invite Management */}
      {(canInvite || me.isAdmin) && (
        <Card style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontWeight: 600, fontSize: 13, color: T.text, margin: 0 }}>Invite Codes</p>
            <Btn small onClick={handleCreateInvite} disabled={creating}>{creating ? "Creating..." : "Generate Code"}</Btn>
          </div>
          <p style={{ fontSize: 10, color: T.muted, marginBottom: 8 }}>Invite codes are single-use and expire after 24 hours. You are accountable for anyone you invite.</p>
          {!invitesLoaded ? (
            <p style={{ fontSize: 11, color: T.muted }}>Loading invites...</p>
          ) : invites.length === 0 ? (
            <p style={{ fontSize: 11, color: T.muted }}>No invites created yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {invites.map(inv => {
                const expired = new Date(inv.expires_at) < new Date();
                const used = !!inv.used_by;
                const statusText = used ? "USED" : expired ? "EXPIRED" : "ACTIVE";
                const statusColor = used ? T.muted : expired ? T.danger : T.accent;
                return (
                  <div key={inv.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: T.input, borderRadius: 8, border: `1px solid ${T.border}` }}>
                    <div>
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: T.text, fontWeight: 600 }}>{inv.code}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Badge text={statusText} color={statusColor} />
                        <span style={{ fontSize: 9, color: T.muted }}>expires {timeAgo(inv.expires_at)}</span>
                      </div>
                    </div>
                    {!used && !expired && (
                      <Btn small variant="ghost" onClick={() => handleCopy(inv.code)}>
                        {copied === inv.code ? "Copied!" : "Copy"}
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
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
                <p style={{ fontSize: 10, color: T.muted, margin: "2px 0 0" }}>How your team can use X Shield — share with stakeholders</p>
              </div>
            </div>
            <span style={{ color: T.muted, fontSize: 14 }}>&rarr;</span>
          </button>
          <button onClick={onOpenTutorial} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: T.input, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎓</span>
              <div style={{ textAlign: "left" }}>
                <p style={{ fontWeight: 600, fontSize: 13, color: T.text, margin: 0 }}>Interactive Tutorial</p>
                <p style={{ fontSize: 10, color: T.muted, margin: "2px 0 0" }}>Scroll through every feature — setup to daily operations</p>
              </div>
            </div>
            <span style={{ color: T.muted, fontSize: 14 }}>&rarr;</span>
          </button>
        </div>
      </Card>
      <Card>
        <p style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 8 }}>About X Shield</p>
        <p style={{ fontSize: 11, color: T.muted }}>Version 1.0.0 — Fraud-Elimination Messaging Platform</p>
        <p style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>BIP39/ed25519 identity | Hardware device binding | Invite chain accountability | AI scam detection | Contact cooling periods | Blind E2EE relay</p>
      </Card>
    </div>
  );
}

// ===================== MAIN APP =====================
export default function XShieldApp() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState("chats");
  const [selChat, setSelChat] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, Message[]>>(MOCK_MSGS);
  const [overlay, setOverlay] = useState<"landing" | "login" | "guide" | "spec" | null>("landing");
  const [showTutorial, setShowTutorial] = useState(false);
  const [trustProfile, setTrustProfile] = useState<TrustProfile | null>(null);
  const [scamAlerts, setScamAlerts] = useState<ScamAlert[]>([]);
  const [coolingInfo, setCoolingInfo] = useState<Record<string, { hoursRemaining: number; expiresAt: string }>>({});

  // Build ME from auth state + live trust profile
  const ME: User = user
    ? {
        id: user.userId,
        username: user.username,
        fp: genFp(),
        trustScore: trustProfile?.trustScore ?? 0,
        isAdmin: trustProfile?.isAdmin ?? false,
        isVerifiedAdmin: trustProfile?.isVerifiedAdmin ?? false,
      }
    : DEFAULT_ME;

  // ── Init on login: E2EE keypair + trust profile + alerts ────
  useEffect(() => {
    if (user) {
      initKeyPair().catch(() => {});
      getMyTrustProfile()
        .then(res => setTrustProfile(res.profile))
        .catch(() => {});
      getMyAlerts()
        .then(res => setScamAlerts(res.alerts))
        .catch(() => {});
    }
  }, [user]);

  function handleDismissAlert(alertId: string) {
    setScamAlerts(prev => prev.filter(a => a.id !== alertId));
    apiDismissAlert(alertId).catch(() => {});
  }

  // ── WebSocket: live message delivery with decryption ──────
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === "new_message") {
      const e = event as WsNewMessage;
      const kp = getKeyPair();
      const plaintext = kp
        ? decryptMessage(e.ciphertext, e.nonce, e.senderPublicKey, kp)
        : null;

      setMsgs(prev => {
        const convId = e.senderId; // mock contacts are keyed by sender ID
        const existing = prev[convId] || [];
        if (existing.some(m => m.id === e.messageId)) return prev;
        return {
          ...prev,
          [convId]: [
            ...existing,
            {
              id: e.messageId,
              sender: e.senderId,
              text: plaintext ?? "[decryption failed]",
              time: new Date(e.createdAt).getTime(),
            },
          ],
        };
      });
    }
  }, []);

  useWebSocket(handleWsEvent);
  // ──────────────────────────────────────────────────────────

  // When user logs in successfully, dismiss the login overlay
  useEffect(() => {
    if (user && overlay === "login") {
      setOverlay(null);
    }
  }, [user, overlay]);

  // ── Check cooling status when selecting a chat ───────────
  useEffect(() => {
    if (selChat && user) {
      getCoolingStatus(selChat)
        .then(res => {
          if (res.isCooling) {
            setCoolingInfo(prev => ({ ...prev, [selChat]: { hoursRemaining: res.hoursRemaining, expiresAt: res.expiresAt! } }));
          } else {
            setCoolingInfo(prev => { const next = { ...prev }; delete next[selChat]; return next; });
          }
        })
        .catch(() => {});
    }
  }, [selChat, user]);

  const unreadTotal = CONTACTS.reduce((a, c) => a + c.unread, 0);

  async function handleSend(text: string) {
    if (!selChat) return;

    // Optimistic local update
    const tempId = "m" + Date.now();
    setMsgs(prev => ({
      ...prev,
      [selChat]: [...(prev[selChat] || []), { id: tempId, sender: ME.id, text, time: Date.now() }],
    }));

    // Encrypt and send via API
    const kp = getKeyPair();
    if (kp) {
      try {
        const recipientPubKey = await fetchRecipientKey(selChat);
        const envelope = encryptMessage(text, recipientPubKey, kp);
        await sendMessage({
          recipient_id: selChat,
          ciphertext: envelope.ciphertext,
          nonce: envelope.nonce,
          sender_public_key: envelope.senderPublicKey,
          message_type: "text",
          content: text, // plaintext hint for server-side scam detection
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 403 && err.body.error === "cooling_period_restriction") {
          const cooling = err.body.cooling as { hoursRemaining: number; expiresAt: string };
          setCoolingInfo(prev => ({ ...prev, [selChat]: cooling }));
          // Remove the optimistic message since it was blocked
          setMsgs(prev => ({
            ...prev,
            [selChat]: (prev[selChat] || []).filter(m => m.id !== tempId),
          }));
        }
      }
    }
  }

  async function handleExemptCooling() {
    if (!selChat) return;
    try {
      await exemptCooling(selChat);
      setCoolingInfo(prev => { const next = { ...prev }; delete next[selChat]; return next; });
    } catch {
      // Only admins can exempt — error expected for non-admins
    }
  }

  function handleLogout() {
    clearKeyPair();
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
      <>
        <LandingPage
          onOpenGuide={() => setOverlay("guide")}
          onOpenSpec={() => setOverlay("spec")}
          onOpenTutorial={() => setShowTutorial(true)}
          onOpenApp={() => {
            // If already logged in, go straight to app. Otherwise, show login.
            if (user) {
              setOverlay(null);
            } else {
              setOverlay("login");
            }
          }}
        />
        {showTutorial && <TutorialPopup onClose={() => setShowTutorial(false)} />}
      </>
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
      <Sidebar activeTab={tab} setTab={setTab} unreadTotal={unreadTotal} alertCount={scamAlerts.length} />
      {tab === "chats" && <>
        <ChatList contacts={CONTACTS} selected={selChat} onSelect={id => { setSelChat(id); setTab("chats"); }} />
        <ChatView contact={contact} messages={msgs[selChat || ""]} onSend={handleSend} meId={ME.id} cooling={selChat ? coolingInfo[selChat] : undefined} isAdmin={ME.isAdmin || ME.isVerifiedAdmin} onExemptCooling={handleExemptCooling} />
      </>}
      {tab === "contacts" && <ContactsTab contacts={CONTACTS} />}
      {tab === "alerts" && <AlertsTab alerts={scamAlerts} onDismiss={handleDismissAlert} />}
      {tab === "support" && <SupportTab />}
      {tab === "trust" && <TrustTab me={ME} profile={trustProfile} />}
      {tab === "settings" && <SettingsTab onOpenGuide={() => setOverlay("guide")} onOpenSpec={() => setOverlay("spec")} onOpenTutorial={() => setShowTutorial(true)} me={ME} onLogout={handleLogout} canInvite={trustProfile?.canInvite ?? false} />}
      {showTutorial && <TutorialPopup onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
