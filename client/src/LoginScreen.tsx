/**
 * LoginScreen — Telegram-based authentication UI.
 *
 * Two entry paths:
 *   1. Telegram Login Widget (production) — auto-populates telegram user data
 *   2. Manual Telegram ID entry (dev/demo) — for local testing without a live bot
 *
 * The user must have joined the bchat Telegram channel first (via bot invite link).
 * The server verifies this via the telegram_join_events table.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import type { TelegramUser } from './api/auth';

// ── Theme (matches App.tsx) ─────────────────────────────────
const T = {
  bg: '#0a0a14', card: '#12122a', border: '#1e1e3a', text: '#e0e0ee',
  muted: '#6b6b8a', accent: '#00d26a', danger: '#ff4757', warn: '#ffa502',
  input: '#0e0e1e',
};

// ── Telegram Login Widget callback type ─────────────────────
interface TelegramLoginData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Extend window for Telegram callback
declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginData) => void;
  }
}

// ── Component ───────────────────────────────────────────────

export default function LoginScreen({ onBack }: { onBack?: () => void }) {
  const { login, loading, error, clearError } = useAuth();
  const [mode, setMode] = useState<'choose' | 'telegram' | 'manual'>('choose');
  const [inviteCode, setInviteCode] = useState('');

  // Manual mode fields
  const [manualId, setManualId] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [manualFirstName, setManualFirstName] = useState('');

  const telegramWidgetRef = useRef<HTMLDivElement>(null);
  const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME;

  // Parse invite code from URL query params (?invite=CODE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) setInviteCode(code);
  }, []);

  // Handle Telegram Login Widget callback
  const handleTelegramLogin = useCallback(
    (data: TelegramLoginData) => {
      const telegramUser: TelegramUser = {
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        username: data.username,
        photo_url: data.photo_url,
        auth_date: data.auth_date,
        hash: data.hash,
      };
      login(telegramUser, inviteCode || undefined);
    },
    [login, inviteCode],
  );

  // Mount Telegram Login Widget
  useEffect(() => {
    if (mode !== 'telegram' || !botName || !telegramWidgetRef.current) return;

    // Set callback
    window.onTelegramAuth = handleTelegramLogin;

    // Insert Telegram widget script
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    telegramWidgetRef.current.innerHTML = '';
    telegramWidgetRef.current.appendChild(script);

    return () => {
      window.onTelegramAuth = undefined;
    };
  }, [mode, botName, handleTelegramLogin]);

  // Handle manual login submit
  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseInt(manualId, 10);
    if (!id || !manualFirstName.trim()) return;

    const telegramUser: TelegramUser = {
      id,
      username: manualUsername.trim() || undefined,
      first_name: manualFirstName.trim(),
    };
    login(telegramUser, inviteCode || undefined);
  }

  return (
    <div style={{
      minHeight: '100vh', background: T.bg, color: T.text,
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: '50%',
            background: T.accent + '15', border: `2px solid ${T.accent}33`, marginBottom: 16,
          }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px' }}>
            b<span style={{ color: T.accent }}>chat</span>
          </h1>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
            Connect your Telegram account to get started
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 10,
            background: T.danger + '15', border: `1px solid ${T.danger}33`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: T.danger }}>{error}</span>
            <button
              onClick={clearError}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.danger, fontSize: 16 }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Invite code field (always visible) */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: 16, marginBottom: 16,
        }}>
          <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 6 }}>
            Invite Code (optional)
          </label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Enter your invite code..."
            style={{
              width: '100%', padding: '8px 12px', background: T.input,
              border: `1px solid ${T.border}`, borderRadius: 8, color: T.text,
              fontSize: 13, outline: 'none', fontFamily: 'monospace',
            }}
          />
        </div>

        {/* ── Choose mode ─── */}
        {mode === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Telegram Widget button */}
            {botName && (
              <button
                onClick={() => setMode('telegram')}
                style={{
                  padding: '14px 20px', background: '#2AABEE', color: '#fff',
                  border: 'none', borderRadius: 10, cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                Login with Telegram
              </button>
            )}

            {/* Manual / dev mode */}
            <button
              onClick={() => setMode('manual')}
              style={{
                padding: '14px 20px',
                background: botName ? 'rgba(255,255,255,0.06)' : T.accent,
                color: botName ? T.text : '#000',
                border: `1px solid ${botName ? T.border : T.accent}`,
                borderRadius: 10, cursor: 'pointer',
                fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
              }}
            >
              {botName ? 'Enter Telegram ID manually' : 'Connect with Telegram ID'}
            </button>

            {!botName && (
              <p style={{ fontSize: 10, color: T.muted, textAlign: 'center', marginTop: 4 }}>
                Set VITE_TELEGRAM_BOT_NAME to enable the Telegram Login Widget
              </p>
            )}
          </div>
        )}

        {/* ── Telegram widget mode ─── */}
        {mode === 'telegram' && (
          <div style={{ textAlign: 'center' }}>
            <div ref={telegramWidgetRef} style={{ display: 'inline-block', marginBottom: 16 }} />
            {loading && (
              <p style={{ fontSize: 12, color: T.accent }}>Authenticating...</p>
            )}
            <button
              onClick={() => setMode('choose')}
              style={{
                display: 'block', margin: '12px auto 0', background: 'none',
                border: 'none', cursor: 'pointer', color: T.muted, fontSize: 12,
              }}
            >
              &larr; Back
            </button>
          </div>
        )}

        {/* ── Manual entry mode ─── */}
        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 20,
          }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: T.text, marginBottom: 16 }}>
              Enter your Telegram details
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 4 }}>
                Telegram User ID *
              </label>
              <input
                type="number"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="e.g. 123456789"
                required
                style={{
                  width: '100%', padding: '8px 12px', background: T.input,
                  border: `1px solid ${T.border}`, borderRadius: 8, color: T.text,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                Send /start to @userinfobot on Telegram to find your ID
              </p>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 4 }}>
                First Name *
              </label>
              <input
                type="text"
                value={manualFirstName}
                onChange={(e) => setManualFirstName(e.target.value)}
                placeholder="Your Telegram first name"
                required
                style={{
                  width: '100%', padding: '8px 12px', background: T.input,
                  border: `1px solid ${T.border}`, borderRadius: 8, color: T.text,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 4 }}>
                Username (optional)
              </label>
              <input
                type="text"
                value={manualUsername}
                onChange={(e) => setManualUsername(e.target.value)}
                placeholder="@your_username"
                style={{
                  width: '100%', padding: '8px 12px', background: T.input,
                  border: `1px solid ${T.border}`, borderRadius: 8, color: T.text,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !manualId || !manualFirstName.trim()}
              style={{
                width: '100%', padding: '12px 20px', background: loading ? '#333' : T.accent,
                color: loading ? '#666' : '#000', border: 'none', borderRadius: 10,
                cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700,
                fontSize: 14, fontFamily: 'inherit',
              }}
            >
              {loading ? 'Connecting...' : 'Connect Account'}
            </button>

            <button
              type="button"
              onClick={() => setMode('choose')}
              style={{
                display: 'block', margin: '12px auto 0', background: 'none',
                border: 'none', cursor: 'pointer', color: T.muted, fontSize: 12,
              }}
            >
              &larr; Back
            </button>
          </form>
        )}

        {/* Prerequisites note */}
        <div style={{
          marginTop: 24, padding: '14px 16px', borderRadius: 10,
          background: T.warn + '08', border: `1px solid ${T.warn}22`,
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: T.warn, marginBottom: 6 }}>
            Before you can log in:
          </p>
          <ol style={{ fontSize: 11, color: T.muted, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            <li>Get an invite link from an existing bchat member</li>
            <li>Open the link in Telegram to join the channel</li>
            <li>Come back here and connect your Telegram account</li>
          </ol>
        </div>

        {/* Back to landing */}
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: 'block', margin: '20px auto 0', background: 'none',
              border: 'none', cursor: 'pointer', color: T.muted, fontSize: 12,
            }}
          >
            &larr; Back to landing page
          </button>
        )}
      </div>
    </div>
  );
}
