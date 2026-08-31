# Deploy DongDa lên VPS

- VPS: 103.90.227.63 (Ubuntu 22.04) — Docker + Caddy + GitHub Actions self-hosted runner (service `actions.runner.*`, user `deploy`).
- Push lên `main` (hoặc bấm Run workflow) → runner trên VPS tự build FE + image backend, `docker compose up -d --build`, chạy migration + seed, healthcheck.
- Thư mục trên VPS: `/srv/dongda` gồm `src/` (code), `www/` (FE đã build), `docker-compose.yml`, `Caddyfile`, `.env`.

## /srv/dongda/.env (tạo tay 1 lần, KHÔNG commit)
```
DB_PASSWORD=<mật khẩu Postgres mạnh>
JWT_SECRET=<chuỗi ngẫu nhiên ≥32 ký tự>
JWT_REFRESH_SECRET=<chuỗi ngẫu nhiên ≥32 ký tự>
JWT_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://dongda.name.vn
GEMINI_API_KEY=<key đọc ảnh tỷ giá, bỏ trống nếu chưa dùng>
GEMINI_MODEL=gemini-2.5-flash
```

## DNS
Vietnix → Quản lý tên miền → bản ghi A: `dongda.name.vn → 103.90.227.63`. Caddy tự xin SSL sau khi DNS trỏ đúng. Chưa có DNS vẫn vào được qua `http://103.90.227.63`.

## Lệnh hay dùng trên VPS
```
cd /srv/dongda
docker compose ps
docker compose logs -f backend
docker compose restart backend
# backup tay: docker compose exec db pg_dump -U postgres dongda_db | gzip > /srv/backups/manual.sql.gz
```
Backup tự động: cron 02:00 hằng ngày → /srv/backups (giữ 7 bản).
