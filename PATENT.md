# SECURE MESSAGING PLATFORM WITH CRYPTOGRAPHIC IDENTITY VERIFICATION, TRUST SCORING, AND SCAM PREVENTION

## Title of the Invention

Secure Messaging Platform with Cryptographic Identity Verification, Trust Scoring, and Scam Prevention

---

## Abstract

A secure messaging system ("bchat") that combines Telegram-gated onboarding, ed25519 cryptographic identity, device fingerprinting, invite-chain accountability, trusted room auto-access, a multi-factor trust scoring engine, community flagging, regex-based scam detection with auto-restriction, NaCl box authenticated end-to-end encryption, contact cooling periods, homoglyph-based impersonation detection, and a support ticket system with cryptographic admin verification. The system is designed to prevent the most common cryptocurrency community scams — fake admin impersonation, seed phrase theft, phishing, and social engineering — through layered technical controls that do not rely on user vigilance alone.

---

## Technical Field

The present invention relates to secure messaging systems, and more particularly to a messaging platform that integrates cryptographic identity management, behavioral trust scoring, automated scam detection, and end-to-end encryption to protect users in cryptocurrency and Web3 communities.

---

## Background of the Invention

Cryptocurrency communities face persistent threats from social engineering attacks conducted through messaging platforms. The most prevalent attack vector involves impersonation of community administrators on platforms such as Telegram, where attackers create accounts with visually similar display names (using Unicode homoglyphs, invisible characters, or common substitutions) and initiate direct messages to community members. These fake administrators then solicit sensitive information including wallet seed phrases, private keys, or direct cryptocurrency transfers.

Existing messaging platforms lack integrated defenses against these attacks. Traditional approaches rely on user education ("admins will never DM you first"), which fails because: (a) users cannot reliably distinguish real admins from impersonators, (b) new community members are especially vulnerable, and (c) scammers continuously adapt their social engineering techniques.

The present invention addresses these shortcomings by providing a messaging platform where every administrator's identity is cryptographically verifiable through an unforgeable ed25519 signature chain, where new contacts face mandatory cooling periods before sharing high-risk content, where messages are scanned against configurable scam patterns with automatic sender restriction, and where end-to-end encryption ensures the server never accesses plaintext message content.

---

## Summary of the Invention

The present invention provides a secure messaging platform comprising the following integrated subsystems:

(a) **Identity Generation**: Each user receives a randomly generated ed25519 signing keypair. The private key is produced from 32 cryptographically random bytes via the `@noble/ed25519` library. No mnemonic seed phrases, HD wallet derivation, or BIP39/BIP32 protocols are involved.

(b) **Device Binding**: User accounts are bound to specific devices through software-based fingerprinting. A SHA-256 hash is computed from the concatenation of platform identifier, device model, operating system version, application version, and an optional hardware identifier.

(c) **Invite Chain Accountability**: Every non-trusted-room user enters the system through a single-use invite code traceable to a specific inviter. When a user is banned, cascade penalties propagate up the invite chain (Level 1: -0.15, Level 2: -0.08, Level 3: -0.04), creating inviter accountability.

(d) **Trusted Room Auto-Access**: Administrators can designate Telegram groups or bchat conversations as "trusted rooms" with a membership cutoff date. Members who joined before the cutoff receive automatic access with a default trust score of 0.40 (versus 0.50 for invite-code users), without needing a personal invite code. Rooms auto-deactivate after 3 admitted members are banned.

(e) **Trust Scoring Engine**: A four-factor formula computes each user's trust score: base (0.5) + account age (max +0.20 at 180 days) + message activity (max +0.20 at 100 messages in 30 days) + invite quality (range -0.20 to +0.20) - community flag penalty (max -0.30). Scores range from 0.00 to 1.00.

(f) **Community Flagging**: Users can flag suspicious accounts. At 5 unresolved flags, the system auto-restricts the target by revoking invite privileges and reducing trust score.

(g) **Scam Detection**: Messages are scanned against admin-configurable regex patterns across four severity levels (CRITICAL: 0.40, HIGH: 0.25, MEDIUM: 0.15, LOW: 0.05). A composite score at or above 0.60 triggers automatic sender restriction with a -0.15 trust penalty and invite privilege revocation.

(h) **End-to-End Encryption**: All user messages are encrypted client-side using NaCl box authenticated public-key encryption (X25519 key exchange + XSalsa20-Poly1305). The server stores and relays only encrypted envelopes and can never access plaintext content.

(i) **Contact Cooling Periods**: New contact pairs face a 72-hour restriction window during which wallet addresses, external links, and seed phrase keywords are blocked. This prevents the most common first-contact scam vectors.

(j) **Anti-Impersonation**: Unicode homoglyph detection using character mapping (Cyrillic, Greek, common substitutions) and Levenshtein distance similarity scoring blocks registration of display names that are visually similar to existing administrators. A visual identity fingerprint formatted as `AB12:CD34:EF56` provides a human-verifiable identity check.

(k) **Cryptographic Admin Verification**: Administrators form an ed25519 signature chain rooted at the platform creator. Any user can verify an admin's identity by walking the signature chain back to the creator's pinned public key.

(l) **Support Ticket System**: In-app support with E2EE messaging within tickets, cryptographic admin identity verification via 32-byte nonce challenge-response with 5-minute expiry, and a full audit trail via ticket events.

---

## Brief Description of the Figures

**FIG. 1** illustrates the overall system architecture of the bchat platform.

**FIG. 2** illustrates the identity generation and onboarding flow.

**FIG. 3** illustrates the admin chain of trust and cryptographic verification.

**FIG. 4** illustrates the trusted room auto-access flow with membership cutoff enforcement.

**FIG. 5** illustrates the trust score formula with all four factors and cascade penalties.

**FIG. 6** illustrates the scam detection pipeline and auto-restriction mechanism.

**FIG. 7** illustrates the scam pattern kill chain with severity classifications.

**FIG. 8** illustrates the end-to-end encrypted message flow using NaCl box.

**FIG. 9** illustrates the support ticket verification flow with challenge-response protocol.

---

## Detailed Description of the Invention

### Section I: System Architecture Overview

Referring now to FIG. 1, the bchat system comprises a single Node.js server process running on a configurable port (default 8080). The server integrates the following components on a single HTTP server instance:

