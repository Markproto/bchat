#!/bin/sh
set -e

echo "[Entrypoint] Running database migrations..."
node dist/db/migrate.js

echo "[Entrypoint] Starting X Shield server..."
exec node dist/app.js
