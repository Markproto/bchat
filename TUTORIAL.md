# X Shield Complete Tutorial

A step-by-step guide to deploying, configuring, and operating X Shield — from Telegram bot setup through AI-powered fraud detection and beyond.

---

## Table of Contents

1. [Infrastructure Setup](#1-infrastructure-setup)
2. [Telegram Bot Creation](#2-telegram-bot-creation)
3. [First Admin (Creator) Setup — Security Deep Dive](#3-first-admin-creator-setup--security-deep-dive)
4. [Inviting Your First Users](#4-inviting-your-first-users)
5. [Trusted Room Auto-Access](#5-trusted-room-auto-access)
6. [Promoting Sub-Admins](#6-promoting-sub-admins)
7. [Understanding the Trust Engine](#7-understanding-the-trust-engine)
8. [AI Scam Detection — How It Works](#8-ai-scam-detection--how-it-works)
9. [Contact Cooling Periods](#9-contact-cooling-periods)
10. [End-to-End Encryption](#10-end-to-end-encryption)
11. [Support Ticket System](#11-support-ticket-system)
12. [Day-to-Day Admin Operations](#12-day-to-day-admin-operations)
13. [Future Versatility — Beyond Chat](#13-future-versatility--beyond-chat)

---

## 1. Infrastructure Setup

### What You Need

- A server (DigitalOcean Droplet, VPS, or similar)
- PostgreSQL database
- Node.js 18+
- A Telegram account

### Environment Variables

Create a `.env` file in `server/`:

```bash
# === REQUIRED ===

# PostgreSQL connection string
DATABASE_URL=postgresql://xshield_user:your_strong_password@localhost:5432/xshield

# JWT signing secret — generate with: openssl rand -hex 32
JWT_SECRET=your_64_char_hex_secret_here

# === TELEGRAM ===

# From BotFather (see Section 2)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHANNEL_ID=-1001234567890

# === OPTIONAL ===

PORT=8080                          # Default 8080
NODE_ENV=production                # or development
JWT_EXPIRES_IN=7d                  # Session duration
CORS_ORIGIN=https://your-domain.com
DATABASE_SSL=false                 # true for remote DB
```

### Docker Compose (Recommended)

```bash
cp .env.production.example .env
# Edit .env with your values
docker compose up -d
```

This starts both the PostgreSQL database and the X Shield server. Migrations run automatically on startup.

### Manual Setup

```bash
cd server
npm install
npm run build
npm start
```

The server auto-runs all SQL migrations in `server/src/db/migrations/` on first boot.

---

## 2. Telegram Bot Creation

### Step 1: Create the Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name: `X Shield Security Bot` (or whatever you prefer)
4. Choose a username: `xshield_security_bot` (must end in `bot`)
5. BotFather gives you a token like `123456789:ABCdefGHI...` — copy this

### Step 2: Create Your Channel/Group

1. Create a Telegram channel or group for your community
2. Add your bot as an **administrator** with these permissions:
   - Read messages
   - Manage members (to track joins)
3. Get the channel ID:
   - Add `@raw_data_bot` to the channel temporarily
   - It will show the channel ID (negative number like `-1001234567890`)
   - Remove the helper bot after

### Step 3: Configure X Shield

Set these in your `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
TELEGRAM_CHANNEL_ID=-1001234567890
```

### Step 4: How Users Join

The flow works like this:

```
User joins Telegram channel
    |
    v
Bot records join event in telegram_join_events table
    |
    v
User opens X Shield web app
    |
    v
X Shield verifies the Telegram identity
    |
    v
If join record exists AND name isn't impersonating an admin
    |
    v
Account created -> JWT issued -> user is in
```

**Key security property**: Users MUST join via Telegram first. The bot records their join, and the web app verifies it. You can't create an X Shield account without a real Telegram identity.

### Bot Commands

| Command | Who | What it does |
|---------|-----|-------------|
| `/start` | Anyone | Shows welcome message; if sent with invite code payload, marks invite as used |
| `/invite` | Admins | Generates an 8-character invite code (expires 24h) |
| `/verify` | Anyone | Checks if the user's Telegram join has been recorded |
| `/trustroom enable YYYY-MM-DD` | Admins | Designates the current group as a trusted room with a membership cutoff date |
| `/trustroom disable` | Admins | Deactivates the trusted room |
| `/trustroom status` | Admins | Shows trusted room status, cutoff date, and admission count |

---

## 3. First Admin (Creator) Setup — Security Deep Dive

This is the most critical step in the entire system. The Creator is the **root of trust** — every admin appointment, every verification chain, and every cryptographic proof traces back to this single identity. Get this right.

### What Happens During Creator Initialization

#### Step 1: First Login

The first person to log in via Telegram gets a normal user account. At this point they're just a regular user with `role = 'user'` and `trust_score = 0.50`.

During login, the client generates an **ed25519 signing keypair**:

```
Private key: stays on-device only (localStorage)
Public key:  sent to server, stored in users.identity_pubkey
```

This keypair is NOT a wallet. It's a signing identity — used to prove "I am who I say I am" without passwords.

#### Step 2: Initialize as Creator

Call the one-time initialization endpoint:

```
POST /api/admin/initialize
Authorization: Bearer <your_jwt_token>
```

What happens on the server:

1. **Uniqueness check**: Queries `SELECT COUNT(*) FROM users WHERE role = 'creator'`
   - If ANY creator exists → **400 error**, full stop
   - There can only ever be ONE creator in the entire system
2. **Role elevation**: `UPDATE users SET role = 'creator', is_verified = TRUE WHERE id = $1`
3. **Audit log**: Records `creator_initialized` event with your userId and IP address
4. **Public key pinning**: Your ed25519 public key becomes the **root trust anchor**

#### Step 3: What "Root of Trust" Means

Every security property in X Shield ultimately derives from the Creator's public key:

```
Creator (root)
  |-- Public key: 7a3f...b2c1 (pinned, immutable)
  |
  |-- Promotes Admin_Alice
  |     Signed: "alice_id|alice_pubkey|admin|2025-01-15T..."
  |     Signature: ed25519(creator_private_key, payload)
  |     Verifiable: anyone can check this with creator's public key
  |
  |-- Admin_Alice promotes Admin_Bob
  |     Signed: "bob_id|bob_pubkey|admin|2025-01-16T..."
  |     Signature: ed25519(alice_private_key, payload)
  |     Chain: Creator -> Alice -> Bob (2 hops, both verifiable)
  |
  |-- User requests "prove you're a real admin"
        Server walks the chain backwards:
        Bob's signature -> verified by Alice's pubkey -> OK
        Alice's signature -> verified by Creator's pubkey -> OK
        Creator's pubkey matches pinned root -> VERIFIED
```

This is a **chain of trust** — identical in concept to how HTTPS certificates work (root CA -> intermediate CA -> leaf certificate). The difference is that X Shield's chain is visible to users and cryptographically verifiable in real-time.

### Why This Matters

**Problem it solves**: In Telegram groups, scammers create accounts like "Admin_Mark" or "Αdmin_Mark" (with a Cyrillic A) and DM victims pretending to be support staff. There's no way to prove who's real.

**X Shield's solution**: Every admin has a cryptographic proof chain back to the Creator. Users can click "Verify Admin" on any support ticket and the server walks the ed25519 signature chain. If any link is broken, forged, or revoked — verification fails. A scammer can copy a username but can never forge an ed25519 signature.

### Security Properties of the Creator Setup

| Property | How It's Enforced |
|----------|------------------|
| **Only one Creator ever** | Database constraint: `WHERE role = 'creator'` count check before INSERT |
| **Creator can't be impersonated** | ed25519 public key pinned at initialization; name similarity check blocks lookalike usernames |
| **Creator can't be removed** | No endpoint exists to demote or ban the Creator |
| **Private key never leaves device** | Server only stores public key; all signatures happen client-side |
| **Chain is tamper-evident** | Each promotion includes a signed payload with timestamp; altering any field invalidates the signature |
| **Revocation cascades** | If Admin_Alice is revoked, everyone she promoted is also revoked automatically |

### What If the Creator Loses Their Device?

This is the one catastrophic failure mode. The Creator's private key lives in the browser's localStorage. If lost:

- All verification chains still work (signatures are stored server-side)
- But no new admins can be promoted (requires Creator's signature)
- The Creator can't sign new challenges

**Mitigation** (future): Derive the signing key from a BIP39 mnemonic (24-word recovery phrase). Write it down, store it in a safe. The `MASTER_MNEMONIC` env var and wallet derivation columns exist in the schema for this purpose but aren't wired up yet.

**Current recommendation**: Export your private key from localStorage (`bchat_e2ee_keypair`) and store it securely offline.

---

## 4. Inviting Your First Users

### The Invite Chain

X Shield uses a closed invitation system. Every user traces back to whoever invited them:

```
Creator
  |-- invited User_A (invite code: abc12345)
  |     |-- invited User_B (invite code: def67890)
  |     |     |-- invited User_C
  |     |-- invited User_D
```

This creates **accountability**. If User_C turns out to be a scammer:
- User_C gets banned
- User_B's trust score drops by 15% (direct inviter)
- User_A's trust score drops by 8% (one level up)
- Creator's trust score drops by 4% (two levels up)

### Generating Invite Codes

**In the app** (Settings > Invite Codes):
1. Go to the Settings tab
2. If your trust score is >= 0.80 (or you're an admin), you'll see the "Invite Codes" section
3. Click **Generate Code**
4. You get an 8-character code like `a1b2c3d4`
5. Click **Copy** to copy it to clipboard
6. Share with the person you want to invite

**Via Telegram bot** (admins):
1. Send `/invite` to the bot
2. Bot generates a code and replies with it

**Properties of invite codes**:
- Single-use (one code = one user)
- Expires after 24 hours
- Permanently linked to the inviter in the database
- Code format: 8-character UUID segment

### New User Onboarding Flow

1. New user receives an invite code from you
2. They join the Telegram channel (bot records their join)
3. They open the X Shield web app
4. Login screen: enter Telegram credentials + invite code
5. Server checks:
   - Telegram join record exists? (must have joined channel)
   - Invite code valid and unused?
   - Username too similar to an admin's? (anti-impersonation)
6. Account created with `trust_score = 0.50` (neutral starting point)
7. Invite code marked as used, linked to both inviter and invitee

---

## 5. Trusted Room Auto-Access

### What It Is

Trusted rooms let admins designate an existing Telegram group as a "trusted source" for X Shield. Members of that group who joined **before a cutoff date** can register on X Shield without needing a personal invite code. This is ideal for onboarding established communities where individual invite codes would be impractical.

### Key Concept: Membership Cutoff Date

When enabling a trusted room, the admin **must** specify a cutoff date. This is critical for security:

- Members who joined the Telegram group **before** the cutoff date → auto-access to X Shield
- Members who joined the Telegram group **after** the cutoff date → must get a regular invite code

This prevents someone from seeing that a Telegram group grants X Shield access, joining it after the fact, and getting in without being vetted.

### How to Enable a Trusted Room

#### Via Telegram Bot (Recommended)

Run the command directly in the Telegram group you want to designate:

```
/trustroom enable 2026-02-25
```

The date `2026-02-25` is the cutoff. Only members who joined the group before February 25, 2026 get auto-access. The bot will confirm:

```
Trusted room enabled!

Name: Alpha Traders VIP
Cutoff: 2026-02-25 (only members who joined before this date get auto-access)
Trust score: 0.4
Member cap: Unlimited
```

#### Via API

```
POST /api/trusted-rooms
Authorization: Bearer <admin_jwt>
{
  "source_type": "telegram",
  "telegram_chat_id": -1001234567890,
  "name": "Alpha Traders VIP",
  "membership_cutoff": "2026-02-25T23:59:59.999Z",
  "default_trust_score": 0.40,
  "max_members": 0
}
```

### How Auto-Access Works

```
Admin runs /trustroom enable 2026-02-25
    |
    v
User joins Telegram group
    |
    v
Bot records join event (with timestamp)
    |
    v
Bot checks: is this group a trusted room?
    |
    v
Yes → check user's join date vs cutoff
    |
    v
Joined BEFORE cutoff?
  Yes → mark join event with trusted::room_id
        DM user: "You have auto-access to X Shield!"
  No  → ignore (user needs a regular invite code)
    |
    v
User opens X Shield app, registers normally
    |
    v
Auth route detects trusted:: code
  → verifies room is active
  → verifies join date < cutoff
  → creates account with trust_score = 0.40
  → records admission in trusted_room_admissions table
```

### Trust Score Difference

| Admission Type | Starting Trust Score | Why |
|---------------|---------------------|-----|
| Personal invite code | 0.50 | Someone personally vouched for this user |
| Trusted room | 0.40 | Group-level trust — nobody vouched individually |

Trusted room users start 10 points lower because being in a Telegram group is a weaker signal than a personal invitation.

### Cascade Accountability

When a trusted-room user gets banned, the cascade penalty flows to the **admin who created the trusted room** (since there's no personal inviter). The penalties are dampened to **50%** of normal levels:

```
Banned trusted-room user: trust_score = 0 (account deactivated)
    |
    Level 1 (room creator): -7.5% trust score (50% of normal 15%)
    |
    Level 2 (creator's inviter): -4% (50% of normal 8%)
    |
    Level 3 (three levels up): -2% (50% of normal 4%)
```

This creates the right incentive: admins should only trust rooms they genuinely trust, because their trust score is at stake.

### Safety Mechanisms

| Mechanism | What It Does |
|-----------|-------------|
| **Membership cutoff** | Only pre-existing members qualify — no gaming the system after the fact |
| **Member cap** | Set `max_members` to limit how many users can be auto-admitted (0 = unlimited) |
| **Auto-deactivation** | If 3+ users from a room get banned, the room is automatically deactivated |
| **Manual deactivation** | `/trustroom disable` or `POST /api/trusted-rooms/:id/deactivate` |
| **All protections apply** | Cooling periods, scam detection, device binding, impersonation checks — nothing is bypassed |

### Managing Trusted Rooms

#### Bot Commands

| Command | What It Does |
|---------|-------------|
| `/trustroom enable YYYY-MM-DD` | Designate current group as trusted with cutoff date |
| `/trustroom disable` | Deactivate the trusted room |
| `/trustroom status` | Show room status, cutoff date, admitted count |

#### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/trusted-rooms` | POST | Create a trusted room |
| `/api/trusted-rooms` | GET | List all trusted rooms |
| `/api/trusted-rooms/:id` | GET | Get room details |
| `/api/trusted-rooms/:id` | PUT | Update settings (trust score, cap, cutoff) |
| `/api/trusted-rooms/:id/deactivate` | POST | Deactivate a room |
| `/api/trusted-rooms/:id/reactivate` | POST | Reactivate a room |
| `/api/trusted-rooms/:id/admissions` | GET | List all users admitted via this room |

### What Happens If a Trusted Room Is Compromised

1. **Immediate deactivation**: Run `/trustroom disable` in Telegram or call the deactivate API. All future auto-admissions stop instantly.
2. **Existing users are NOT auto-banned**: Many legitimate users may already be on the platform. Mass-banning would be destructive.
3. **Review admissions**: Use `GET /api/trusted-rooms/:id/admissions` to see all users admitted via the room. Selectively ban suspicious accounts.
4. **Auto-deactivation**: If you don't catch it manually, the system auto-deactivates after 3 banned members from the same room.

---

## 6. Promoting Sub-Admins

### When to Promote

Only promote someone to admin when you need them to:
- Manage support tickets
- Ban malicious users
- Create/modify scam detection patterns
- Exempt contacts from cooling periods

Regular high-trust users can already generate invites. Admin is for operational control.

### How Admin Promotion Works

The promotion requires a **cryptographic signature** — you sign a statement saying "I vouch for this person as an admin" with your private key.

```
POST /api/admin/promote
{
  "targetUserId": "uuid-of-the-user",
  "signature": "ed25519_hex_signature",
  "signedPayload": "targetUserId|targetPubkey|admin|2025-01-15T10:30:00Z"
}
```

**What the signature contains**:
- Target user's ID
- Target user's public key
- The role being granted
- Timestamp

This signature is stored permanently in the `admin_chain` table. Anyone can verify it later by checking the signature against your public key.

### The Verification Chain

After promotion, the new admin's verification chain looks like:

```
GET /api/admin/verify/:userId

{
  "isVerifiedAdmin": true,
  "chainLength": 2,
  "chain": [
    {
      "adminId": "new-admin-uuid",
      "promotedBy": "creator-uuid",
      "signature": "a7f2...3b91",
      "signedPayload": "new-admin-uuid|pubkey|admin|timestamp"
    }
  ],
  "rootCreatorPubkey": "7a3f...b2c1"
}
```

Users can request this verification on any support ticket by clicking **Verify Admin**. The server walks the chain and confirms every signature.

### Revoking Admin Access

```
POST /api/admin/revoke
{
  "targetAdminId": "uuid-of-admin-to-revoke"
}
```

**Cascade revocation**: If you revoke Admin_Alice, and Alice had promoted Admin_Bob and Admin_Carol — both Bob and Carol are also automatically revoked. The chain breaks and everyone downstream loses their admin status.

---

## 7. Understanding the Trust Engine

### How Trust Scores Work

Every user has a trust score from 0.00 to 1.00. It's calculated from 5 weighted factors:

| Factor | Weight | What It Measures |
|--------|--------|-----------------|
| Account age | 20% | Days since registration (maxes at 365 days) |
| Invite quality | 25% | Ratio of good vs banned invitees |
| Community standing | 20% | Inverse of flags received |
| Activity level | 15% | Messages in last 30 days (maxes at 100) |
| Inviter trust | 20% | Trust score of the person who invited you |

### What Trust Scores Unlock

| Score Range | Label | Capabilities |
|-------------|-------|-------------|
| 0.80 - 1.00 | **Trusted** | Can generate invite codes |
| 0.50 - 0.79 | **Caution** | Normal messaging, no invite privileges |
| 0.40 - 0.49 | **Warning** | Invite privileges revoked if previously granted |
| 0.00 - 0.39 | **Danger** | Restricted; may be auto-flagged |

### Cascade Penalties (Ban Consequences)

When a user gets banned, the penalty ripples up the invite chain:

```
Banned user: trust_score = 0 (account deactivated)
    |
    Level 1 (direct inviter): -15% trust score
    |
    Level 2 (inviter's inviter): -8%  trust score
    |
    Level 3 (three levels up): -4%  trust score
```

If your score drops below 0.40, your invite privileges are automatically revoked.

### Community Flagging

Any user can flag another user for suspicious behavior:

```
POST /api/trust/flag
{ "target_user_id": "uuid", "reason": "Sending suspicious links" }
```

- 24-hour cooldown per flagger/target pair (prevents spam flagging)
- 10 flags from different users triggers auto-restriction
- Flags contribute to the "community standing" factor in trust scoring

---

## 8. AI Scam Detection — How It Works

### The Detection Pipeline

Every outgoing message passes through the scam detection engine. Here's the flow:

```
User types message
    |
    v
Client encrypts with NaCl (E2EE)
    |
    v
POST /api/messages/send
  - ciphertext (encrypted, server can't read)
  - content (plaintext hint for scam check — NOT stored)
    |
    v
Server runs scanMessage(content, senderId, recipientId)
    |
    v
Pattern matching against all active patterns
    |
    v
If matches found:
  - Create scam_alert records (visible to RECIPIENT only)
  - Calculate composite score
  - If score >= 0.60: auto-restrict sender
    |
    v
Message delivered (encrypted) regardless
Alert shown to recipient on next load
```

**Critical design principle**: The sender never knows their message was flagged. Only the recipient sees the alert. This prevents scammers from learning what triggers detection and adapting.

### Built-In Detection Patterns

X Shield ships with 12 patterns across 5 categories:

#### Seed Theft (CRITICAL severity)
- **Seed Phrase Request**: Catches "seed phrase", "recovery words", "mnemonic"
- **Private Key Request**: Catches "private key", "secret key", "keystore file"
- **12/24 Word Request**: Catches "12 word phrase", "twenty-four words"

#### Investment Fraud (CRITICAL severity)
- **Investment Doubling**: Catches "double your money/crypto/btc/eth"
- **Guaranteed Returns**: Catches "guaranteed profit", "100% return"

#### Fund Theft (HIGH severity)
- **Crypto Transfer Request**: Catches "send me btc/eth/crypto/usdt/sol"

#### Phishing (HIGH severity)
- **Wallet Connection**: Catches "connect your wallet/metamask/phantom"
- **Suspicious Links**: Catches "click this link", "check out my site"
- **QR Code Requests**: Catches "scan this QR", "QR code" (LOW severity)

#### Social Engineering (MEDIUM severity)
- **Urgency Pressure**: Catches "act now", "limited time", "hurry", "last chance"
- **Trust Manipulation**: Catches "trust me", "I promise", "believe me"
- **Authority Impersonation**: Catches "I'm from support", "official admin"

#### Other (LOW severity)
- **Screen Share Request**: Catches "share your screen", "anydesk", "teamviewer"

### Composite Scoring

Each severity level has a weight:

| Severity | Weight |
|----------|--------|
| CRITICAL | 0.40 |
| HIGH | 0.25 |
| MEDIUM | 0.15 |
| LOW | 0.05 |

If a message matches multiple patterns, the weights are summed. Example:

```
Message: "Send me your ETH, act now before it's too late! Trust me."
  Match 1: Crypto Transfer Request (HIGH)  = 0.25
  Match 2: Urgency Pressure (MEDIUM)       = 0.15
  Match 3: Trust Manipulation (MEDIUM)     = 0.15
  ─────────────────────────────────────────
  Composite score: 0.55 (below threshold)
  Result: Alerts created, but sender NOT auto-restricted
```

Another example:

```
Message: "Send me your seed phrase and I'll double your Bitcoin"
  Match 1: Seed Phrase Request (CRITICAL)     = 0.40
  Match 2: Investment Doubling (CRITICAL)     = 0.40
  Match 3: Crypto Transfer Request (HIGH)     = 0.25
  ─────────────────────────────────────────────
  Composite score: 1.00 (capped, above 0.60 threshold)
  Result: Alerts created AND sender auto-restricted
           Sender loses 0.15 trust score
           Sender's invite privileges revoked
```

### Admin Pattern Management

Admins can create custom patterns via the API:

```
POST /api/scam/patterns
{
  "name": "Fake Airdrop",
  "description": "Catches airdrop scam language",
  "category": "investment_fraud",
  "regex": "free\\s*(airdrop|tokens|coins)|claim\\s*(your|free)\\s*(tokens|airdrop)",
  "severity": "HIGH",
  "alert_message": "This appears to be a fake airdrop scam. Legitimate airdrops don't require you to send funds first."
}
```

- Built-in patterns can be deactivated but not deleted (audit trail preserved)
- Custom patterns can be fully deleted
- All changes are audited in `scam_pattern_audit` table
- Pattern cache auto-invalidates within 60 seconds of updates

### Viewing Pattern Stats

```
GET /api/scam/stats

Returns per pattern:
  - Total alerts triggered (lifetime)
  - Alerts in last 7 days
  - Alerts in last 30 days
```

Use this to see which patterns are catching real scams vs generating noise.

---

## 9. Contact Cooling Periods

### What It Is

When two users first interact, a **72-hour cooling period** starts. During this window, high-risk content is blocked:

| Blocked Content | Examples |
|----------------|----------|
| Wallet addresses | `0x742d35Cc...`, `bc1qxy2kgdyg...`, Solana/XRP/Cardano addresses |
| External links | `https://...`, `www.example.com`, `.com/.io/.xyz` domains |
| Seed phrase keywords | "seed phrase", "recovery words", "private key", "12 word", "mnemonic" |

Normal text messages flow freely during cooling. Only the dangerous content types are blocked.

### Why It Exists

Most crypto scams happen in the first interaction. A scammer's playbook:
1. Get added as a contact
2. Immediately share a phishing link or ask for wallet info
3. Victim clicks/responds before thinking

The 72-hour window breaks this pattern. By the time the cooling expires, the urgency trick no longer works, and the scam detection engine has had time to flag suspicious behavior.

### How It Works in the App

When you open a chat with a new contact:
- The client checks `GET /api/messages/cooling/:contactId`
- If cooling is active, a yellow banner appears: "Cooling period active — Xh remaining"
- If you try to send a blocked message, the server returns a 403 error
- The message is removed from your chat (it was never delivered)

### Admin Exemption

Admins see an **Exempt** button on the cooling banner. This is for contacts they personally know and trust:

```
POST /api/messages/cooling/:contactUserId/exempt
```

This backdates the contact pair so the cooling period is instantly expired. Use sparingly — the cooling period exists for a reason.

### Cooling Period Properties

- **72 hours** from first interaction between two users
- **Bidirectional**: applies to both users in the pair
- **One-time**: once expired, it never restarts (even if you re-add the contact)
- **Admin bypass**: admins are never subject to cooling (they need to share links for support)

---

## 10. End-to-End Encryption

### How E2EE Works in X Shield

X Shield uses **NaCl box encryption** (X25519 key exchange + XSalsa20-Poly1305 symmetric cipher). This is the same cryptographic primitive used by Signal.

#### Sending a Message

```
1. You type "Hello"
2. Client fetches recipient's public key from server
3. Client generates a random 24-byte nonce
4. Client encrypts: nacl.box("Hello", nonce, recipientPubKey, yourSecretKey)
5. POST to server: { ciphertext, nonce, sender_public_key }
6. Server stores the encrypted envelope — it CANNOT read the message
7. Server pushes envelope to recipient via WebSocket
```

#### Receiving a Message

```
1. WebSocket delivers: { ciphertext, nonce, senderPublicKey }
2. Client decrypts: nacl.box.open(ciphertext, nonce, senderPubKey, yourSecretKey)
3. Plaintext "Hello" appears in the chat
```

### What the Server Can See

| Data | Server Access |
|------|--------------|
| Who sent to whom | Yes (routing requires this) |
| When it was sent | Yes (timestamp) |
| Message size | Yes (ciphertext length) |
| Message content | **NO** — only encrypted bytes |
| Sender's public key | Yes (needed for recipient to decrypt) |

### Key Management

- **Keypair generation**: NaCl `box.keyPair()` on first login
- **Storage**: localStorage (browser) — keys persist across sessions
- **Registration**: Public key registered with server via `POST /api/messages/keys/register`
- **Recipient lookup**: `GET /api/messages/keys/:userId` (cached in-memory)
- **Logout**: Keypair cleared from memory and localStorage

### The "Plaintext Hint" for Scam Detection

You may wonder: "If messages are encrypted, how does scam detection work?"

The answer is a deliberate design tradeoff. When sending, the client includes the plaintext as an optional `content` field alongside the ciphertext. The server:
1. Uses it for scam pattern matching
2. Uses it for cooling period content checks
3. **NEVER stores it** — it's checked in-memory and discarded

The ciphertext (which IS stored) cannot be decrypted by the server. This gives you scam detection without compromising message privacy at rest.

---

## 11. Support Ticket System

### How It Works

All support happens inside X Shield — never via Telegram DMs. This prevents the classic "fake admin DMs you" scam.

#### Creating a Ticket

1. Go to the **Support** tab
2. Click **New Ticket**
3. Fill in:
   - **Subject**: Describe your issue
   - **Category**: account, security, billing, technical, report_user, general
   - **Priority**: low, normal, high, urgent
4. Click **Submit Ticket**

#### Ticket Lifecycle

```
OPEN → ASSIGNED → VERIFIED → RESOLVED → CLOSED
```

1. **Open**: Ticket created, waiting for admin
2. **Assigned**: Admin picks up the ticket
3. **Verified**: User requested and confirmed admin's cryptographic identity
4. **Resolved**: Issue fixed
5. **Closed**: Ticket archived

#### Verifying an Admin's Identity

This is the killer feature. When an admin is assigned to your ticket:

1. You see their name and a "Pending verification" label
2. Click **Verify Admin**
3. Server generates a random 32-byte challenge nonce
4. Admin must sign the nonce with their ed25519 private key
5. Server verifies the signature against the admin's public key
6. Server walks the promotion chain back to the Creator
7. If valid → green "Cryptographically Verified" badge with timestamp

**What this proves**: The person helping you was directly or indirectly appointed by the Creator, and they possess the private key matching their registered identity. A scammer cannot forge this.

---

## 12. Day-to-Day Admin Operations

### Banning a User

```
POST /api/trust/ban
{
  "target_user_id": "uuid",
  "reason": "Confirmed scammer — phishing links"
}
```

What happens:
- User's account deactivated (`is_active = false`)
- User's device ID banned (can't create new accounts on same device)
- Cascade penalties applied to the invite chain (15% / 8% / 4%)
- If any inviter's score drops below 0.40, their invite privileges are revoked

### Monitoring Scam Patterns

Check which patterns are catching scams:

```
GET /api/scam/stats
```

Create new patterns when you spot new scam techniques:

```
POST /api/scam/patterns
{
  "name": "Fake Airdrop",
  "category": "investment_fraud",
  "regex": "free\\s*airdrop|claim\\s*your\\s*tokens",
  "severity": "HIGH",
  "alert_message": "This looks like a fake airdrop scam."
}
```

### Managing Support Queue

View all open tickets sorted by priority:

```
GET /api/support/admin/queue
GET /api/support/admin/queue?status=open
```

Assign yourself to a ticket:

```
POST /api/support/tickets/:ticketId/assign
```

### Recalculating Trust Scores

If you suspect a score is stale:

```
POST /api/trust/recalculate/:userId
```

Returns the new score and risk level.

### Platform Statistics

```
GET /api/trust/stats
```

Shows platform-wide metrics: total users, average trust score, ban count, etc.

---

## 13. Future Versatility — Beyond Chat

X Shield's architecture is designed to extend far beyond simple messaging. The security primitives — identity verification, trust scoring, cooling periods, and pattern detection — can protect any interaction, not just text chat.

### Wallet Activity Monitoring

The scam detection engine currently watches message text. The same pattern-matching infrastructure can monitor:

- **Wallet address sharing**: Already detected during cooling periods. Future: cross-reference shared addresses against known scam databases (e.g., ChainAbuse, ScamSniffer)
- **Transaction proposals**: When users discuss trades, auto-flag if the proposed address has been associated with rug pulls or mixer services
- **DeFi link verification**: Check shared DeFi URLs against known phishing domains before they're even clickable
- **On-chain activity correlation**: Link X Shield identities to wallet addresses (opt-in) and flag users whose on-chain behavior matches scam patterns (dust attacks, rapid token approvals, drain contracts)

### Real-Time Transaction Screening

```
Potential future pattern:
{
  "name": "Known Scam Wallet",
  "category": "wallet_screening",
  "regex": "(0x742d35Cc6634C0532925a3b844Bc9e7595f2BD|<other known scam addresses>)",
  "severity": "CRITICAL",
  "alert_message": "This wallet address has been flagged in scam databases."
}
```

The pattern engine supports any regex — it's not limited to social engineering phrases. You can add wallet address patterns, contract addresses, known phishing domains, and more.

### Smart Contract Risk Alerts

Future integration points:

- **Token approval warnings**: Detect when users discuss unlimited token approvals ("approve max", "unlimited allowance")
- **Contract verification**: When a contract address is shared, auto-check if it's verified on Etherscan/equivalent
- **Honeypot detection**: Flag tokens that allow buying but block selling
- **Flash loan attack patterns**: Detect discussions about exploit techniques

### Multi-Channel Protection

The trust engine and scam detection aren't tied to the chat UI. They can wrap:

- **Voice/video calls**: Trust scores visible during calls; unverified users flagged
- **File sharing**: Scan filenames and metadata for social engineering (e.g., "wallet_backup.pdf", "recovery_sheet.xlsx")
- **Group channels**: Apply cooling periods to group joins, not just 1-on-1 contacts
- **Marketplace/OTC**: If X Shield adds P2P trading, the trust engine provides a built-in reputation system

### API-First Architecture

Every feature is exposed as a REST API. This means third-party tools can integrate:

- **Trading bots** can check a counterparty's trust score before executing
- **DAO governance** can require minimum trust scores for proposal submission
- **Wallet apps** can query X Shield's scam pattern database for address screening
- **Browser extensions** can check URLs against X Shield's phishing patterns

### The Vision

X Shield isn't just a chat app — it's a **trust infrastructure layer** for crypto communities. The same cryptographic identity, trust scoring, and scam detection that protects messages today can protect any interaction where one person might try to defraud another.

The patterns you add to catch "send me your seed phrase" today are the same engine that can catch "approve this malicious contract" tomorrow. Every ban, every flag, every trust score adjustment makes the system smarter.

---

## Quick Reference

### Key API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/telegram` | POST | None | Login via Telegram |
| `/api/admin/initialize` | POST | JWT | One-time Creator setup |
| `/api/admin/promote` | POST | JWT (Admin) | Promote user to admin |
| `/api/admin/revoke` | POST | JWT (Admin) | Revoke admin status |
| `/api/admin/verify/:userId` | GET | JWT | Verify admin chain |
| `/api/trust/me` | GET | JWT | Your trust profile |
| `/api/trust/ban` | POST | JWT (Verified Admin) | Ban a user |
| `/api/trust/flag` | POST | JWT | Flag a user |
| `/api/scam/alerts` | GET | JWT | Your scam alerts |
| `/api/scam/patterns` | GET/POST/PUT/DELETE | JWT (Admin) | Manage detection patterns |
| `/api/support/tickets` | GET/POST | JWT | Support tickets |
| `/api/invites/create` | POST | JWT (Admin) | Generate invite code |
| `/api/trusted-rooms` | POST | JWT (Verified Admin) | Create a trusted room |
| `/api/trusted-rooms` | GET | JWT (Verified Admin) | List all trusted rooms |
| `/api/trusted-rooms/:id` | PUT | JWT (Verified Admin) | Update trusted room settings |
| `/api/trusted-rooms/:id/deactivate` | POST | JWT (Verified Admin) | Deactivate a trusted room |
| `/api/trusted-rooms/:id/admissions` | GET | JWT (Verified Admin) | List users admitted via room |
| `/api/messages/send` | POST | JWT | Send encrypted message |
| `/api/messages/cooling/:id` | GET | JWT | Check cooling status |
| `/api/messages/cooling/:id/exempt` | POST | JWT (Admin) | Exempt from cooling |

### Trust Score Thresholds

| Score | Label | Invite Access |
|-------|-------|--------------|
| >= 0.80 | Trusted | Yes |
| >= 0.50 | Caution | No |
| >= 0.40 | Warning | Revoked |
| < 0.40 | Danger | Revoked |

### Scam Detection Thresholds

| Severity | Score Weight | Auto-restrict at |
|----------|-------------|-----------------|
| CRITICAL | 0.40 | Composite >= 0.60 |
| HIGH | 0.25 | |
| MEDIUM | 0.15 | |
| LOW | 0.05 | |