1. **Express API Server** — Handles all REST API routes with endpoint-specific rate limiting:
   - `/api/auth` — Authentication (10 requests per 15 minutes)
   - `/api/invites` — Invite code management
   - `/api/admin` — Admin operations (20 requests per minute)
   - `/api/trust` — Trust engine operations (30 requests per minute)
   - `/api/scam` — Scam detection management (30 requests per minute)
   - `/api/messages` — E2EE messaging (60 requests per minute)
   - `/api/support` — Support tickets (20 requests per minute)
   - `/api/trusted-rooms` — Trusted room management (20 requests per minute)

2. **WebSocket Relay** — Attached to the same HTTP server via the `upgrade` event in `noServer` mode. Clients connect to `ws://host/ws?token=JWT`. The server authenticates the JWT during the HTTP upgrade handshake, then registers the authenticated socket in a per-user connection registry (supporting multiple simultaneous devices per user). A 30-second heartbeat (ping/pong) cycle detects and terminates stale connections.

3. **Telegram Bot** — A Telegraf-based bot that monitors channel join events, processes invite codes via deep links, and manages trusted room commands.

4. **PostgreSQL Database** — Stores all persistent state including users, devices, invite chains, trust scores, scam patterns, messages (encrypted), support tickets, and audit logs.

A global rate limiter of 60 requests per minute per IP address protects all endpoints. Additional per-action rate limits include: message sending (30 per minute), support ticket creation (5 per hour), and ban actions (5 per minute).

Security middleware includes Helmet for HTTP header hardening, CORS with configurable origin, and JSON body parsing limited to 1 MB.

---

### Section II: Identity Generation and Onboarding

Referring now to FIG. 2, the onboarding process proceeds as follows:

1. **Telegram Join Detection**: When a user joins the monitored Telegram channel or group, the bot's `chat_member` handler records the event in the `telegram_join_events` table, storing the user's Telegram ID, username, first name, and join timestamp.

2. **Web Application Authentication**: The user opens the bchat web application and initiates the `POST /api/auth/telegram` endpoint with their Telegram user data and device information.

3. **Join Record Verification**: The server verifies that a corresponding `telegram_join_events` record exists for this Telegram user ID. If no record is found, the request is rejected with a 403 status.

4. **Impersonation Check**: Before creating a new account, the server runs the user's display name through the homoglyph detection system, comparing it against all existing administrator display names and usernames. If the Levenshtein distance similarity exceeds 0.75 (75%), the registration is blocked.

5. **Ed25519 Keypair Generation**: The server generates a random ed25519 signing keypair for the new user:
   ```
   privateKey = ed.utils.randomPrivateKey()  // 32 cryptographically random bytes
   publicKey  = ed.getPublicKeyAsync(privateKey)  // deterministic derivation
   ```
   The public key is stored in the `identity_pubkey` column of the users table. The private key is returned to the client for local storage.

6. **Device Fingerprinting**: A device fingerprint is computed:
   ```
   fingerprint = SHA-256(platform | model | osVersion | appVersion | hardwareId)
   ```
   Where `|` denotes string concatenation with pipe separators, and missing fields default to `'unknown'` or `'no-hardware-binding'`. The device is registered in the `devices` table and marked as trusted.

7. **JWT Token Issuance**: The server issues a JSON Web Token containing the user ID, Telegram ID, and device ID. The token has a configurable expiry (default 7 days).

8. **Encryption Key Registration**: The client independently generates a NaCl `box.keyPair()` for E2EE messaging and registers the public encryption key via `POST /api/messages/keys/register`.

The ed25519 signing keypair serves a different purpose from the NaCl box keypair: the signing key is used for identity verification, admin chain signatures, and challenge-response protocols; the encryption key (curve25519) is used for message encryption.

---

### Section III: Device Binding and Fingerprinting

Each user account is bound to one or more physical devices. The device binding system operates as follows:

1. **Fingerprint Generation**: When a user authenticates, the client provides device metadata (platform, model, OS version, app version, and optional hardware identifier). The server computes a SHA-256 hash of these concatenated values:
   ```
   data = platform + "|" + model + "|" + osVersion + "|" + appVersion + "|" + hardwareId
   fingerprint = SHA-256(data)
   ```

2. **Device Registration**: A unique 32-byte random device ID is generated via `crypto.randomBytes(32)`. The device is registered in the `devices` table with the computed fingerprint, and marked as trusted.

3. **Device Validation**: On subsequent authentications, the server recomputes the fingerprint from the provided device info and compares it against stored bindings. A match requires both the fingerprint to match and the device to be marked as trusted.

4. **Device Banning**: When a user is banned, their device ID is added to the `banned_devices` table, preventing account recreation from the same device.

This is a software-based fingerprinting approach. No hardware attestation APIs (iOS Secure Enclave, Android StrongBox/KeyStore) are used in the current implementation.

---

### Section IV: Anti-Impersonation and Homoglyph Detection

The system includes a comprehensive anti-impersonation module that blocks registration of display names visually similar to administrators. The detection operates at two levels:

1. **Unicode Homoglyph Mapping**: A character-level mapping table translates deceptive Unicode characters to their ASCII equivalents:
   - Cyrillic look-alikes: а→a, е→e, о→o, р→p, с→c, у→y, х→x, і→i, ј→j, һ→h, ѕ→s, т→t
   - Greek look-alikes: α→a, ο→o, ε→e, ρ→p
   - Common substitutions: 0→o, 1→l, !→i, @→a, $→s, 3→e
   - Zero-width/invisible characters are stripped entirely: U+200B, U+200C, U+200D, U+FEFF, U+00AD

2. **Levenshtein Distance Similarity**: After normalization (lowercase, homoglyph replacement, whitespace collapse, invisible character removal), names are compared using the Levenshtein edit distance algorithm. The similarity score is computed as:
   ```
   similarity = 1 - (levenshteinDistance(normalizedA, normalizedB) / max(len(A), len(B)))
   ```
   A threshold of 0.75 (75% similarity) triggers an impersonation block.

3. **Visual Identity Fingerprint**: Each user's public key is rendered as a human-readable fingerprint:
   ```
   hash = SHA-256(publicKey)
   fingerprint = hash[0:2].hex + ":" + hash[2:4].hex + ":" + hash[4:6].hex
   ```
   Producing a format like `AB12:CD34:EF56`. This allows users to visually verify identities out-of-band.

---

### Section V: Cryptographic Admin Verification Chain

Referring now to FIG. 3, the admin verification system establishes a cryptographic chain of trust rooted at the platform creator:

