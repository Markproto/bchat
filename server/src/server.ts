/**
 * bchat — Secure Messaging Server
 *
 * Entry point that wires together:
 *   - Express API (auth, messages, wallet verification)
 *   - Telegram Bot (invites, identity linking)
 *   - WebSocket server (real-time E2EE message relay)
 *   - BIP39/BIP32 master key initialization
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import walletRoutes, { setMasterXpub } from './routes/wallet';
import adminRoutes from './routes/admin';
import supportRoutes from './routes/support';
import identityRoutes from './routes/identity';
import { createBot } from './bot';
import { createWSServer } from './ws';
import { runMigrations } from './db/migrate';
import {
  generateMnemonic,
  masterNodeFromMnemonic,
  getExtendedPublicKey,
} from './crypto/hdwallet';

const PORT = parseInt(process.env.PORT || '8080', 10);

async function main() {
  // ── 0. Auto-migrate database ──────────────────────────────────────
  console.log('[Init] Running database migrations...');
  await runMigrations();

  // ── 1. Initialize BIP39 Master Key ──────────────────────────────────
  let mnemonic = process.env.MASTER_MNEMONIC;
  if (mnemonic) {
    // Strip accidental "KEY=value" prefix (common env var misconfiguration)
    mnemonic = mnemonic.replace(/^MASTER_MNEMONIC=/, '').trim();
  }
  if (!mnemonic) {
    mnemonic = generateMnemonic();
    console.log('[Init] Generated new master mnemonic (save this securely!):');
    console.log(`  ${mnemonic}`);
    console.log('[Init] Set MASTER_MNEMONIC in .env to persist across restarts');
  }
  console.log(`[Init] Mnemonic word count: ${mnemonic.split(' ').length}`);

  const masterNode = await masterNodeFromMnemonic(mnemonic);
  const xpub = getExtendedPublicKey(masterNode);
  setMasterXpub(xpub);
  console.log(`[Init] Master xpub: ${xpub.slice(0, 20)}...`);

  // ── 2. Express API Server ───────────────────────────────────────────
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  }));
  app.use(express.json({ limit: '1mb' }));

  // Global rate limiting (60 req/min per IP)
  const globalLimiter = new RateLimiterMemory({
    points: 60,
    duration: 60,
  });

  app.use(async (req, res, next) => {
    try {
      await globalLimiter.consume(req.ip || 'unknown');
      next();
    } catch {
      res.status(429).json({ error: 'Too many requests' });
    }
  });

  // Stricter per-endpoint rate limiters for sensitive operations
  const authLimiter = new RateLimiterMemory({ points: 10, duration: 900 }); // 10 per 15 min
  const totpLimiter = new RateLimiterMemory({ points: 5, duration: 900 });  // 5 per 15 min
  const adminLimiter = new RateLimiterMemory({ points: 20, duration: 60 }); // 20 per min

  function endpointRateLimit(limiter: RateLimiterMemory) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        await limiter.consume(req.ip || 'unknown');
        next();
      } catch {
        res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
      }
    };
  }

  // Routes with endpoint-specific rate limits
  app.use('/api/auth', endpointRateLimit(authLimiter), authRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/admin', endpointRateLimit(adminLimiter), adminRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/identity', identityRoutes);

  // Health check — root path required for DigitalOcean readiness probe
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  const server = app.listen(PORT, () => {
    console.log(`[Server] API running on http://localhost:${PORT}`);
  });

  // ── 3. Telegram Bot ─────────────────────────────────────────────────
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const bot = createBot(botToken);
    // Wrap launch in try-catch: with instance_count > 1, multiple instances
    // compete for Telegram long-polling and one will get conflicts.
    bot.launch({ dropPendingUpdates: true }).catch((err: Error) => {
      console.error('[Bot] Failed to start (may be running on another instance):', err.message);
    });
    console.log('[Bot] Telegram bot starting...');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.log('[Bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
  }

  // ── 4. WebSocket Server (attached to HTTP server — same port) ──────
  // DigitalOcean App Platform only exposes one port (8080).
  // Attaching WS to the Express server lets both share that port.
  createWSServer(server);

  console.log('[Init] bchat server fully initialized');
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
