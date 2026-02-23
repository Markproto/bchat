/**
 * bchat — Secure Messaging Server
 *
 * Entry point that wires together:
 *   - Express API (auth, invites, admin)
 *   - Telegram Bot (invites, identity linking)
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth';
import inviteRoutes from './routes/invites';
import adminRoutes from './routes/admin';
import trustRoutes from './routes/trust';
import { createBot } from './bot';
import { rateLimit } from './middleware/rateLimit';

const PORT = parseInt(process.env.PORT || '8080', 10);

async function main() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  }));
  app.use(express.json({ limit: '1mb' }));

  // Global rate limiting (60 req/min per IP)
  app.use(rateLimit({ points: 60, duration: 60 }));

  // Routes with endpoint-specific rate limits
  app.use('/api/auth', rateLimit({ points: 10, duration: 900 }), authRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/admin', rateLimit({ points: 20, duration: 60 }), adminRoutes);
  app.use('/api/trust', rateLimit({ points: 30, duration: 60 }), trustRoutes);

  // Health check
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  const server = app.listen(PORT, () => {
    console.log(`[Server] API running on http://localhost:${PORT}`);
  });

  // Telegram Bot
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const bot = createBot(botToken);
    bot.launch({ dropPendingUpdates: true }).catch((err: Error) => {
      console.error('[Bot] Failed to start:', err.message);
    });
    console.log('[Bot] Telegram bot starting...');

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.log('[Bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
  }

  console.log('[Init] bchat server fully initialized');
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
