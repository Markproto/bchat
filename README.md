# X Shield

Fraud-elimination messaging platform with Telegram-based onboarding, BIP38/39 key management, and end-to-end encrypted messaging.

## Project Structure

```
xshield/
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
CREATE USER xshield_user WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE xshield OWNER xshield_user;
GRANT ALL PRIVILEGES ON DATABASE xshield TO xshield_user;
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

## Encryption & Export Notice

This software contains cryptographic functions subject to U.S. Export Administration Regulations (EAR), 15 CFR 730-774, and may be controlled under ECCN 5D002.

### Cryptographic Algorithms Used

| Algorithm | Purpose | Key Size | Library |
|-----------|---------|----------|---------|
| Ed25519 | Digital signatures, identity, admin chain of trust | 256-bit | @noble/ed25519 |
| Curve25519-XSalsa20-Poly1305 (NaCl box) | End-to-end message encryption | 256-bit | tweetnacl |
| SHA-512 | Internal to Ed25519 signing | 512-bit | Node.js crypto |
| SHA-256 | Device fingerprinting, pubkey fingerprints | 256-bit | Node.js crypto |
| HMAC-SHA256 (HS256) | JWT token signing | 256-bit | jsonwebtoken |
| TLS 1.2 / TLS 1.3 | Transport encryption (HTTPS/WSS) | Varies | Nginx + Let's Encrypt |

### Export Classification

This software is publicly available open source and qualifies for the "publicly available" exclusion under EAR §742.15(b) and License Exception ENC (§740.17). A notification has been filed with the Bureau of Industry and Security (BIS) per §742.15(b)(2).

**This software may not be exported or re-exported to embargoed destinations** (Cuba, Iran, North Korea, Syria, Crimea region) or to persons/entities on the BIS Denied Persons List, Entity List, or Specially Designated Nationals List.

For questions about export compliance, contact the project maintainers.
