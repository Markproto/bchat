#!/bin/bash
# =============================================================================
# init-letsencrypt.sh — First-time SSL certificate provisioning
#
# Solves the chicken-and-egg problem: nginx needs certs to start on 443,
# but certbot needs nginx running to complete the ACME HTTP-01 challenge.
#
# What this script does:
#   1. Cleans up any stale certificate state
#   2. Creates a dummy self-signed certificate so nginx can start
#   3. Starts nginx
#   4. Requests a real Let's Encrypt certificate (overwrites dummy)
#   5. Reloads nginx to pick up the real certificate
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

echo "=== bchat SSL Certificate Setup ==="
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

# Step 1: Stop nginx and clean up any stale cert state
echo "[1/5] Cleaning up..."
docker compose stop nginx 2>/dev/null || true
docker compose run --rm --entrypoint "sh" certbot -c "\
  rm -rf /etc/letsencrypt/live/$CERT_NAME && \
  rm -rf /etc/letsencrypt/archive/$CERT_NAME && \
  rm -rf /etc/letsencrypt/renewal/$CERT_NAME.conf"
echo "  Done."

# Step 2: Create dummy certificate so nginx can start
echo "[2/5] Creating dummy certificate..."
docker compose run --rm --entrypoint "sh" certbot -c "\
  mkdir -p /etc/letsencrypt/live/$CERT_NAME && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$CERT_NAME/privkey.pem \
    -out /etc/letsencrypt/live/$CERT_NAME/fullchain.pem \
    -subj '/CN=localhost'"
# Verify the dummy cert was actually created
docker compose run --rm --entrypoint "sh" certbot -c "\
  test -f /etc/letsencrypt/live/$CERT_NAME/fullchain.pem || (echo 'ERROR: dummy cert not created!' && exit 1)"
echo "  Done."

# Step 3: Start nginx (it can now start with the dummy cert)
echo "[3/5] Starting nginx..."
docker compose up -d nginx
echo "  Waiting for nginx to be ready..."
sleep 5
# Verify nginx is actually running (not crash-looping)
if ! docker compose exec nginx nginx -t 2>/dev/null; then
  echo "ERROR: nginx failed to start. Check: docker compose logs nginx"
  exit 1
fi
echo "  nginx is ready."

# Step 4: Request real certificate from Let's Encrypt
echo "[4/5] Requesting Let's Encrypt certificate..."
docker compose run --rm --entrypoint "sh" certbot -c "\
  certbot certonly --webroot -w /var/www/certbot \
    --cert-name $CERT_NAME \
    -d $DOMAIN \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --force-renewal"
echo "  Done."

# Step 5: Reload nginx to use the real certificate
echo "[5/5] Reloading nginx..."
docker compose exec nginx nginx -s reload
echo "  Done."

echo ""
echo "=== SSL setup complete! ==="
echo "Your site should now be accessible at: https://$DOMAIN"
echo ""
echo "To start all services:  docker compose up -d"
echo "To view logs:           docker compose logs -f"