1. **Creator Initialization**: The first user to call `POST /api/admin/initialize` is designated as the creator (root of trust). Their ed25519 public key becomes the root public key that all chain verifications trace back to.

2. **Admin Promotion**: When the creator (or an existing admin) promotes a user to admin, they sign a payload with their ed25519 private key:
   ```
   payload = targetUserId + "|" + targetPubkey + "|" + role + "|" + timestamp
   signature = ed25519.sign(payload, promoterPrivateKey)
   ```
   The signature, payload, promoter identity, and target identity are stored in the `admin_chain` table.

3. **Chain Verification**: To verify an admin, the system walks the `admin_chain` backwards:
   - Fetch the admin's promotion record (signed payload + signature + promoter pubkey)
   - Verify the ed25519 signature against the promoter's public key
   - If the promoter is the creator, verification succeeds (chain complete)
   - Otherwise, repeat for the promoter (walk up one level)
   - Circular chains are detected and rejected via a visited set

4. **Admin Revocation**: Revoking an admin deactivates their chain entry and cascades to all downstream admins they promoted, ensuring compromised admin chains are fully invalidated.

5. **Prerequisites**: A user must have a verified Telegram identity (telegram_id) before they can be promoted to admin, ensuring all administrators are linked to real Telegram accounts.

---

### Section VI: Trusted Room Auto-Access

Referring now to FIG. 4, the trusted room system allows bulk onboarding from established communities:

1. **Room Designation**: An admin uses the Telegram bot command `/trustroom enable YYYY-MM-DD` to designate the current Telegram group as a trusted room. The date parameter is the **membership cutoff** — only members who joined the group before this date qualify for auto-access. The room is created with:
   - `default_trust_score`: 0.40 (configurable, default 0.40 versus 0.50 for invite-code users)
   - `max_members`: 0 (unlimited by default, configurable)
   - `is_active`: true

2. **Join Detection**: When a user joins a Telegram group that is an active trusted room, the bot checks whether the user's join timestamp precedes the membership cutoff date. If so, the bot marks the join event with a synthetic invite code `trusted::{room_id}` and sends the user a DM notifying them of auto-access.

3. **Authentication Flow**: When the user opens the bchat web application, the `POST /api/auth/telegram` endpoint detects the `trusted::` prefix on the invite code. The server verifies:
   - The referenced trusted room exists and is active
   - The user's join date precedes the membership cutoff
   - The room has not exceeded its member cap (if one is set)

   Upon passing these checks, the user is created with `admission_source = 'trusted_room'`, `trust_score = 0.40`, and `invited_by` set to the room creator (for cascade accountability routing).

4. **Member Cap Enforcement**: If `max_members > 0`, the system tracks `admitted_count` and rejects new admissions when the cap is reached.

5. **Auto-Deactivation Safety**: After each user ban, the system checks whether the banned user was admitted via a trusted room. If 3 or more users from the same trusted room have been banned, the room is automatically deactivated with reason `"Auto-deactivated: too many banned members"`. This prevents compromised communities from continuing to inject malicious users.

6. **Cascade Dampening**: When a trusted-room-admitted user is banned, cascade penalties to their inviter chain are multiplied by a 0.5x dampening factor. This reflects that the room creator made a group-level trust decision rather than a personal endorsement of each individual user.

7. **Management API**: Seven REST endpoints are provided for trusted room administration:
   - `POST /api/trusted-rooms` — Create a trusted room
   - `GET /api/trusted-rooms` — List all trusted rooms
   - `GET /api/trusted-rooms/:roomId` — Get room details
   - `PUT /api/trusted-rooms/:roomId` — Update room settings
   - `POST /api/trusted-rooms/:roomId/deactivate` — Deactivate a room
   - `POST /api/trusted-rooms/:roomId/reactivate` — Reactivate a room
   - `GET /api/trusted-rooms/:roomId/admissions` — List admitted users

8. **Bot Commands**: Three Telegram bot commands manage trusted rooms:
   - `/trustroom enable YYYY-MM-DD` — Designate the current group as trusted
   - `/trustroom disable` — Deactivate the trusted room
   - `/trustroom status` — Show room status, cutoff date, admission count, and member cap

---

### Section VII: Trust Score Engine

Referring now to FIG. 5, the trust scoring engine computes a real-valued score for each user in the range [0.00, 1.00]:

**Formula**:
```
score = clamp(0, 1, baseScore + ageFactor + activityFactor + inviteFactor - flagPenalty)
```

Where:

1. **Base Score** = 0.50 (for invite-code users) or 0.40 (for trusted-room users)

2. **Account Age Factor** (maximum +0.20):
   ```
   ageFactor = min(0.20, accountAgeDays / 180 * 0.20)
   ```
   Linearly increases from 0 to +0.20 over the first 180 days.

3. **Message Activity Factor** (maximum +0.20):
   ```
   activityFactor = min(0.20, messagesInLast30Days / 100 * 0.20)
   ```
   Linearly increases from 0 to +0.20 as the user sends up to 100 messages within the most recent 30-day window.

4. **Invite Quality Factor** (range -0.20 to +0.20):
   ```
   inviteFactor = max(-0.20, ((goodInvites - badInvites * 3) / max(totalInvites, 1)) * 0.20)
   ```
   Where `goodInvites` counts non-banned invitees and `badInvites` counts banned invitees. Each banned invitee counts as 3x negative, penalizing inviters who bring in malicious users.

5. **Community Flag Penalty** (maximum -0.30):
   ```
   flagPenalty = min(0.30, unresolvedFlagCount * 0.05)
   ```
   Each unresolved community flag deducts 0.05, up to a maximum penalty of 0.30 (reached at 6 flags).

**Cascade Penalties on Ban**:

When a user is banned, penalties propagate up the invite chain:

| Level | Relationship | Penalty | With Trusted Room Dampening (0.5x) |
|-------|-------------|---------|-------------------------------------|
| 1 | Direct inviter | -0.15 | -0.075 |
| 2 | Inviter's inviter | -0.08 | -0.04 |
| 3 | Three levels up | -0.04 | -0.02 |

The maximum cascade depth is 3 levels. Each affected user's score is floored at 0.

**Invite Revocation**: If a user's trust score falls below 0.40 as a result of cascade penalties, their invite privileges are automatically revoked (`can_invite = false`).

**Trust Distribution Categories** (used for platform statistics):
- Trusted: score >= 0.80
- Caution: score >= 0.50 and < 0.80
- Warning: score > 0.30 and < 0.50
- Danger: score <= 0.30

