/**
 * WebSocket Relay — Real-time message delivery for bchat.
 *
 * Architecture:
 *   1. Client connects to ws://host/ws?token=JWT
 *   2. Server verifies JWT on upgrade, rejects invalid tokens
 *   3. Authenticated sockets are indexed by userId (supports multiple devices)
 *   4. When a message is sent via POST /api/messages/send, the route calls
 *      broadcastToUser() to push the encrypted envelope to all of the
 *      recipient's connected devices in real time
 *   5. Heartbeat (ping/pong) keeps connections alive and cleans up stale ones
 *
 * The server NEVER decrypts message content — it relays encrypted envelopes.
 */

import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken, TokenPayload } from '../crypto/identity';
import { logger } from '../utils/logger';

// ── Types ───────────────────────────────────────────────────

export interface WsClient {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  connectedAt: number;
  isAlive: boolean;
}

/** Events the server can push to clients. */
export interface WsEvent {
  type: string;
  [key: string]: unknown;
}

// ── Connection registry ─────────────────────────────────────

/**
 * Map of userId → Set of connected clients.
 * One user can have multiple devices connected simultaneously.
 */
const clients = new Map<string, Set<WsClient>>();

function addClient(client: WsClient) {
  let set = clients.get(client.userId);
  if (!set) {
    set = new Set();
    clients.set(client.userId, set);
  }
  set.add(client);
}

function removeClient(client: WsClient) {
  const set = clients.get(client.userId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) {
    clients.delete(client.userId);
  }
}

/** Get count of all connected sockets (for health/stats). */
export function getConnectionCount(): number {
  let count = 0;
  for (const set of clients.values()) {
    count += set.size;
  }
  return count;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Send an event to all of a user's connected devices.
 * Returns the number of sockets that received the message.
 */
export function broadcastToUser(userId: string, event: WsEvent): number {
  const set = clients.get(userId);
  if (!set || set.size === 0) return 0;

  const payload = JSON.stringify(event);
  let sent = 0;

  for (const client of set) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      sent++;
    }
  }

  return sent;
}

/**
 * Send an event to a specific user on a specific device.
 */
export function sendToDevice(userId: string, deviceId: string, event: WsEvent): boolean {
  const set = clients.get(userId);
  if (!set) return false;

  for (const client of set) {
    if (client.deviceId === deviceId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(event));
      return true;
    }
  }
  return false;
}

// ── Setup ───────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Call this once from server.ts after app.listen().
 */
export function createWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
  });

  // Handle HTTP upgrade requests
  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    // Only accept upgrades to /ws
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Extract JWT from query string
    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let payload: TokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Upgrade to WebSocket
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, payload);
    });
  });

  // Handle new authenticated connections
  wss.on('connection', (ws: WebSocket, _request: IncomingMessage, payload: TokenPayload) => {
    const client: WsClient = {
      ws,
      userId: payload.userId,
      deviceId: payload.deviceId,
      connectedAt: Date.now(),
      isAlive: true,
    };

    addClient(client);
    logger.info('WS', `Client connected: ${payload.userId} (device: ${payload.deviceId})`);

    // Send a welcome event so the client knows connection is established
    ws.send(JSON.stringify({
      type: 'connected',
      userId: payload.userId,
      deviceId: payload.deviceId,
      timestamp: Date.now(),
    }));

    // Pong handler for heartbeat
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Handle incoming messages from client
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(client, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      removeClient(client);
      logger.info('WS', `Client disconnected: ${payload.userId} (device: ${payload.deviceId})`);
    });

    ws.on('error', (err) => {
      logger.error('WS', `Socket error for ${payload.userId}: ${err.message}`);
      removeClient(client);
    });
  });

  // Heartbeat: ping all clients, close unresponsive ones
  const heartbeat = setInterval(() => {
    for (const set of clients.values()) {
      for (const client of set) {
        if (!client.isAlive) {
          logger.debug('WS', `Terminating stale connection: ${client.userId}`);
          client.ws.terminate();
          removeClient(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  logger.info('WS', `WebSocket server attached (heartbeat: ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
  return wss;
}

// ── Client message handlers ─────────────────────────────────

/**
 * Handle messages sent from the client over WebSocket.
 * Currently supports:
 *   - { type: "ping" } → responds with { type: "pong" }
 *   - { type: "typing", conversationId } → relays typing indicator
 */
function handleClientMessage(client: WsClient, msg: { type: string; [k: string]: unknown }) {
  switch (msg.type) {
    case 'ping':
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
      break;

    case 'typing': {
      // Relay typing indicator to the other user in the conversation
      const recipientId = msg.recipientId as string | undefined;
      if (recipientId) {
        broadcastToUser(recipientId, {
          type: 'typing',
          userId: client.userId,
          conversationId: msg.conversationId as string,
          timestamp: Date.now(),
        });
      }
      break;
    }

    default:
      // Unknown message type — ignore silently
      break;
  }
}
