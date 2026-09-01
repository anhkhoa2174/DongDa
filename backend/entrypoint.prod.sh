#!/bin/sh
set -e
SCHEMA=src/infrastructure/database/prisma/schema.prisma

echo "⏳ prisma migrate deploy..."
npx prisma migrate deploy --schema=$SCHEMA

echo "🌱 seed (idempotent)..."
npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' \
  src/infrastructure/database/prisma/seed.ts || echo "⚠ Seed skipped/failed"

echo "🚀 node dist/main.js"
exec node dist/main.js
