/**
 * useWebSocket — React hook for real-time WebSocket communication.
 *
 * Connects to the server's /ws endpoint with the current JWT token.
 * Automatically reconnects with exponential back-off on disconnect.
 * Emits typed events that components can subscribe to.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getAuthToken } from '../api/client';

// ── Event types coming from the server ───────────────────────

export interface WsNewMessage {
  type: 'new_message';
  messageId: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  senderPublicKey: string;
  contentType: string;
  sequenceNum: number;
  createdAt: string;
}

export interface WsMessageSent {
  type: 'message_sent';
  messageId: string;
  conversationId: string;
  recipientId: string;
  sequenceNum: number;
  createdAt: string;
}

export interface WsTyping {
  type: 'typing';
  userId: string;
  conversationId: string;
}

export type WsEvent = WsNewMessage | WsMessageSent | WsTyping;

export type WsEventHandler = (event: WsEvent) => void;

// ── Hook ─────────────────────────────────────────────────────

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export function useWebSocket(onEvent: WsEventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryMs = useRef(INITIAL_RETRY_MS);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const onEventRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  // Keep callback ref fresh without re-triggering effect
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!token) return;

    // Build ws:// or wss:// URL based on current page protocol
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryMs.current = INITIAL_RETRY_MS;
      setConnected(true);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WsEvent;
        onEventRef.current(data);
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect with exponential back-off
      retryTimer.current = setTimeout(() => {
        retryMs.current = Math.min(retryMs.current * 2, MAX_RETRY_MS);
        connect();
      }, retryMs.current);
    };

    ws.onerror = () => {
      // onclose will fire after onerror — reconnect handled there
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      clearTimeout(retryTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  /** Send a JSON payload to the server (e.g. typing indicators). */
  const send = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { connected, send };
}