---

### Section VIII: Community Flagging

Users can flag suspicious accounts to contribute to community self-moderation:

1. **Flag Creation**: Any user can flag another user with a reason string. Self-flagging is prevented. A cooldown of 24 hours is enforced per flagger-target pair to prevent spam.

2. **Auto-Restriction Threshold**: When a user accumulates 5 or more unresolved flags, the system automatically:
   - Revokes their invite privileges (`can_invite = false`)
   - Reduces their trust score by 0.10 (floored at 0)

3. **Flag Resolution**: Administrators can resolve flags, removing them from the unresolved count and potentially restoring the user's trust score on the next recalculation.

---

### Section IX: Scam Detection Engine

Referring now to FIG. 6 and FIG. 7, the scam detection engine provides real-time message scanning:

1. **Pattern Matching**: Each message's plaintext hint (provided by the client alongside the encrypted payload) is scanned against all active scam patterns using case-insensitive regex matching. Patterns are cached in memory with a 60-second TTL to minimize database queries.

2. **Severity Classification**: Each pattern is assigned one of four severity levels with associated weights:

   | Severity | Weight | Example Patterns |
   |----------|--------|-----------------|
   | CRITICAL | 0.40 | Seed Phrase Request, Private Key Request, 12/24 Word Request, Investment Doubling, Guaranteed Returns |
   | HIGH | 0.25 | Crypto Transfer Request, Wallet Connection Request, Suspicious Link Sharing |
   | MEDIUM | 0.15 | Urgency Pressure, Trust Manipulation, Authority Impersonation |
   | LOW | 0.05 | Screen Share Request, QR Code Request |

3. **Composite Score Calculation**:
   ```
   compositeScore = min(1.0, sum(matchedSeverityWeights))
   ```
   Multiple pattern matches accumulate additively, capped at 1.0.

4. **Auto-Restriction**: When the composite score reaches or exceeds 0.60:
   - The sender's trust score is reduced by 0.15 (floored at 0)
   - The sender's invite privileges are revoked (`can_invite = false`)
   - The event is recorded in the `scam_auto_restrict_events` table
   - The sender is **not** notified of the restriction (to prevent evasion)

5. **Recipient-Only Alerts**: Scam alerts are created exclusively for the message recipient. The sender never sees these alerts. Each alert includes the pattern name, severity, matched text excerpt (truncated to 100 characters), and a descriptive alert message explaining the risk.

6. **Alert Management**: Recipients can view and dismiss alerts. Alerts track whether they have been shown to the recipient and whether they have been dismissed.

7. **Pattern Administration**: Administrators can create, update, deactivate, and delete scam patterns. Built-in patterns (13 default patterns across 6 categories) can be deactivated but not deleted. All pattern changes are recorded in the `scam_pattern_audit` table.

8. **Pattern Statistics**: Administrators can view per-pattern alert counts (total, last 7 days, last 30 days) to assess pattern effectiveness.

---

### Section X: End-to-End Encrypted Messaging

Referring now to FIG. 8, all user messages are encrypted client-side using NaCl box authenticated public-key encryption:

**Key Types**:
- **Signing Keys**: ed25519 (used for identity verification, admin chain signatures, challenge-response)
- **Encryption Keys**: curve25519/X25519 (used for NaCl box message encryption)

**Key Derivation**: The client derives a curve25519 encryption keypair from the ed25519 signing identity by hashing the first 32 bytes (seed) of the ed25519 secret key and using the result as input to `nacl.box.keyPair.fromSecretKey()`.

**Sending Flow**:
1. Sender fetches the recipient's encryption public key: `GET /api/messages/keys/:userId`
2. Sender generates a random 24-byte nonce: `nacl.randomBytes(24)`
3. Sender encrypts: `nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey)`
4. Sender posts the encrypted envelope: `POST /api/messages/send { ciphertext, nonce, sender_public_key }`
5. Optionally, a plaintext `content` hint is included for cooling period and scam detection checks — this hint is **never stored** by the server
6. Server stores the encrypted envelope in the `messages` table
7. Server pushes the envelope to the recipient via WebSocket in real time

**Receiving Flow**:
1. WebSocket delivers `{ ciphertext, nonce, senderPublicKey }` to all of the recipient's connected devices
2. Client decrypts: `nacl.box.open(ciphertextBytes, nonceBytes, senderPublicKey, recipientSecretKey)`
3. If decryption succeeds, plaintext is displayed; if it fails (wrong key or tampered message), null is returned

**Encryption Primitive**: `nacl.box()` implements X25519 Diffie-Hellman key agreement followed by XSalsa20-Poly1305 authenticated encryption. This provides both confidentiality and integrity — the recipient can verify the message came from the claimed sender and has not been tampered with. This is **authenticated** public-key encryption (not anonymous/sealed box encryption).

**Server Role**: The server stores only encrypted envelopes (ciphertext + nonce + sender public key). It can relay messages, enforce cooling periods (on the plaintext hint), and run scam detection (on the plaintext hint), but it **never** stores or has access to the actual message plaintext.

---

### Section XI: Contact Cooling Periods

The cooling period system imposes a 72-hour restriction window when two users first interact:

1. **Contact Pair Tracking**: When User A sends a message to User B for the first time, a `contact_pairs` record is created with the current timestamp as `first_interaction`. The pair is normalized (lower UUID first) so (A,B) and (B,A) map to the same record.

2. **Cooling Window**: For 72 hours after `first_interaction`, the following content types are blocked in messages between the pair:
   - **Wallet Addresses**: Ethereum/EVM (0x...), Bitcoin legacy (1.../3...), Bitcoin bech32 (bc1...), Litecoin (L.../M...), Monero (4...), XRP (r...), Cardano (addr1...), Solana
   - **External Links**: HTTP/HTTPS URLs, www prefixes, and common TLD patterns (.com, .org, .net, .io, .xyz, .app, .dev, etc.)
   - **Seed Phrase Keywords**: "seed phrase", "recovery phrase/words/key", "mnemonic", "private key", "secret key", "wallet backup", "12-word/24-word", "master seed", "keystore file", "json key"

3. **Content Scanning**: The `checkMessageContent` function tests the message text against all blocked patterns using regex matching. The first match triggers a block.

4. **Block Response**: When content is blocked during cooling, the server returns a 403 response with:
   - The specific blocked category (wallet addresses, external links, seed keywords)
   - Hours remaining in the cooling period
   - The cooling expiry timestamp

