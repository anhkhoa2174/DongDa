#!/bin/sh
set -e
SCHEMA=src/infrastructure/database/prisma/schema.prisma

echo "⏳ prisma migrate deploy..."
npx prisma migrate deploy --schema=$SCHEMA

if [ "${RUN_SEED_ON_STARTUP:-false}" = "true" ]; then
  echo "🌱 seed (RUN_SEED_ON_STARTUP=true)..."
  npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' \
    src/infrastructure/database/prisma/seed.ts
else
  echo "⏭️ seed skipped (set RUN_SEED_ON_STARTUP=true to enable)"
fi

echo "🚀 node dist/main.js"
exec node dist/main.js
