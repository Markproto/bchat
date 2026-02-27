# Shield X — Developer Handoff Sheet

> **Formerly:** bchat
> **Date:** February 27, 2026
> **Repo:** `Markproto/bchat` (rename pending)

---

## 1. What Is Shield X?

Shield X is a fraud-elimination messaging platform built for cryptocurrency and Web3 communities. It prevents the most common scams — fake admin impersonation, seed phrase theft, phishing, and social engineering — through layered technical controls rather than relying on user vigilance.

**Core subsystems:**
- Telegram-gated onboarding with impersonation detection
- Ed25519 cryptographic identity + device fingerprinting
- Invite chain accountability with cascade penalties
- Multi-factor trust scoring engine (0.0–1.0)
- Regex-based scam detection with 4 severity levels
- NaCl box end-to-end encryption (server is a blind relay)
- 72-hour contact cooling periods blocking wallet/link/seed content
- Trusted room auto-access with safety mechanisms
- Cryptographic admin verification chain
- Community flagging with auto-restriction
- In-app support tickets with challenge-response admin verification

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js | >= 20 (Docker uses 22-alpine) |
| **Language** | TypeScript | 5.3 |
| **API Framework** | Express | 4.18 |
| **Database** | PostgreSQL | 15 (Alpine) |
| **Cache/Rate Limit** | Redis (ioredis) | 5.3 |
| **Real-time** | ws (WebSocket) | 8.19 |
| **Telegram Bot** | Telegraf | 4.15 |
| **Cryptography** | @noble/ed25519, @noble/hashes, tweetnacl, bip39 | See package.json |
| **Auth** | JWT (jsonwebtoken) | 9.0 |
| **Frontend** | React 18 + Vite | — |
| **Reverse Proxy** | Nginx | Alpine |
| **SSL** | Let's Encrypt (certbot) | Auto-renewing |
| **Containerization** | Docker + Docker Compose | — |
| **Logging** | Winston | 3.11 |
| **Testing** | Jest + ts-jest | 29.7 |

---

## 3. Repository Structure

```
/
├── server/                          # Node.js backend
│   ├── src/
│   │   ├── server.ts                # Main entry point (Express + WS + bot bootstrap)
│   │   ├── app.ts                   # Thin wrapper that imports server.ts
│   │   ├── routes/                  # 8 API route files
│   │   │   ├── auth.ts              # /api/auth — Telegram auth, JWT, TOTP 2FA, devices
│   │   │   ├── invites.ts           # /api/invites — Invite chain accountability
│   │   │   ├── messages.ts          # /api/messages — E2EE messaging (largest route)
│   │   │   ├── admin.ts             # /api/admin — Admin governance, identity verification
│   │   │   ├── trust.ts             # /api/trust — Trust scoring, bans, device binding
│   │   │   ├── scam.ts              # /api/scam — Pattern detection & alerts
│   │   │   ├── support.ts           # /api/support — Ticket system
│   │   │   └── trustedRooms.ts      # /api/trusted-rooms — Verified room management
│   │   ├── middleware/
│   │   │   ├── authenticate.ts      # JWT verification + session validation
│   │   │   ├── coolingPeriod.ts     # 72-hour contact cooling enforcement
│   │   │   └── rateLimit.ts         # Redis/memory rate limiting
│   │   ├── db/
│   │   │   ├── pool.ts              # PostgreSQL connection pool
│   │   │   ├── migrate.ts           # Migration runner (idempotent)
│   │   │   ├── schema.sql           # Base tables (users, admin_chain, conversations, etc.)
│   │   │   ├── 005_trust_engine.sql # Trust scoring + device bans
│   │   │   ├── 006_cooling_period.sql
│   │   │   ├── 007_scam_detection.sql
│   │   │   ├── 008_e2ee_messaging.sql
│   │   │   ├── 009_safe_support.sql
│   │   │   └── 010_trusted_rooms.sql
│   │   ├── admin/                   # Admin governance tools
│   │   ├── auth.ts                  # Auth logic
│   │   ├── bot/                     # Telegram bot (index.ts)
│   │   ├── crypto/                  # E2EE, HD wallet, challenge-response
│   │   ├── scam/                    # Scam detection engine
│   │   ├── support/                 # Ticket system logic
│   │   ├── trust/                   # Trust score calculations
│   │   ├── trustedRooms/            # Trusted room management
│   │   ├── utils/                   # Winston logger, helpers
│   │   └── ws/                      # WebSocket blind relay
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile                   # Multi-stage build (builder → production)
│   ├── docker-entrypoint.sh         # Runs migrations then starts server
│   └── .env.example
├── client/                          # React + Vite frontend
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
├── deploy/
│   ├── Dockerfile.nginx             # Multi-stage: builds client, serves via nginx
│   ├── nginx/default.conf           # HTTPS, reverse proxy, WebSocket, SPA
│   ├── init-letsencrypt.sh          # First-time SSL provisioning
│   └── setup-droplet.sh             # Fresh Ubuntu server bootstrap
├── docker-compose.yml               # Production orchestration (4 services)
├── .env.production.example          # Template for production secrets
├── PATENT.md                        # Full patent specification
├── TUTORIAL.md                      # Extended guides
└── README.md
```