5. **Block Event Logging**: Each blocked message is recorded in the `cooling_block_events` table for admin analytics and scam pattern analysis.

6. **Admin Bypass**: Administrators are exempt from cooling period restrictions, as they need to share links for legitimate support purposes.

7. **Manual Exemption**: Administrators can exempt specific contact pairs from cooling via `POST /api/messages/cooling/:contactUserId/exempt`, which backdates the first interaction to 73 hours ago.

8. **Allowed Content During Cooling**: Plain text messages, images, and voice messages are permitted during the cooling period. Only the high-risk content categories listed above are blocked.

---

### Section XII: Support Ticket System with Cryptographic Admin Verification

Referring now to FIG. 9, the support ticket system ensures all admin-user interactions occur within the bchat platform with cryptographic identity proof:

1. **Ticket Lifecycle**: Tickets progress through the following statuses:
   - `pending` — Newly created, awaiting admin assignment
   - `assigned` — An admin has claimed the ticket
   - `open` — Active conversation (schema default)
   - `resolved` — Issue addressed, pending user confirmation
   - `closed` — Ticket finalized

2. **Ticket Numbering**: Tickets are assigned sequential numbers from a PostgreSQL sequence starting at 1000, providing human-friendly reference numbers.

3. **Priority Queue**: Tickets are ordered by priority (urgent > high > normal > low) and then by age (oldest first) when presented to administrators.

4. **E2EE Ticket Messaging**: Messages within tickets use the same NaCl box encryption as regular messages. The `ticket_messages` table stores `ciphertext`, `nonce`, and `sender_public_key` columns. System messages (status changes, verification results) are stored as plaintext in the `system_message_text` column with `is_system_message = true`.

5. **Cryptographic Admin Verification** (Challenge-Response Protocol):
   - User clicks "Verify Admin" which triggers `POST /api/support/tickets/:id/verify`
   - Server generates a 32-byte random nonce via `crypto.randomBytes(32)`, encodes it as base64, and stores it in `ticket_verification_challenges` with a 5-minute expiry
   - Server expires any previous pending challenges for the same ticket
   - Admin signs the nonce with their ed25519 private key
   - Admin submits: `POST /api/support/tickets/:id/verify/confirm { challenge_id, signature }`
   - Server verifies the ed25519 signature against the admin's stored public key (`signing_public_key` or `identity_pubkey`)
   - If valid, ticket is marked `admin_verified = true` with a `verified_at` timestamp
   - A system message announces: "Admin identity VERIFIED. This admin's cryptographic signature has been confirmed."

6. **Audit Trail**: Every significant ticket action (creation, assignment, status change, priority change, verification request, verification result) is recorded in the `ticket_events` table with actor identity, event type, and detail text.

---

### Section XIII: Rate Limiting Architecture

The system implements a tiered rate limiting architecture to prevent abuse:

**Global Limit**: 60 requests per minute per IP address, applied to all endpoints.

