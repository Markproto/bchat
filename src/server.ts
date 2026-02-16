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

const PORT = parseInt(process.env.PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);

async function main() {
  // ── 0. Auto-migrate database ──────────────────────────────────────
  console.log('[Init] Running database migrations...');
  await runMigrations();

  // ── 1. Initialize BIP39 Master Key ──────────────────────────────────
  let mnemonic = process.env.MASTER_MNEMONIC;
  if (!mnemonic) {
    mnemonic = generateMnemonic();
    console.log('[Init] Generated new master mnemonic (save this securely!):');
    console.log(`  ${mnemonic}`);
    console.log('[Init] Set MASTER_MNEMONIC in .env to persist across restarts');
  }

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

  // Rate limiting
  const rateLimiter = new RateLimiterMemory({
    points: 60,      // requests
    duration: 60,     // per minute
  });

  app.use(async (req, res, next) => {
    try {
      await rateLimiter.consume(req.ip || 'unknown');
      next();
    } catch {
      res.status(429).json({ error: 'Too many requests' });
    }
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/identity', identityRoutes);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  app.listen(PORT, () => {
    console.log(`[Server] API running on http://localhost:${PORT}`);
  });

  // ── 3. Telegram Bot ─────────────────────────────────────────────────
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const bot = createBot(botToken);
    bot.launch();
    console.log('[Bot] Telegram bot started');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.log('[Bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
  }

  // ── 4. WebSocket Server ─────────────────────────────────────────────
  createWSServer(WS_PORT);

  console.log('[Init] bchat server fully initialized');
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