---

## 4. Architecture Overview

```
                          ┌─────────────┐
                          │   Certbot   │  (auto-renews SSL every 12h)
                          └──────┬──────┘
                                 │
  Client ──── HTTPS/WSS ──── Nginx (80/443) ──── Express API (8080)
                               │                       │
                          Serves SPA              PostgreSQL 15
                          (Vite build)                 │
                                                  ┌────┴────┐
                                               pgdata    Redis
                                              (volume)   (rate limits)
```

**Single-process server** handles:
- Express API (8 route groups)
- WebSocket relay (`upgrade` event, `noServer` mode — same port)
- Telegraf Telegram bot (optional, disabled if no token)

---

## 5. Services (docker-compose.yml)

| Service | Image/Build | Ports | Purpose |
|---------|------------|-------|---------|
| **db** | `postgres:15-alpine` | 5432 (internal) | Primary database with health checks |
| **server** | `./server` (Dockerfile) | 8080 (internal) | API + WebSocket + Bot |
| **nginx** | `./deploy/Dockerfile.nginx` | 80, 443 | HTTPS termination, SPA, reverse proxy |
| **certbot** | `certbot/certbot` | — | SSL auto-renewal |

---

## 6. Environment Variables

Copy `.env.production.example` to `.env` and fill in values:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PASSWORD` | Yes | — | PostgreSQL password |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiry duration |
| `TELEGRAM_BOT_TOKEN` | No | — | Bot disabled if empty |
| `TELEGRAM_CHANNEL_ID` | No | — | Telegram channel for join detection |
| `CORS_ORIGIN` | No | — | Allowed origin (e.g. `https://shieldx.app`) |
| `DOMAIN` | Deploy only | — | Used by SSL scripts |
| `EMAIL` | Deploy only | — | Let's Encrypt registration |

---

## 7. Database Schema

Migrations run automatically on container start via `docker-entrypoint.sh`. All use `CREATE TABLE IF NOT EXISTS` (idempotent).

**Execution order:** `schema.sql` → `005` → `006` → `007` → `008` → `009` → `010`

### Key Tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| `users` | schema.sql | Core identity: UUID, telegram_id, ed25519 pubkey, encryption pubkey, trust_score, device fingerprint |
| `admin_chain` | schema.sql | Cryptographic admin verification chain with signatures |
| `conversations` | schema.sql | Conversation metadata |
| `conversation_members` | schema.sql | Membership tracking |
| `support_tickets` | schema.sql | Ticket lifecycle (pending → assigned → open → resolved → closed) |
| `banned_devices` | 005 | Hardware-level device bans |
| `ban_events` | 005 | Audit log for bans |
| `scam_patterns` | 007 | Regex detection rules (13 built-in, admin-configurable) |
| `scam_alerts` | 007 | Per-recipient alerts (sender unaware) |
| `cooling_block_events` | 006 | Contact cooling period blocks |
| `telegram_join_events` | schema.sql | Telegram join detection for onboarding |

---

## 8. API Endpoints & Rate Limits