**Endpoint-Specific Limits**:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth` | 10 requests | 15 minutes |
| `/api/admin` | 20 requests | 1 minute |
| `/api/trust` | 30 requests | 1 minute |
| `/api/scam` | 30 requests | 1 minute |
| `/api/messages` | 60 requests | 1 minute |
| `/api/support` | 20 requests | 1 minute |
| `/api/trusted-rooms` | 20 requests | 1 minute |

**Per-Action Limits**:

| Action | Limit | Window |
|--------|-------|--------|
| Message send | 30 | 1 minute |
| Support ticket creation | 5 | 1 hour |
| Ban action | 5 | 1 minute |

---

## Claims

1. A secure messaging system comprising:
   a server process hosting an Express API server, a WebSocket relay on the same HTTP server, and a Telegram bot;
   a PostgreSQL database storing users, devices, invite chains, trust scores, scam patterns, encrypted messages, support tickets, and audit logs;
   wherein user identity is established through randomly generated ed25519 signing keypairs using 32 cryptographically random bytes from the `@noble/ed25519` library;
   wherein all user-to-user messages are encrypted client-side using NaCl box authenticated public-key encryption (X25519 key exchange + XSalsa20-Poly1305) and the server stores and relays only encrypted envelopes.

2. The system of claim 1, wherein user onboarding requires:
   a verified Telegram join event recorded by the bot's `chat_member` handler;
   a homoglyph and impersonation check against existing administrator display names;
   generation of a random ed25519 signing keypair independent of any mnemonic seed phrase or HD wallet derivation;
   generation of a software-based device fingerprint computed as SHA-256 of the concatenation of platform, device model, OS version, application version, and optional hardware identifier.

3. The system of claim 1, wherein device binding uses software-based fingerprinting comprising:
   computation of a SHA-256 hash from concatenated device metadata fields separated by pipe characters;
   generation of a unique 32-byte random device identifier;
   device ban propagation upon user ban preventing account recreation from the same device.

4. The system of claim 1, further comprising a cryptographic admin verification chain wherein:
   a creator user's ed25519 public key serves as the root of trust;
   admin promotions are recorded as ed25519 signatures over payloads containing the target user ID, target public key, role, and timestamp;
   admin verification walks the signature chain backwards from the admin to the creator, verifying each ed25519 signature;
   admin revocation cascades to all downstream admins promoted by the revoked admin.

5. The system of claim 1, further comprising invite chain accountability wherein:
   each non-trusted-room user enters through a single-use invite code traceable to a specific inviter;
   when a user is banned, cascade penalties are applied to the invite chain with Level 1 penalty of 0.15, Level 2 penalty of 0.08, and Level 3 penalty of 0.04;
   cascade depth is limited to 3 levels;
   if a user's trust score falls below 0.40 as a result of cascade penalties, their invite privileges are automatically revoked.

6. The system of claim 1, further comprising a trust scoring engine that computes a score in the range [0, 1] using the formula:
   ```
   score = clamp(0, 1, 0.5 + ageFactor + activityFactor + inviteFactor - flagPenalty)
   ```
   where ageFactor = min(0.20, accountAgeDays / 180 * 0.20);
   where activityFactor = min(0.20, messagesIn30Days / 100 * 0.20);
   where inviteFactor = max(-0.20, ((goodInvites - badInvites * 3) / max(totalInvites, 1)) * 0.20);
   where flagPenalty = min(0.30, unresolvedFlagCount * 0.05).

7. The system of claim 1, further comprising trusted room auto-access wherein:
   an administrator designates a Telegram group or bchat conversation as a trusted room with a mandatory membership cutoff date;
   only users whose join timestamp precedes the cutoff date qualify for auto-access;
   qualified users receive a default trust score of 0.40 versus 0.50 for invite-code users;
   the room creator is assigned as the inviter for cascade accountability purposes.

8. The system of claim 7, wherein trusted rooms include safety mechanisms comprising:
   automatic room deactivation after 3 admitted members are banned;
   a 0.5x dampening factor applied to cascade penalties for users admitted via trusted rooms;
   configurable member caps (0 for unlimited);
   bot commands (`/trustroom enable`, `/trustroom disable`, `/trustroom status`) for Telegram-based management.

9. The system of claim 1, further comprising community flagging wherein:
   any user can flag another user with a rate limit of one flag per flagger-target pair per 24 hours;
   auto-restriction is triggered at 5 unresolved flags, revoking invite privileges and reducing trust score by 0.10.

10. The system of claim 1, further comprising a scam detection engine wherein:
    messages are scanned against admin-configurable regex patterns with four severity levels: CRITICAL (weight 0.40), HIGH (weight 0.25), MEDIUM (weight 0.15), and LOW (weight 0.05);
    a composite score is computed as the capped sum of matched severity weights;
    patterns are cached with a 60-second TTL.

11. The system of claim 10, wherein automatic sender restriction is triggered when the composite scam score equals or exceeds 0.60, comprising:
    reduction of the sender's trust score by 0.15;
    revocation of the sender's invite privileges;
    creation of scam alerts visible only to the message recipient;
    recording of the auto-restriction event without notifying the sender.

12. The system of claim 1, wherein NaCl box authenticated public-key encryption comprises:
    derivation of curve25519 encryption keypairs from ed25519 signing identities;
    encryption via `nacl.box(message, nonce, recipientPublicKey, senderSecretKey)` implementing X25519 key agreement followed by XSalsa20-Poly1305 authenticated encryption;
    random 24-byte nonce generation for each message;
    real-time delivery of encrypted envelopes via WebSocket push to all recipient devices.

13. The system of claim 1, further comprising contact cooling periods wherein:
    new contact pairs face a 72-hour restriction window;
    during the cooling period, wallet addresses (Ethereum, Bitcoin, Litecoin, Monero, XRP, Cardano, Solana formats), external links (HTTP/HTTPS URLs and common TLD patterns), and seed phrase keywords are blocked in messages;
    administrators are exempt from cooling restrictions;
    blocked events are logged for administrative analysis.

14. The system of claim 1, further comprising a support ticket system wherein:
    tickets progress through statuses: pending, assigned, open, resolved, closed;
    ticket messages use the same NaCl box E2EE as regular messages;
    users can request cryptographic admin identity verification via a challenge-response protocol using a 32-byte random nonce with 5-minute expiry;
    the admin signs the nonce with their ed25519 private key and the server verifies the signature;
    a full audit trail is maintained via ticket events.

15. The system of claim 1, further comprising anti-impersonation measures wherein:
    Unicode homoglyph characters (Cyrillic, Greek, common substitutions) are mapped to ASCII equivalents;
    Levenshtein distance similarity is computed between normalized display names;
    registration is blocked when similarity to an existing administrator name exceeds 0.75;
    a visual identity fingerprint in format `XX:YY:ZZ` (three hex byte pairs from SHA-256 of the public key) provides human-verifiable identity.

16. The system of claim 1, further comprising tiered rate limiting wherein:
    a global limit of 60 requests per minute per IP address is applied;
    endpoint-specific limits are applied per route (authentication: 10 per 15 minutes; admin: 20 per minute; trust and scam: 30 per minute; messages: 60 per minute; support and trusted rooms: 20 per minute);
    per-action limits further restrict message sends (30 per minute), ticket creation (5 per hour), and ban actions (5 per minute).

17. The system of claim 1, wherein the WebSocket relay operates on the same HTTP server via the `upgrade` event in `noServer` mode, authenticating connections via JWT verification during the HTTP upgrade handshake, maintaining a per-user connection registry supporting multiple simultaneous devices, and implementing a 30-second heartbeat cycle for stale connection detection.

---

## Figures

### FIG. 1 — System Architecture

```
+------------------------------------------------------------------+
|                        bchat Server (port 8080)                   |
|                                                                   |
|  +-------------------+    +-------------------+                   |
|  |   Express API     |    |  WebSocket Relay  |                   |
|  |                   |    |  (noServer mode)  |                   |
|  |  /api/auth        |    |                   |                   |
|  |  /api/invites     |    |  /ws?token=JWT    |                   |
|  |  /api/admin       |    |                   |                   |
|  |  /api/trust       |    |  Per-user socket  |                   |
|  |  /api/scam        |    |  registry (multi- |                   |
|  |  /api/messages    |    |  device support)  |                   |
|  |  /api/support     |    |                   |                   |
|  |  /api/trusted-    |    |  30s heartbeat    |                   |
|  |      rooms        |    |  (ping/pong)      |                   |
|  +--------+----------+    +---------+---------+                   |
|           |                         |                             |
|           |    HTTP upgrade         |                             |
|           +----------+--------------+                             |
|                      |                                            |
+----------------------|--------------------------------------------+
                       |
         +-------------+-------------+
         |                           |
+--------v--------+      +----------v----------+
|   PostgreSQL    |      |   Telegram Bot      |
|                 |      |   (Telegraf)        |
|  users          |      |                     |
|  devices        |      |  chat_member events |
|  invites        |      |  /invite command    |
|  admin_chain    |      |  /trustroom command |
|  messages (E2EE)|      |  /verify command    |
|  trust scores   |      |  /start deep links  |
|  scam_patterns  |      |                     |
|  support_tickets|      +---------------------+
|  trusted_rooms  |
|  audit_log      |       +---------------------+
+-----------------+       |   Client App        |
                          |   (React + NaCl)    |
                          |                     |
                          |  nacl.box() E2EE    |
                          |  ed25519 signing    |
                          |  curve25519 encrypt |
                          +---------------------+
```

### FIG. 2 — Identity Generation and Onboarding Flow

```
User joins Telegram channel/group
    |
    v
Bot chat_member handler records join event
    (telegram_join_events: telegram_user_id, username, first_name, joined_at)
    |
    v
[If group is a trusted room AND join date < cutoff]
    |-- YES --> Mark join event with "trusted::{room_id}" invite code
    |           Send DM: "You have auto-access"
    |-- NO  --> User needs invite code (via /start deep link)
    |
    v
