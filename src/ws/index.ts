/**
 * WebSocket Server for Real-time E2EE Messaging
 *
 * Handles:
 *   - Connection auth (JWT verification)
 *   - Real-time message relay (encrypted blobs only)
 *   - Presence/typing indicators
 *   - Key exchange signaling
 *
 * The server NEVER sees plaintext messages — it only relays encrypted payloads
 * between authenticated users.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken, TokenPayload } from '../auth/jwt';
import { verifyAdmin } from '../admin/verification';
import { generatePubkeyFingerprint } from '../admin/identity-guard';
import { query } from '../db';
import { URL } from 'url';

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  telegramId: number;
  deviceId: string;
  isAlive: boolean;
}

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

// Connected clients: userId -> set of sockets (multi-device)
const clients = new Map<string, Set<AuthenticatedSocket>>();

/**
 * Create and configure the WebSocket server.
 */
export function createWSServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const socket = ws as AuthenticatedSocket;

    // Authenticate via query param token
    const url = new URL(req.url || '', `http://localhost:${port}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Missing auth token');
      return;
    }

    let payload: TokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      socket.close(4001, 'Invalid auth token');
      return;
    }

    socket.userId = payload.userId;
    socket.telegramId = payload.telegramId;
    socket.deviceId = payload.deviceId;
    socket.isAlive = true;

    // Register client
    if (!clients.has(socket.userId)) {
      clients.set(socket.userId, new Set());
    }
    clients.get(socket.userId)!.add(socket);

    console.log(`[WS] Client connected: ${socket.userId} (device: ${socket.deviceId})`);

    // Handle messages
    socket.on('message', (data) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());
        handleMessage(socket, msg);
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
      }
    });

    // Heartbeat
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    // Cleanup on disconnect
    socket.on('close', () => {
      const userSockets = clients.get(socket.userId);
      if (userSockets) {
        userSockets.delete(socket);
        if (userSockets.size === 0) {
          clients.delete(socket.userId);
        }
      }
      console.log(`[WS] Client disconnected: ${socket.userId}`);
    });

    // Send connection confirmation
    socket.send(JSON.stringify({
      type: 'connected',
      payload: { userId: socket.userId },
    }));
  });

  // Heartbeat interval — drop dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (!socket.isAlive) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log(`[WS] WebSocket server running on port ${port}`);
  return wss;
}

/**
 * Handle incoming WebSocket messages.
 */
function handleMessage(socket: AuthenticatedSocket, msg: WSMessage) {
  switch (msg.type) {
    case 'message': {
      // Relay encrypted message to recipient(s) with sender's identity badge
      const { conversationId, recipientIds, ciphertext, nonce, contentType } = msg.payload as any;

      if (!recipientIds || !Array.isArray(recipientIds)) return;

      // Attach sender's verified identity to every message automatically.
      // Recipients don't have to manually verify — the badge is computed
      // server-side from the crypto chain and included with the message.
      getSenderBadge(socket.userId).then(badge => {
        const outgoing = JSON.stringify({
          type: 'message',
          payload: {
            conversationId,
            senderId: socket.userId,
            ciphertext,
            nonce,
            contentType: contentType || 'text',
            timestamp: Date.now(),
            // Identity info attached to every message — unforgeable
            senderBadge: badge,
          },
        });

        for (const recipientId of recipientIds) {
          sendToUser(recipientId as string, outgoing);
        }
      });
      break;
    }

    case 'typing': {
      // Relay typing indicator
      const { conversationId, recipientIds } = msg.payload as any;
      if (!recipientIds || !Array.isArray(recipientIds)) return;

      const outgoing = JSON.stringify({
        type: 'typing',
        payload: {
          conversationId,
          userId: socket.userId,
        },
      });

      for (const recipientId of recipientIds) {
        sendToUser(recipientId as string, outgoing);
      }
      break;
    }

    case 'key_exchange': {
      // Relay key exchange messages (sealed boxes) for establishing E2EE sessions
      const { recipientId, sealedKey } = msg.payload as any;
      if (!recipientId) return;

      sendToUser(recipientId, JSON.stringify({
        type: 'key_exchange',
        payload: {
          senderId: socket.userId,
          sealedKey,
        },
      }));
      break;
    }

    default:
      socket.send(JSON.stringify({
        type: 'error',
        payload: { message: `Unknown message type: ${msg.type}` },
      }));
  }
}

/**
 * Send a message to all connected devices of a user.
 */
function sendToUser(userId: string, message: string) {
  const sockets = clients.get(userId);
  if (!sockets) return;

  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
}

/**
 * Get the sender's verified badge info — attached to every message.
 * This is what prevents profile cloning from working:
 *   - Badge is computed from the admin chain (not a profile setting)
 *   - Fingerprint is derived from the sender's unique pubkey
 *   - A scammer who copies a name/photo will have no badge and a different fingerprint
 */
async function getSenderBadge(userId: string): Promise<{
  role: string | null;
  chainVerified: boolean;
  fingerprint: string | null;
}> {
  try {
    const verification = await verifyAdmin(userId);
    const user = await query(
      'SELECT identity_pubkey FROM users WHERE id = $1',
      [userId]
    );

    return {
      role: verification.isAdmin ? verification.role : null,
      chainVerified: verification.isAdmin,
      fingerprint: user.rows[0]
        ? generatePubkeyFingerprint(user.rows[0].identity_pubkey)
        : null,
    };
  } catch {
    return { role: null, chainVerified: false, fingerprint: null };
  }
}

/**
 * Check if a user is currently online.
 */
export function isUserOnline(userId: string): boolean {
  return clients.has(userId) && clients.get(userId)!.size > 0;
}