| Route Group | Rate Limit | Key Endpoints |
|-------------|-----------|---------------|
| `/api/auth` | 10 req/15min | `POST /telegram` (auth), device management, TOTP 2FA |
| `/api/invites` | 20 req/min | Create/validate single-use invite codes |
| `/api/messages` | 60 req/min | Send E2EE messages, key registration, contact management |
| `/api/admin` | 20 req/min | Initialize root admin, promote/revoke, chain verification |
| `/api/trust` | 30 req/min | Trust scores, bans, device binding |
| `/api/scam` | 20 req/min | Pattern CRUD, alert management, statistics |
| `/api/support` | 20 req/min | Ticket CRUD, E2EE ticket messaging, challenge-response |
| `/api/trusted-rooms` | 30 req/min | Room enable/disable, member management |
| **Global** | 60 req/min/IP | All endpoints |

**Health checks:** `GET /` and `GET /health`

---

## 9. Cryptography Summary

| Purpose | Algorithm | Library |
|---------|-----------|---------|
| Identity keypair | Ed25519 | `@noble/ed25519` |
| Admin chain signatures | Ed25519 | `@noble/ed25519` |
| Encryption keypair | X25519 (derived from ed25519 seed) | `tweetnacl` |
| Message encryption | NaCl box (X25519 DH + XSalsa20-Poly1305) | `tweetnacl` |
| Device fingerprint | SHA-256 | `@noble/hashes` |
| Visual identity | SHA-256 truncated (`AB12:CD34:EF56`) | `@noble/hashes` |
| Mnemonic generation | BIP39 | `bip39` |
| Password hashing | bcrypt | `bcryptjs` |

**Key distinction:** Ed25519 is for signing/identity. Curve25519 (derived from ed25519 seed bytes) is for encryption. These are separate keypairs.

---

## 10. Trust Score Formula

```
score = base + age_factor + activity_factor + invite_quality - flag_penalty

base            = 0.50 (invite) or 0.40 (trusted room)
age_factor      = min(0.20, days_since_join / 180 * 0.20)
activity_factor = min(0.20, messages_30d / 100 * 0.20)
invite_quality  = max(-0.20, (good - bad*3) / max(total,1) * 0.20)
flag_penalty    = min(0.30, flags * 0.05)
```

**Auto-revocation:** Invite codes revoked when score drops below 0.40.

**Cascade penalties** (when inviter is banned):
| Level | Penalty |
|-------|---------|
| L1 (direct) | -0.15 |
| L2 | -0.08 |
| L3 | -0.04 |

Trusted room users get 0.5x dampening on cascade penalties.

---

## 11. Local Development

```bash
# Prerequisites: Node.js >= 20, PostgreSQL 15, Redis (optional)

# Clone & install
git clone <repo-url> && cd bchat
cd server && npm install
cd ../client && npm install

# Configure
cd ../server
cp .env.example .env
# Edit .env with local DATABASE_URL, JWT_SECRET, etc.

# Run migrations
npm run build && npm run migrate

# Start development (with hot reload)
npm run dev          # API server on :8080

# In another terminal
cd client && npm run dev   # Vite dev server (proxies to :8080)
```

### Available Scripts (server/)

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `tsx watch src/app.ts` | Dev server with hot reload |
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/app.js` | Production start |
| `npm run bot` | `tsx src/bot/index.ts` | Run Telegram bot standalone |
| `npm run cron` | `node dist/cron/scheduler.js` | Run scheduled jobs |
| `npm run migrate` | `node dist/db/migrate.js` | Apply database migrations |
| `npm test` | `jest --passWithNoTests` | Run tests |
| `npm run lint` | `eslint src/ --ext .ts` | Lint check |
| `npm run typecheck` | `tsc --noEmit` | Type check without emitting |

---

## 12. Production Deployment

### First-time setup on a fresh Ubuntu droplet:

```bash
# 1. Bootstrap server (as root)
sudo bash deploy/setup-droplet.sh
# Creates 'bchat' user, installs Docker, configures UFW (22/80/443)

# 2. Switch to deploy user and clone
su - bchat
git clone <repo-url> /home/bchat/bchat
cd /home/bchat/bchat

# 3. Configure environment
cp .env.production.example .env
nano .env   # Fill in DB_PASSWORD, JWT_SECRET, DOMAIN, EMAIL, etc.

# 4. Point DNS A record to server IP