User opens bchat web app
    |
    v
POST /api/auth/telegram { telegramUser, deviceInfo, inviteCode }
    |
    v
Server verifies telegram_join_events record exists
    |
    v
Homoglyph/impersonation check against admin names
    (Levenshtein similarity threshold: 0.75)
    |
    v
Generate random ed25519 keypair:
    privateKey = ed.utils.randomPrivateKey()     // 32 random bytes
    publicKey  = ed.getPublicKeyAsync(privateKey) // deterministic
    |
    v
Store identity_pubkey in users table
Set trust_score = 0.50 (invite) or 0.40 (trusted room)
    |
    v
Generate device fingerprint:
    SHA-256(platform | model | osVersion | appVersion | hardwareId)
    |
    v
Register device, issue JWT (7-day expiry)
    |
    v
Client generates nacl.box.keyPair() for E2EE
    |
    v
POST /api/messages/keys/register { encryption_public_key }
    |
    v
User is fully onboarded
```

### FIG. 3 — Admin Chain of Trust

```
Creator (root of trust)
    |-- Public key: pinned at initialization
    |-- Role: 'creator'
    |
    |-- Promotes Admin_Alice
    |     Payload: "alice_id|alice_pubkey|admin|2026-01-15T00:00:00Z"
    |     Signature: ed25519.sign(payload, creator_private_key)
    |     Stored in: admin_chain table
    |
    |-- Admin_Alice promotes Admin_Bob
    |     Payload: "bob_id|bob_pubkey|admin|2026-02-01T00:00:00Z"
    |     Signature: ed25519.sign(payload, alice_private_key)
    |
    |-- Verification of Admin_Bob:
          Walk chain backwards:
          Bob's record --> verify signature with Alice's pubkey --> VALID
          Alice's record --> verify signature with Creator's pubkey --> VALID
          Creator is root --> CHAIN VERIFIED

    |-- Revocation of Admin_Alice:
          Deactivate Alice's chain entry
          Cascade: deactivate Bob's chain entry (promoted by Alice)
          Both demoted to role 'user'
```

### FIG. 4 — Trusted Room Auto-Access Flow

```
Admin: /trustroom enable 2026-02-25
    |
    v
trusted_rooms record created:
    source_type = 'telegram'
    telegram_chat_id = <group_id>
    membership_cutoff = 2026-02-25T23:59:59.999Z
    default_trust_score = 0.40
    max_members = 0 (unlimited)
    is_active = true
    |
    v
User joins Telegram group --> bot records join event
    |
    v
Bot checks: is group a trusted room? user joined before cutoff?
    |
    YES --> Mark join event with "trusted::{room_id}" code
    |       DM user: "You have auto-access"
    NO  --> User needs regular invite code
    |
    v
User opens bchat, POST /api/auth/telegram
    |
    v
Auth route detects "trusted::" prefix on invite code
    |
    v
Verify: room active + join date < cutoff + within member cap
    |
    v
Create account:
    trust_score = 0.40
    admission_source = 'trusted_room'
    trusted_room_id = <room_id>
    invited_by = room creator (for cascade routing)
    |
    v
Record admission in trusted_room_admissions table
Increment room admitted_count

    --- SAFETY MECHANISMS ---

On user ban:
    Check if banned user has trusted_room_id
    Count banned users from same room
    If count >= 3 --> auto-deactivate room
        reason: "Auto-deactivated: too many banned members"

Cascade dampening:
    If banned user admission_source = 'trusted_room':
        cascade penalties *= 0.5
        Level 1: -0.15 * 0.5 = -0.075
        Level 2: -0.08 * 0.5 = -0.04
        Level 3: -0.04 * 0.5 = -0.02
```

### FIG. 5 — Trust Score Formula

```
Trust Score = clamp(0, 1, Base + AgeFactor + ActivityFactor + InviteFactor - FlagPenalty)

+-----------------+-----------------------------------------------------+-----------+
| Component       | Formula                                             | Range     |
+-----------------+-----------------------------------------------------+-----------+
| Base            | 0.50 (invite) or 0.40 (trusted room)                | 0.40-0.50 |
| AgeFactor       | min(0.20, accountAgeDays / 180 * 0.20)              | 0 to +0.20|
| ActivityFactor  | min(0.20, messagesIn30Days / 100 * 0.20)            | 0 to +0.20|
| InviteFactor    | max(-0.20, (good - bad*3) / max(total,1) * 0.20)   | -0.20..+0.20|
| FlagPenalty     | min(0.30, unresolvedFlags * 0.05)                   | 0 to -0.30|
+-----------------+-----------------------------------------------------+-----------+

Theoretical range: 0.00 to 1.00
Starting score:    0.50 (invite), 0.40 (trusted room)
Maximum score:     1.00 (0.50 + 0.20 + 0.20 + 0.20 - 0 = 1.10, clamped to 1.00)
Minimum score:     0.00 (floored)

Cascade Penalties on Ban:
+-------+----------------------+---------+---------------------------+
| Level | Relationship         | Penalty | With Trusted Room (x0.5)  |
+-------+----------------------+---------+---------------------------+
| 1     | Direct inviter       | -0.15   | -0.075                    |
| 2     | Inviter's inviter    | -0.08   | -0.04                     |
| 3     | Three levels up      | -0.04   | -0.02                     |
+-------+----------------------+---------+---------------------------+

Invite Revocation Threshold: score < 0.40
```

### FIG. 6 — Scam Detection Pipeline

```
User types message in client app
    |
    v
Client encrypts: nacl.box(plaintext, nonce, recipientPubKey, senderSecretKey)
    |
    v
POST /api/messages/send {
    ciphertext,         // base64 (stored by server)
    nonce,              // base64 (stored by server)
    sender_public_key,  // base64 (stored by server)
    content             // plaintext hint (NEVER stored, used for detection only)
}
    |
    v
Cooling period check (72h window for new contacts)
    |-- BLOCKED --> 403 with category + hours remaining
    |-- PASSED  --> continue
    |
    v
scanMessage(content, senderId, recipientId)
    Load active patterns from cache (60s TTL)
    |
    v
Test each pattern (case-insensitive regex):
    for pattern in activePatterns:
        if content.match(pattern.regex):
            record match with severity weight
    |
    v
Calculate composite score = sum(matched weights), cap at 1.0
    |
    v
