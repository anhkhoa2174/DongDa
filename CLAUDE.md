# CLAUDE.md — DongDa

Hệ thống quản lý quỹ & giao dịch **Western Union / MoneyGram** đa chi nhánh cho
Công ty Đống Đa: thay thế Excel/sổ giấy/Zalo bằng web app tập trung (quản lý quỹ,
WU/MG, mua bán ngoại tệ, tiếp quỹ, đối chiếu, báo cáo, audit).

## Monorepo

| Thư mục | Stack | Chi tiết |
|---|---|---|
| `backend/`  | NestJS + Prisma + PostgreSQL | Clean/Hexagonal architecture — xem `backend/CLAUDE.md` |
| `frontend/` | React + Ant Design + Vite | Feature-modular architecture — xem `frontend/CLAUDE.md` |

## Chạy dev

```bash
cd backend && docker compose up -d --build   # DB :5435, backend :3000 (tự migrate + seed)
cd frontend && npm install && npm run dev     # FE :5173 (proxy /api → :3000)
```

Seed admin mặc định: `admin` / `Admin@123456` (đổi ngay).

## Quy ước bất biến (từ requirements — áp dụng CẢ BE lẫn FE)

Đây là các ràng buộc nghiệp vụ cốt lõi, **không được vi phạm**:

1. **Không XÓA giao dịch** — chỉ UPDATE có kiểm soát (bắt buộc nhập lý do) hoặc
   deactivate. Không có endpoint/nút DELETE cho dữ liệu nghiệp vụ.
2. **Snapshot tỷ giá** — mỗi giao dịch lưu tỷ giá tại thời điểm phát sinh; tỷ giá
   mới KHÔNG ảnh hưởng giao dịch cũ. Báo cáo lịch sử dùng snapshot.
3. **Audit Log append-only** — mọi thao tác tiền/tỷ giá/ca ghi log (before/after,
   user, time), giữ ≥ 5 năm. Không sửa/xóa log.
4. **Truy vết nguồn** — mọi biến động quỹ phải truy về giao dịch nguồn.
5. **Cô lập chi nhánh** — chi nhánh chỉ thấy dữ liệu của mình. Enforce ở **backend**
   (không tin frontend). Xem `canAccessBranch`.
6. **Ca làm việc** — WU/MG/ngoại tệ/chuyển tiền phải thuộc 1 ca đang mở của 1 chi
   nhánh. Back-office (tiếp quỹ, ngân hàng) không cần ca.

## Vai trò

`ADMIN` (toàn quyền) · `MANAGER` (KTTH / trưởng CN) · `STAFF` (nhân viên CN) ·
`AUDITOR` (read-only). Xem `backend/src/domain/entities/user.entity.ts` là nguồn
sự thật cho role → permission.

## Git flow

- `main` = ổn định. `develop` = tích hợp. Feature branch: `feat/<tên>`.
- Commit message tiếng Việt, prefix kiểu conventional (`feat:`, `fix:`, `chore:`).
- **SSH:** repo này thuộc `anhkhoa2174` → dùng host `github.com` mặc định
  (KHÔNG phải `github.com-pocket`).

## Tài liệu nghiệp vụ

Ở thư mục cha `../`: `DongDa_v2.0.docx` (requirements mới nhất),
`dongda_v3_*` (thiết kế DB đang review), sổ Excel thật của CN Nguyễn Cư Trinh.
Khi nghiệp vụ chưa rõ (vd Paid Currency, cent lẻ USD) → HỎI, đừng tự bịa.
