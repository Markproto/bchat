# X Shield — Start-to-Finish Setup Guide

A plain-English walkthrough to get X Shield running from scratch. No steps skipped.

---

## Step 1: Get Your Telegram Bot Token

You need a Telegram bot — this is how users log in and how X Shield verifies identities.

1. Open Telegram on your phone or desktop
2. Search for **@BotFather** (the one with the blue checkmark)
3. Tap **Start**, then type `/newbot`
4. BotFather asks for a **display name** — type something like `X Shield Bot`
5. BotFather asks for a **username** — type something like `xshield_security_bot` (must end in `bot`)
6. BotFather replies with a token that looks like this:
   ```
   123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
   ```
7. **Copy this token and save it somewhere** — you'll need it in Step 4

---

## Step 2: Create Your Telegram Channel and Get the Channel ID

This is the channel/group your community will join. X Shield uses it to verify that users are real.

### Create the channel:
1. In Telegram, tap the pencil/compose icon
2. Choose **New Channel** or **New Group**
3. Name it whatever you want (e.g., "My Community")
4. Make it public or private — either works

### Add your bot as an admin:
1. Go to the channel/group settings
2. Tap **Administrators** → **Add Admin**
3. Search for the bot username you created in Step 1 (e.g., `xshield_security_bot`)
4. Give it these permissions:
   - Read messages
   - Manage members
5. Save

### Get the Channel ID:
1. In Telegram, search for **@raw_data_bot**
2. Start a chat with it
3. Forward any message from your channel/group to @raw_data_bot
4. It will reply with a JSON block — look for the `"id"` field
5. It will be a negative number like `-1001234567890`
6. **Copy this number** — you'll need it in Step 4
7. You can remove @raw_data_bot from the channel after this

---

## Step 3: Set Up Your Server

You need a Linux server (Ubuntu 22.04 or 24.04 recommended). A $6/month DigitalOcean Droplet works fine.

### 3a. Bootstrap the server

SSH into your server as root:
```bash
ssh root@your-server-ip
```

Run the setup script (installs Docker, creates a deploy user, configures firewall):
```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/Markproto/bchat/main/deploy/setup-droplet.sh | bash
```

Or if you already have the repo cloned:
```bash
sudo bash deploy/setup-droplet.sh
```

### 3b. Clone the code

Switch to the deploy user and clone:
```bash
su - xshield
git clone https://github.com/Markproto/bchat /home/xshield/xshield
cd /home/xshield/xshield
```

---

## Step 4: Configure Environment Variables

This is where you plug in everything from Steps 1 and 2.

```bash
cp .env.production.example .env
nano .env
```

Fill in these values:

| Variable | Where to get it | Example |
|----------|----------------|---------|
| `TELEGRAM_BOT_TOKEN` | Step 1 — from BotFather | `123456789:ABCdefGHI...` |
| `TELEGRAM_CHANNEL_ID` | Step 2 — from @raw_data_bot | `-1001234567890` |
| `DB_PASSWORD` | Make one up (strong, random) | `xK9$mP2qR7vL4nB` |
| `JWT_SECRET` | Generate with the command below | 64-character hex string |
| `DOMAIN` | Your domain name | `shieldx.yourdomain.com` |
| `EMAIL` | Your email (for SSL certificate) | `you@email.com` |
| `CORS_ORIGIN` | Same as your domain with https:// | `https://shieldx.yourdomain.com` |

### Generate a JWT secret:
```bash
openssl rand -hex 32
```
Copy the output and paste it as your `JWT_SECRET`.

Save and close the file (in nano: `Ctrl+X`, then `Y`, then `Enter`).

---

## Step 5: Point Your Domain to the Server

1. Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
2. Add a **DNS A record**:
   - **Name/Host**: your subdomain (e.g., `shieldx`) or `@` for the root domain
   - **Value/Points to**: your server's IP address
   - **TTL**: Automatic or 300
3. Wait a few minutes for DNS to propagate

### Verify it's working:
```bash
ping shieldx.yourdomain.com
```
It should resolve to your server's IP.

---

## Step 6: Set Up SSL and Launch

### Get your SSL certificate:
```bash
cd /home/xshield/xshield
sudo bash deploy/init-letsencrypt.sh
```

This creates a free HTTPS certificate from Let's Encrypt. It auto-renews every 12 hours.

### Start everything:
```bash
docker compose up -d
```

This launches 4 services:
- **PostgreSQL** database
- **X Shield server** (API + WebSocket + Telegram bot)
- **Nginx** (serves the web app, handles HTTPS)
- **Certbot** (keeps your SSL certificate fresh)

### Verify it's running:
```bash
docker compose ps          # All services should show "Up"
docker compose logs -f     # Watch the logs (Ctrl+C to stop)
curl https://your-domain.com/health   # Should return OK
```

