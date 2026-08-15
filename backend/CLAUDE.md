# CLAUDE.md — Backend (NestJS)

Clean / Hexagonal Architecture. Đọc kỹ trước khi thêm code — giữ đúng layer.

## Kiến trúc 4 layer

```
src/
├── domain/           ← Trong cùng. KHÔNG phụ thuộc gì (không import NestJS/Prisma)
│   ├── entities/         *.entity.ts — model + logic nghiệp vụ thuần (hasPermission…)
│   └── repositories/     *.repository.ts — INTERFACE (port), tên IXxxRepository
├── application/      ← Use-case. Phụ thuộc domain qua interface
│   ├── use-cases/        *.use-case.ts — 1 class / 1 use-case, method execute()
│   └── dtos/             *.dto.ts — input/output shape
├── infrastructure/   ← Adapter. Hiện thực các port
│   ├── database/         prisma.service.ts, prisma/schema.prisma, repositories/prisma-*.repository.ts
│   └── config/           *.service.ts (hash.service…)
└── interfaces/       ← Ngoài cùng. HTTP
    └── http/             controllers/*.controller.ts, guards/*.guard.ts, jwt.strategy.ts
```

**Chiều phụ thuộc:** `interfaces → application → domain ← infrastructure`.
Domain là trung tâm, không biết gì về framework. Application chỉ gọi domain qua
**interface**, không import class hiện thực.

## Dependency Injection — dùng string token

Interface được bind với hiện thực trong `app.module.ts`:

```ts
{ provide: 'IUserRepository', useClass: PrismaUserRepository },
{ provide: 'IHashService',   useClass: HashService },
{ provide: 'IJwtService',     useFactory: ... },
```

Use-case inject bằng token:

```ts
constructor(@Inject('IUserRepository') private readonly userRepo: IUserRepository) {}
```

→ Thêm 1 nghiệp vụ mới: (1) định nghĩa interface ở `domain/repositories`,
(2) viết use-case ở `application/use-cases` phụ thuộc interface, (3) hiện thực ở
`infrastructure`, (4) bind token + khai báo controller trong `app.module.ts`.

## Quy ước đặt tên file

`*.entity.ts` · `*.repository.ts` (interface) · `prisma-*.repository.ts` (impl) ·
`*.use-case.ts` (class `XxxUseCase`) · `*.dto.ts` · `*.controller.ts` ·
`*.guard.ts` · `*.service.ts`. Class DI token: `I` + PascalCase.

## Phân quyền

`domain/entities/user.entity.ts` là nguồn sự thật:
- `UserRole` enum, `GLOBAL_ROLES` (ADMIN/AUDITOR — không cần branchId) vs
  `BRANCH_ROLES` (MANAGER/STAFF).
- Permission dạng `resource:action` (vd `transaction:create`), map trong
  `ROLE_PERMISSIONS`. ADMIN = `['*']`.
- Check quyền: `hasPermission(user, perm)`, `canAccessBranch(user, branchId)`.
- JWT access token chứa sẵn `role` + `branchId` → guard check không cần query DB.

## Bảo mật (đã cấu hình ở main.ts — giữ nguyên)

helmet · compression · `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`
· CORS chỉ cho `FRONTEND_URL` · ThrottlerGuard toàn cục · prefix `api/v1` ·
JWT tách secret access/refresh · bcrypt hash · login KHÔNG phân biệt
"sai user" vs "sai mật khẩu" (chống user enumeration).

## Database — Prisma migrations (KHÔNG dùng db push)

- Schema: `src/infrastructure/database/prisma/schema.prisma`
- Đổi schema → tạo migration:
  `npx prisma migrate dev --name <tên> --schema=src/infrastructure/database/prisma/schema.prisma`
- `entrypoint.sh` chạy `prisma migrate deploy` + `prisma generate` + seed khi container lên.
- **Commit thư mục `migrations/`.** `.env` bị gitignore — mỗi máy tự tạo từ `.env.example`.
- Enum Prisma `UserRole` phải khớp `domain/entities/user.entity.ts`.

## Nguyên tắc nghiệp vụ (xem thêm ../CLAUDE.md)

- **Không xóa** — repository có `deactivate()`, không có `delete()`.
- Enforce cô lập chi nhánh ở backend (đừng tin FE).
- Giao dịch nghiệp vụ → phải post vào ledger (theo thiết kế v3) + ghi audit.
