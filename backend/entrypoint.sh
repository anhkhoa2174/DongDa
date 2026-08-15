#!/bin/sh
set -e

SCHEMA=src/infrastructure/database/prisma/schema.prisma

echo "⏳ Áp dụng migrations (prisma migrate deploy)..."
npx prisma migrate deploy --schema=$SCHEMA

echo "🔧 Generate Prisma client..."
npx prisma generate --schema=$SCHEMA

echo "🌱 Chạy seed (idempotent)..."
npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' \
  src/infrastructure/database/prisma/seed.ts || echo "⚠ Seed skipped/failed"

echo "🚀 Khởi động NestJS..."
exec npm run start:dev
