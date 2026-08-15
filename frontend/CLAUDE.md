# CLAUDE.md — Frontend (React + Vite)

Feature-modular architecture (bounded context / module). Giữ mỗi nghiệp vụ gọn
trong 1 module, dùng chung qua `shared/`.

## Stack

React + TypeScript · **Ant Design** (UI) · **Tailwind v4** (`@tailwindcss/vite`) ·
**TanStack Query** (server state) + **TanStack Table** · **react-hook-form + zod**
(form/validate) · **zustand** (client state) · **react-router-dom** · dayjs (locale
`vi`) · recharts · axios. Path alias `@/` → `src/`. Dev port 5173, proxy `/api` → `:3000`.

## Cấu trúc

```
src/
├── app/          ← Khung ứng dụng (không chứa nghiệp vụ)
│   ├── providers/    AppProviders + context (auth, config, mock, notifications, permissions, theme)
│   ├── router/       AppRouter.tsx, moduleRoutes.ts (gom route mọi module)
│   ├── guards/       AuthGuard.tsx
│   └── layouts/      AppLayout.tsx
├── modules/<name>/   ← 1 module / 1 nghiệp vụ (bounded context)
│   ├── pages/        XxxPage.tsx
│   ├── routes.tsx    export const xxxRoutes = [...]
│   ├── data/         *.mock.ts (dữ liệu giả — hiện tại chưa nối API)
│   ├── model/        *.types.ts, *.store.ts (zustand), *.schema.ts (zod)
│   ├── components/    UI riêng của module
│   └── guards/        guard riêng (vd TransactionAccessGuard)
└── shared/       ← Dùng chung mọi module
    ├── components/   PageScaffold.tsx …
    ├── utils/        formatters.ts (formatVnd, formatUsd, formatExchangeRate)
    ├── api/          httpClient.ts (axios)
    ├── hooks/        usePageTitle …
    ├── config/       runtime.ts
    └── constants/    navigation.tsx
```

**Nguyên tắc:** module KHÔNG import chéo bừa bãi; thứ dùng chung → đưa lên `shared/`.
`app/` và `shared/` không chứa logic nghiệp vụ cụ thể.

## Thêm 1 module mới (checklist)

1. Tạo `modules/<name>/` với `pages/`, `routes.tsx`, (tùy) `data/`, `model/`.
2. `routes.tsx` export `xxxRoutes` (mảng `RouteObject`).
3. Đăng ký vào `app/router/moduleRoutes.ts` (import + spread `...xxxRoutes`).
4. Thêm mục vào `shared/constants/navigation.tsx` nếu cần hiện trên sidebar.
5. Trang mới: bọc bằng `<PageScaffold title description moduleName>`.

## Form giao dịch — config-driven (QUAN TRỌNG)

WU / MG / mua-bán ngoại tệ / chuyển tiền KHÔNG viết form riêng. Dùng chung engine
`modules/transactions/components/TransactionWorkspacePage` — mỗi trang chỉ khai báo
mảng `TransactionField[]` (kind: text/number/select/segmented/slider…). Ví dụ mẫu:
`modules/western-union/pages/WesternUnionTransactionsPage.tsx`. Thêm loại giao dịch
mới → tái sử dụng engine này, đừng dựng form từ đầu.

## Phân quyền (FE)

`modules/auth/model/permissions.ts`: type `Permission` dạng `resource.action`
(vd `transaction.create`), map sang permission backend (`resource:action`) qua
`backendPermissionMap`, và `rolePermissions` theo `AppRole`. Dùng hook
`usePermission()` để ẩn/hiện UI. **Nhớ:** phân quyền FE chỉ để UX — bảo mật thật
enforce ở backend.

## Providers & data fetching

Thứ tự bọc trong `AppProviders`: Config → ErrorBoundary → QueryClient → Theme →
AntApp → Auth → Permission → Notification → Mock → Suspense. Query mặc định:
`staleTime 30s`, không refetch khi focus, `retry 1`. Router: route public
(`/login`, `/forgot-password`, `/two-factor`) + phần còn lại bọc `AuthGuard` trong
`AppLayout`.

## Mock mode

Đang chạy bằng `*.mock.ts` qua `MockProvider` / `useMockMode`. Khi nối API thật:
thêm `api/*.api.ts` trong module + hook TanStack Query, giữ mock làm fallback/dev.

## Quy ước đặt tên

Component/Page: PascalCase, file `XxxPage.tsx` / `XxxCard.tsx`. Hook: `useXxx.ts`.
Store: `*.store.ts`. Types: `*.types.ts`. Zod: `*.schema.ts`. Mock: `*.mock.ts`.
Route: `routes.tsx`. Tiền tệ luôn format qua `shared/utils/formatters`.
