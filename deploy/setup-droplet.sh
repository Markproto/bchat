#!/bin/bash
# =============================================================================
# setup-droplet.sh — Bootstrap a fresh Ubuntu 22.04/24.04 DigitalOcean Droplet
#
# What this script does:
#   1. Updates the system
#   2. Installs Docker + Docker Compose
#   3. Sets up a non-root deploy user
#   4. Configures the firewall (UFW)
#   5. Clones the repo and prepares the environment
#
# Usage (as root on a fresh Droplet):
#   curl -fsSL https://raw.githubusercontent.com/<your-org>/bchat/main/deploy/setup-droplet.sh | bash
#
#   Or copy the script to the server and run:
#   chmod +x setup-droplet.sh && sudo ./setup-droplet.sh
#
# After this script completes, follow the instructions it prints.
# =============================================================================
set -e

DEPLOY_USER="bchat"
REPO_DIR="/home/$DEPLOY_USER/bchat"

echo "=========================================="
echo "  bchat Droplet Setup"
echo "=========================================="
echo ""

# Must run as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Run this script as root (sudo)."
  exit 1
fi

# ---- Step 1: System update ----
echo "[1/5] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
echo "  Done."

# ---- Step 2: Install Docker ----
echo "[2/5] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "  Docker installed."
else
  echo "  Docker already installed."
fi

# Verify Docker Compose (bundled with modern Docker)
if ! docker compose version &> /dev/null; then
  echo "Error: Docker Compose plugin not found. Install it manually."
  exit 1
fi
echo "  Docker Compose: $(docker compose version --short)"

# ---- Step 3: Create deploy user ----
echo "[3/5] Setting up deploy user '$DEPLOY_USER'..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
  echo "  User '$DEPLOY_USER' created and added to docker group."
else
  usermod -aG docker "$DEPLOY_USER"
  echo "  User '$DEPLOY_USER' already exists, added to docker group."
fi

# ---- Step 4: Firewall ----
echo "[4/5] Configuring firewall..."
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (for ACME challenges + redirect)
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo "  Firewall enabled: SSH (22), HTTP (80), HTTPS (443)."

# ---- Step 5: Prepare deployment directory ----
echo "[5/5] Preparing deployment directory..."
if [ ! -d "$REPO_DIR" ]; then
  mkdir -p "$REPO_DIR"
  echo "  Created $REPO_DIR"
  echo "  You'll need to clone or copy the bchat code here."
else
  echo "  $REPO_DIR already exists."
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$REPO_DIR"

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Clone the repo (as the bchat user):"
echo "     su - $DEPLOY_USER"
echo "     git clone <your-repo-url> $REPO_DIR"
echo "     cd $REPO_DIR"
echo ""
echo "  2. Create the .env file:"
echo "     cp .env.production.example .env"
echo "     nano .env   # fill in your secrets"
echo ""
echo "  3. Point your domain's DNS A record to this server's IP:"
echo "     $(curl -s ifconfig.me 2>/dev/null || echo '<your-server-ip>')"
echo ""
echo "  4. Set up SSL and start the app:"
echo "     sudo bash deploy/init-letsencrypt.sh"
echo "     docker compose up -d"
echo ""
echo "  5. Verify it's running:"
echo "     docker compose ps"
echo "     docker compose logs -f"
echo "     curl https://your-domain.com/health"
echo ""
