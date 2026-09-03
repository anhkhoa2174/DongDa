# ── Production image ───────────────────────────────────────
# Prisma cần OpenSSL; tesseract + vie/eng + poppler: OCR Journal WU/MG dạng PDF scan.
FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat \
    tesseract-ocr tesseract-ocr-data-vie tesseract-ocr-data-eng poppler-utils

WORKDIR /app

COPY package*.json ./
COPY src/infrastructure/database/prisma ./src/infrastructure/database/prisma
# --include=dev: devDependencies vẫn cần để build (tsc/nest) và chạy seed (ts-node),
# kể cả khi NODE_ENV=production (đặt sau bước install để npm không bỏ qua devDeps)
RUN npm install --no-audit --no-fund --include=dev
ENV NODE_ENV=production

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate --schema=src/infrastructure/database/prisma/schema.prisma \
 && npm run build

COPY entrypoint.prod.sh ./
RUN chmod +x entrypoint.prod.sh

EXPOSE 3000
ENTRYPOINT ["./entrypoint.prod.sh"]