---

## Step 7: Open the App and Become the Creator (Root Admin)

This is the most important step. The first person to do this becomes the **root of trust** for the entire platform.

### 7a. Join your own Telegram channel
- Open Telegram and make sure you're a member of the channel/group you created in Step 2

### 7b. Open X Shield in your browser
- Go to `https://your-domain.com`
- Log in with your Telegram account
- The system verifies that you joined the Telegram channel

### 7c. Initialize yourself as Creator
After logging in, the app will prompt you to initialize as Creator (since no Creator exists yet).

What happens behind the scenes:
1. Your browser generates an **ed25519 signing keypair**
   - Private key stays on your device only
   - Public key gets sent to the server
2. The server checks that no Creator exists yet
3. You get promoted to `role = 'creator'` — the root admin
4. Your public key becomes the **root trust anchor** for the entire platform

**IMPORTANT**: Back up your private key. Go to your browser's Developer Tools → Application → Local Storage → look for `bchat_e2ee_keypair`. Save this somewhere safe (offline, encrypted). If you lose it, you can't promote new admins.

---

## Step 8: Generate Invite Codes and Bring in Users

Nobody can join X Shield without an invite.

### Generate an invite code:

**Option A — In the app:**
1. Go to Settings → Invite Codes
2. Click **Generate Code**
3. Copy the 8-character code (e.g., `a1b2c3d4`)
4. Send it to whoever you want to invite

**Option B — Via Telegram bot:**
1. Send `/invite` to your bot in Telegram
2. Bot replies with a code

### How your invitee joins:

1. You send them the invite code
2. They join your Telegram channel/group
3. They open `https://your-domain.com` in their browser
4. They enter their Telegram info + the invite code
5. The server checks:
   - Did they actually join the Telegram channel? (verified by the bot)
   - Is the invite code valid and unused?
   - Is their username too similar to an admin's? (anti-impersonation)
6. Account created — they're in with a starting trust score of 0.50

---

## Step 9: Promote Admins (Optional)

If you need help managing the platform, you can promote trusted users to admin.

1. In the app, find the user you want to promote
2. The promotion requires you to **cryptographically sign** a statement vouching for them
3. This signature is stored permanently — creating a verifiable chain of trust back to you (the Creator)

Admins can:
- Manage support tickets
- Ban malicious users
- Create/edit scam detection patterns
- Exempt contacts from cooling periods
- Generate invite codes regardless of trust score

---

## Step 10: Set Up a Trusted Room (Optional)

If you have an existing Telegram group with members you trust, you can give them auto-access to X Shield without individual invite codes.

In the Telegram group, send:
```
/trustroom enable 2026-03-01
```

Replace the date with a **cutoff date** — only members who joined the group **before** this date get auto-access. This prevents people from joining the group after the fact just to get in.

Trusted room users start with a slightly lower trust score (0.40 vs 0.50) since nobody personally vouched for them.

---

## Troubleshooting

### "Docker compose says service is unhealthy"
```bash
docker compose logs db       # Check if PostgreSQL started
docker compose logs server   # Check for connection errors
```
Usually it's a wrong `DB_PASSWORD` in `.env`.

### "Bot isn't recording joins"
- Make sure the bot is an **admin** in the channel with "Manage members" permission
- Check that `TELEGRAM_CHANNEL_ID` in `.env` matches the actual channel ID (including the minus sign)

### "SSL certificate failed"
- Make sure your domain's DNS A record points to the server IP
- Make sure ports 80 and 443 are open: `sudo ufw status`
- Try again: `sudo bash deploy/init-letsencrypt.sh`

### "Can't log in / Telegram auth fails"
- Make sure `TELEGRAM_BOT_TOKEN` in `.env` is correct
- Restart the server: `docker compose restart server`

### View logs
```bash
docker compose logs -f              # All services
docker compose logs -f server       # Just the API server
docker compose logs -f nginx        # Just nginx
```

### Restart everything
```bash
docker compose down && docker compose up -d
```

---

## Quick Reference

| What | Command / Location |
|------|-------------------|
| Start all services | `docker compose up -d` |
| Stop all services | `docker compose down` |
| View logs | `docker compose logs -f` |
| Restart a service | `docker compose restart server` |
| Check health | `curl https://your-domain.com/health` |
| Generate invite (Telegram) | Send `/invite` to your bot |
| Enable trusted room | `/trustroom enable YYYY-MM-DD` in the group |
| Check trusted room status | `/trustroom status` in the group |
| Disable trusted room | `/trustroom disable` in the group |
| Back up your Creator key | Browser → Dev Tools → Application → Local Storage → `bchat_e2ee_keypair` |