If compositeScore >= 0.60:
    |-- Apply auto-restriction:
    |     trust_score -= 0.15 (floored at 0)
    |     can_invite = false
    |     Record in scam_auto_restrict_events
    |     (Sender is NOT notified)
    |
    v
Create scam_alerts for RECIPIENT only (one per matched pattern)
    |
    v
Store encrypted message envelope in messages table
Push to recipient via WebSocket { type: 'new_message', ciphertext, nonce, ... }
```

### FIG. 7 — Scam Pattern Kill Chain

```
+--------------------+---------------------------+----------+--------+
| Category           | Pattern Name              | Severity | Weight |
+--------------------+---------------------------+----------+--------+
| Seed Theft         | Seed Phrase Request        | CRITICAL | 0.40   |
| Seed Theft         | Private Key Request        | CRITICAL | 0.40   |
| Seed Theft         | 12/24 Word Request         | CRITICAL | 0.40   |
| Investment Fraud   | Investment Doubling        | CRITICAL | 0.40   |
| Investment Fraud   | Guaranteed Returns         | CRITICAL | 0.40   |
| Fund Theft         | Crypto Transfer Request    | HIGH     | 0.25   |
| Phishing           | Wallet Connection Request  | HIGH     | 0.25   |
| Phishing           | Suspicious Link Sharing    | HIGH     | 0.25   |
| Social Engineering | Urgency Pressure           | MEDIUM   | 0.15   |
| Social Engineering | Trust Manipulation         | MEDIUM   | 0.15   |
| Impersonation      | Authority Impersonation    | MEDIUM   | 0.15   |
| Social Engineering | Screen Share Request       | LOW      | 0.05   |
| Phishing           | QR Code Request            | LOW      | 0.05   |
+--------------------+---------------------------+----------+--------+

Auto-restriction threshold:  composite score >= 0.60
Auto-restriction penalty:    -0.15 trust score + invite revocation
Alert visibility:            recipient only (sender never sees)
Matched text truncation:     100 characters maximum
Pattern cache TTL:           60 seconds
```

### FIG. 8 — End-to-End Encrypted Message Flow

```
SENDING:
+------------------+                          +------------------+
|   Sender Client  |                          |   bchat Server   |
+------------------+                          +------------------+
        |                                              |
        |  1. GET /api/messages/keys/:recipientId      |
        |--------------------------------------------->|
        |  { encryptionPublicKey: base64 }             |
        |<---------------------------------------------|
        |                                              |
        |  2. Generate random 24-byte nonce            |
        |     nonce = nacl.randomBytes(24)             |
        |                                              |
        |  3. Encrypt with NaCl box                    |
        |     encrypted = nacl.box(                    |
        |       messageBytes,                          |
        |       nonce,                                 |
        |       recipientPubKey,   // curve25519       |
        |       senderSecretKey    // curve25519       |
        |     )                                        |
        |                                              |
        |  4. POST /api/messages/send                  |
        |     { ciphertext, nonce, sender_public_key } |
        |--------------------------------------------->|
        |                                              |
        |                               5. Store encrypted envelope
        |                               6. WebSocket push to recipient
        |                                              |

RECEIVING:
+------------------+                          +------------------+
| Recipient Client |                          |   bchat Server   |
+------------------+                          +------------------+
        |                                              |
        |  WebSocket: { type: 'new_message',           |
        |    ciphertext, nonce, senderPublicKey }       |
        |<---------------------------------------------|
        |                                              |
        |  Decrypt with NaCl box.open:                 |
        |  plaintext = nacl.box.open(                  |
        |    ciphertextBytes,                          |
        |    nonceBytes,                               |
        |    senderPublicKey,     // curve25519         |
        |    recipientSecretKey   // curve25519         |
        |  )                                           |
        |                                              |
        |  Display plaintext                           |

KEY TYPES:
  Signing:    ed25519        (identity, admin chain, challenge-response)
  Encryption: curve25519     (NaCl box, message E2EE)
  Primitive:  X25519 DH + XSalsa20-Poly1305 (authenticated encryption)
```

### FIG. 9 — Support Ticket Verification Flow

```
User creates ticket
    |
    v
status: 'pending', ticket_number from sequence (starting 1000)
priority: urgent | high | normal | low
    |
    v
Admin assigns self --> status: 'assigned'
System message: "A verified admin has joined this ticket."
    |
    v
[E2EE conversation between user and admin via ticket_messages]
    (ciphertext + nonce + sender_public_key, same NaCl box crypto)
    |
    v
User clicks "Verify Admin"
    |
    v
POST /api/support/tickets/:id/verify
    |
    v
Server generates challenge:
    nonce = crypto.randomBytes(32)   // 32 bytes
    nonceBase64 = nonce.toString('base64')
    expires_at = now + 5 minutes
    Expire any previous pending challenges for this ticket
    Store in ticket_verification_challenges
    |
    v
Challenge returned to admin client: { id, nonce, expiresAt }
    |
    v
Admin signs nonce with ed25519 private key:
    signature = ed25519.sign(nonceBytes, adminPrivateKey)
    |
    v
POST /api/support/tickets/:id/verify/confirm { challenge_id, signature }
    |
    v
Server verification:
    1. Fetch challenge (must be pending, not expired)
    2. Check expiry (< 5 minutes)
    3. Get admin's public key (signing_public_key or identity_pubkey)
    4. Verify: ed25519.verify(signature, nonceBytes, adminPubKey)
    |
    v
If valid:
    ticket.admin_verified = true
    ticket.verified_at = NOW()
    System message: "Admin identity VERIFIED. Cryptographic signature confirmed."
    Ticket event: "admin_verified"
    |
    v
User sees "Cryptographically Verified" badge on admin
```

---

## Abstract of the Disclosure

A secure messaging platform for cryptocurrency communities that prevents social engineering attacks through layered technical controls. The system requires Telegram-verified onboarding, generates random ed25519 signing keypairs for cryptographic identity, binds accounts to devices via SHA-256 software fingerprinting, enforces invite-chain accountability with three-level cascade penalties, provides trusted room auto-access with membership cutoff dates and automatic deactivation, computes trust scores using a four-factor formula (account age, message activity, invite quality, community flags), detects scam patterns across four severity levels with automatic sender restriction, encrypts all messages end-to-end using NaCl box authenticated public-key encryption, blocks high-risk content during 72-hour cooling periods for new contacts, detects impersonation via Unicode homoglyph mapping and Levenshtein distance, and provides in-app support with cryptographic admin identity verification via ed25519 challenge-response.
