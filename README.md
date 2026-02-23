# bchat

Secure messaging app with Telegram-based onboarding, BIP38/39 key management, and end-to-end encrypted messaging.

## Project Structure

```
bchat/
├── server/
│   ├── src/
│   │   ├── admin/          # Admin tools, identity guard, invite accountability
│   │   ├── auth/           # Telegram auth, JWT, TOTP, device management
│   │   ├── bot/            # Telegram bot integration
│   │   ├── crypto/         # E2EE, HD wallet, challenge-response
│   │   ├── db/             # PostgreSQL pool, schema, migrations
│   │   ├── middleware/     # Auth & rate-limit middleware
│   │   ├── routes/         # Express API routes
│   │   ├── utils/          # Logger and helpers
│   │   ├── ws/             # WebSocket real-time relay
│   │   └── server.ts       # Entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── client/                  # (Phase 9)
├── .gitignore
└── README.md
```

## Setup

### Prerequisites

- Node.js 22.x
- PostgreSQL 15+

### PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE USER bchat_user WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE bchat OWNER bchat_user;
GRANT ALL PRIVILEGES ON DATABASE bchat TO bchat_user;
\q
```

### Server

```bash
cd server

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Build and run
npm run build
npm run start

# Or for development:
npm run dev
```

### Environment Variables

See `server/.env.example` for all required configuration.

Key variables:
- `TELEGRAM_BOT_TOKEN` — From BotFather
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Random secret for token signing
- `MASTER_MNEMONIC` — BIP39 mnemonic (auto-generated if not set)
