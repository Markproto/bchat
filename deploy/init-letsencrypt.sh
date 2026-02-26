#!/bin/bash
# =============================================================================
# init-letsencrypt.sh — First-time SSL certificate provisioning
#
# Solves the chicken-and-egg problem: nginx needs certs to start on 443,
# but certbot needs nginx running to complete the ACME HTTP-01 challenge.
#
# What this script does:
#   1. Creates a dummy self-signed certificate so nginx can start
#   2. Starts nginx + certbot containers
#   3. Requests a real Let's Encrypt certificate (overwrites dummy)
#   4. Reloads nginx to pick up the real certificate
#
# Usage:
#   cd /home/bchat/bchat
#   sudo bash deploy/init-letsencrypt.sh
#
# Prerequisites:
#   - .env file with DOMAIN and EMAIL set
#   - DNS A record pointing DOMAIN to this server's IP
#   - Ports 80 and 443 open
# =============================================================================
set -e

# Load environment variables
if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.production.example to .env and configure it."
  exit 1
fi
source .env

if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "your-domain.com" ]; then
  echo "Error: Set DOMAIN in .env to your actual domain name."
  exit 1
fi

if [ -z "$EMAIL" ] || [ "$EMAIL" = "your-email@example.com" ]; then
  echo "Error: Set EMAIL in .env for Let's Encrypt registration."
  exit 1
fi

CERT_NAME="bchat"
DATA_PATH="certbot-conf"  # Docker volume name

echo "=== bchat SSL Certificate Setup ==="
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

# Step 1: Create dummy certificate so nginx can start
echo "[1/5] Creating dummy certificate..."
docker compose run --rm --entrypoint "\
  mkdir -p /etc/letsencrypt/live/$CERT_NAME && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$CERT_NAME/privkey.pem \
    -out /etc/letsencrypt/live/$CERT_NAME/fullchain.pem \
    -subj '/CN=localhost'" certbot
echo "  Done."

# Step 2: Start nginx (it can now start with the dummy cert)
echo "[2/5] Starting nginx..."
docker compose up -d nginx
echo "  Waiting for nginx to be ready..."
sleep 5

# Step 3: Request real certificate from Let's Encrypt
# (dummy cert stays in place so nginx keeps running; --force-renewal overwrites it)
echo "[3/5] Requesting Let's Encrypt certificate..."
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --cert-name $CERT_NAME \
    -d $DOMAIN \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot
echo "  Done."

# Step 4: Reload nginx to use the real certificate
echo "[4/5] Reloading nginx..."
docker compose exec nginx nginx -s reload
echo "  Done."

echo ""
echo "=== SSL setup complete! ==="
echo "Your site should now be accessible at: https://$DOMAIN"
echo ""
echo "To start all services:  docker compose up -d"
echo "To view logs:           docker compose logs -f"