# 5. Provision SSL certificate
sudo bash deploy/init-letsencrypt.sh

# 6. Launch all services
docker compose up -d

# 7. Verify
docker compose ps
docker compose logs -f
curl https://your-domain.com/health
```

### How the Docker build works:

1. **server/Dockerfile** — Multi-stage: installs deps → compiles TS → copies dist + SQL migrations → production image
2. **docker-entrypoint.sh** — Runs `node dist/db/migrate.js` then `node dist/app.js`
3. **deploy/Dockerfile.nginx** — Multi-stage: builds client with Vite → copies into nginx Alpine
4. **Certbot** — Runs in a loop, renewing certs every 12 hours

### Nginx routing:

| Path | Destination |
|------|-------------|
| `/` | SPA (Vite-built client) |
| `/api/*` | Proxy to `server:8080` |
| `/ws` | WebSocket upgrade to `server:8080` (86400s timeout) |
| `/health` | Direct pass-through |
| `/.well-known/acme-challenge/` | Certbot challenge files |

---

## 13. Scam Detection Patterns

13 built-in patterns across 6 categories, 4 severity levels:

| Severity | Weight | Examples |
|----------|--------|---------|
| CRITICAL | 0.40 | Seed phrase requests, private key theft |
| HIGH | 0.25 | Fake admin impersonation, wallet connect scams |
| MEDIUM | 0.15 | Unsolicited investment offers, urgency pressure |
| LOW | 0.05 | Suspicious external links |

**Auto-restriction** triggers at composite score >= 0.60: trust reduced by 0.15, invite codes revoked, sender is NOT notified.

---

## 14. Key Security Mechanisms

| Mechanism | How It Works |
|-----------|-------------|
| **Telegram-gated onboarding** | Must join Telegram channel first → `telegram_join_events` verified |
| **Anti-impersonation** | Homoglyph normalization + Levenshtein similarity > 0.75 blocks registration |
| **Device binding** | SHA-256 fingerprint of platform+model+OS+app+hardware; banned devices can't re-register |
| **Contact cooling** | First 72 hours: wallet addresses, links, and seed-related keywords are blocked |
| **Admin chain of trust** | Creator → ed25519 signed promotions → cascade revocation |
| **E2EE blind relay** | Server never sees plaintext; NaCl box with random 24-byte nonces |
| **Trusted room safety** | Auto-deactivated after 3 bans; 0.5x cascade dampening |
| **Support tickets** | In-app only (never Telegram DM); admin verified via challenge-response |

---

## 15. Known Gaps / Next Steps

- **Test coverage** — Jest is configured but no test files exist yet in `src/`. Writing tests should be a priority.
- **Redis** — Referenced in rate-limit dependencies (`ioredis`, `rate-limit-redis`) but no Redis service in `docker-compose.yml`. Currently falls back to in-memory rate limiting. Add a Redis service for production.
- **Rename to Shield X** — Package names, Docker references, deploy scripts, nginx config, and database name all still reference `bchat`. A coordinated rename is needed across: `package.json`, `docker-compose.yml`, `setup-droplet.sh`, `init-letsencrypt.sh`, `docker-entrypoint.sh`, nginx config, and database (`POSTGRES_DB`).
- **Cron jobs** — `npm run cron` exists but no `src/cron/` directory was found. Scheduled job infrastructure may need implementation.
- **Client E2EE** — `tweetnacl` is in client dependencies for client-side encryption. Verify the React app properly implements the key management and encryption flows.

---

## 16. Key Files for Onboarding

If you're a new developer, read these files first:

1. **`PATENT.md`** — Complete technical specification of every subsystem
2. **`server/src/server.ts`** — Main entry point, see how everything wires together
3. **`server/src/routes/messages.ts`** — Largest route file, shows E2EE + cooling + scam detection flow
4. **`server/src/middleware/authenticate.ts`** — How JWT auth works
5. **`server/src/db/schema.sql`** — Core database tables
6. **`docker-compose.yml`** — Production service topology
7. **`deploy/nginx/default.conf`** — How traffic flows from internet to app

---

*This document was generated from the codebase as of commit `cb0f42a`. The project is being renamed from bchat to Shield X — update all internal references accordingly.*
