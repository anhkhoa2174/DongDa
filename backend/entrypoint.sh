#!/bin/sh
set -e

SCHEMA=src/infrastructure/database/prisma/schema.prisma

echo "⏳ Sync Prisma schema (db push)..."
npx prisma db push --schema=$SCHEMA --skip-generate

echo "🔧 Generate Prisma client..."
npx prisma generate --schema=$SCHEMA

echo "🌱 Chạy seed (idempotent)..."
npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' \
  src/infrastructure/database/prisma/seed.ts || echo "⚠ Seed skipped/failed"

echo "🚀 Khởi động NestJS..."
exec npm run start:dev
