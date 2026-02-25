#!/bin/sh
set -e

echo "[Entrypoint] Running database migrations..."
node dist/db/migrate.js

echo "[Entrypoint] Starting bchat server..."
exec node dist/app.js
