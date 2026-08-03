# Đống Đa Financial Operations

Hệ thống quản lý vận hành tài chính cho CTY Đống Đa: giao dịch WU/MG, mua bán ngoại tệ, chuyển tiền, ca làm việc, quỹ, ngân hàng, công nợ, đối chiếu Journal và báo cáo chi nhánh.

## Thành Phần

```txt
backend/    NestJS + Prisma + PostgreSQL
frontend/   React + Vite + Ant Design + TanStack Query
docs/       Tài liệu thiết kế database và nghiệp vụ
```

Các module chính:

- Auth, role, permission
- Dashboard công ty/chi nhánh
- Ca làm việc
- Giao dịch WU, MG, ngoại tệ, chuyển tiền
- Quỹ chung, quỹ chi nhánh, tiếp quỹ
- Ngân hàng và lịch sử biến động số dư
- Công nợ
- Kiểm quỹ
- Đối chiếu Journal
- Báo cáo, audit log, quản trị người dùng

## Chạy Bằng Docker

Yêu cầu:

- Docker Desktop đang chạy

Chạy toàn bộ stack từ root project:

```bash
docker compose up --build
```

URL:

```txt
Frontend:   http://localhost:5173
Backend:    http://localhost:3000/api/v1
PostgreSQL: localhost:5435
```

Tắt stack:

```bash
docker compose down
```

Xóa luôn volume database dev:

```bash
docker compose down -v
```

## Tài Khoản Test

Backend seed mặc định tạo 1 Hội sở, 5 chi nhánh và các tài khoản vận hành sau:

```txt
GĐ:
Username: giamdoc
Password: Giamdoc@123456
Role:     ADMIN
Chi nhánh: Hội sở
```

```txt
KTTH:
Username: ktth
Password: Ktth@123456
Role:     MANAGER
Chi nhánh: Hội sở
```

```txt
Nhân viên chi nhánh:
Username: nv_nct       Password: Staff@123456  Chi nhánh: NCT - Nguyễn Chí Thanh
Username: nv_tao_dan   Password: Staff@123456  Chi nhánh: TAO_DAN - Tao Đàn
Username: nv_lhp       Password: Staff@123456  Chi nhánh: LHP - Lê Hồng Phong
Username: nv_bay_hien  Password: Staff@123456  Chi nhánh: BAY_HIEN - Bảy Hiền
Username: nv_an_dong   Password: Staff@123456  Chi nhánh: AN_DONG - An Đông
```

Tài khoản kỹ thuật cũ vẫn được seed để tương thích môi trường dev:

```txt
Username: admin
Password: Admin@123456
Role:     ADMIN
Chi nhánh: Hội sở
```

## Dữ Liệu Database Dev

```txt
Company: DONGDA - Công ty TNHH TM DV PT Đống Đa
HeadOffice: HO - Hội sở
Branches:
- NCT - Chi nhánh Nguyễn Chí Thanh
- TAO_DAN - Chi nhánh Tao Đàn
- LHP - Chi nhánh Lê Hồng Phong
- BAY_HIEN - Chi nhánh Bảy Hiền
- AN_DONG - Chi nhánh An Đông
```

Thông tin kết nối database khi chạy Docker Compose:

```txt
Host: localhost
Port: 5435
Database: dongda_db
User: postgres
Password: postgres
```

## Chạy Local Không Docker

### Backend

```bash
cd backend
npm install
npm run start:dev
```

Backend dùng global prefix:

```txt
/api/v1
```

Ví dụ:

```txt
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định gọi API qua:

```txt
/api/v1
```

Vite proxy local mặc định về:

```txt
http://localhost:3000
```

## Environment

Backend có file mẫu:

```txt
backend/.env.example
```

Các biến quan trọng:

```txt
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
JWT_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
FRONTEND_URL
```

Frontend có thể cấu hình:

```txt
VITE_API_BASE_URL=/api/v1
VITE_DEV_PROXY_TARGET=http://localhost:3000
VITE_USE_MOCK_API=false
VITE_UI_TEST_MODE=false
```

Mặc định frontend dùng API thật. Chỉ bật `VITE_USE_MOCK_API=true` hoặc
`VITE_UI_TEST_MODE=true` khi cần duyệt nhanh UI không phụ thuộc backend.

Khi chạy bằng Docker Compose ở root, các biến dev cơ bản đã được set trong `docker-compose.yml`.

## Kiến Trúc Frontend

```txt
frontend/src/app
  providers/
  router/
  layouts/
  guards/

frontend/src/shared
  api/
  components/
  config/
  constants/
  utils/

frontend/src/modules
  auth/
  dashboard/
  transactions/
  western-union/
  moneygram/
  foreign-exchange/
  fund-management/
  bank-management/
  debt-management/
  ...
```

App được bọc bởi các provider:

```txt
AppConfigProvider
ErrorBoundary
QueryClientProvider
ThemeProvider
AntApp
AuthProvider
PermissionProvider
NotificationProvider
MockProvider
Suspense
Router
```

## Kiến Trúc Backend

```txt
backend/src/domain
  entities/
  repositories/

backend/src/application
  dtos/
  use-cases/

backend/src/infrastructure
  database/
  config/

backend/src/interfaces
  http/controllers/
  http/guards/
```

Backend hiện dùng:

- NestJS
- Prisma
- PostgreSQL
- JWT auth
- Role guard
- Branch access guard
- Throttler rate limit

## Auth Và Phân Quyền

Role backend:

```txt
ADMIN   Toàn quyền hệ thống
MANAGER Quản lý/KTTH
STAFF   Nhân viên chi nhánh
AUDITOR Chỉ đọc/kiểm toán
```

Frontend map role backend sang UI và lọc menu theo permission. Login hiện dùng API thật:

```txt
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```

## Kiểm Kê Module, Nghiệp Vụ Và API

Trạng thái dữ liệu trong bảng dưới đây được hiểu như sau:

```txt
API THẬT  Màn hình đang gọi NestJS API và đọc/ghi PostgreSQL.
HỖN HỢP   Module có cả màn hình dùng API thật và màn hình còn mock/static.
MOCK      Chưa có API nghiệp vụ tương ứng; dữ liệu hoặc thao tác chỉ phục vụ UI demo.
```

Mặc định production/dev dùng API thật. Hai biến `VITE_USE_MOCK_API=true` và
`VITE_UI_TEST_MODE=true` chỉ dùng khi cần duyệt giao diện mà không phụ thuộc backend.

Thống kê tại thời điểm cập nhật README:

| Hạng mục | Số lượng |
| --- | ---: |
| Thư mục module frontend | 19 |
| Controller backend | 17 |
| API endpoint | 59 |
| `GET` | 28 |
| `POST` | 23 |
| `PATCH` | 8 |
| `PUT` / `DELETE` | 0 |

Số endpoint được đếm từ các decorator HTTP trong `backend/src/interfaces/http/controllers`. Bảng trạng thái bên dưới đánh giá theo màn hình đang được route/menu sử dụng, không chỉ dựa trên việc trong thư mục còn tồn tại file mock.

### Tổng quan module frontend

| Module | Nghiệp vụ và logic chính | Trạng thái hiện tại |
| --- | --- | --- |
| Auth | Đăng nhập JWT, refresh token, lấy người dùng hiện tại, đổi mật khẩu, logout | **API THẬT**; nội dung trang trí trên Login vẫn là static/mock |
| Người dùng | GĐ tạo, sửa, deactive tài khoản; tài khoản liên kết 1 employee và chi nhánh làm việc | **API THẬT** cho danh sách/tài khoản; ma trận quyền là **STATIC** |
| Chi nhánh | GĐ tạo chi nhánh; hệ thống tự tạo sổ CASH VND, CASH USD và Quỹ A; theo dõi nhân viên, quỹ, ca, giao dịch, tiền vào/ra | **API THẬT** |
| Dashboard công ty | Tổng vốn, tiền mặt, ngân hàng, công nợ, KPI vận hành, xu hướng 7 ngày, cơ cấu giao dịch, hiệu quả chi nhánh, tỷ giá active | **API THẬT** |
| Dashboard chi nhánh | Tổng quan quỹ, KPI, cảnh báo và tồn ngoại tệ của Staff | **MOCK DATA** |
| Tổng quan giao dịch | Gộp WU, MG, FX; lọc chi nhánh/loại/trạng thái/thời gian; GĐ/KTTH sửa metadata hoặc deactive | **API THẬT** cho WU/MG/FX; chuyển tiền trong nước chưa có dữ liệu API |
| Western Union | Tạo và liệt kê WU; áp tỷ giá theo tiền khách nhận; tách USD chẵn và phần lẻ VND; ghi ledger và công nợ | **API THẬT** |
| MoneyGram | Tạo và liệt kê MG; Reference 8 ký tự duy nhất; quy đổi theo Paid Currency/Payout Currency; ghi ledger và công nợ | **API THẬT** |
| Mua/Bán ngoại tệ | Tạo giao dịch FX, lấy tỷ giá mua/bán active, cập nhật quỹ VND và tồn Quỹ A, không bán vượt tồn | **API THẬT** |
| Chuyển tiền trong nước | Form tạo và danh sách giao dịch chuyển tiền khách hàng | **MOCK DATA**, chưa có controller/API backend |
| Ca làm việc | Staff kiểm tiền đầu ca để mở ca; WU/MG/FX yêu cầu ca mở; kiểm tiền cuối ca để đóng và lưu sai lệch | Một page `active-shift` dùng **API THẬT**; route mở/đóng ca cũ redirect về page này |
| Kiểm quỹ | Nhập mệnh giá, so sánh số thực đếm với ledger, theo dõi kiểm quỹ chi nhánh/toàn công ty | Kiểm đầu/cuối ca đã có trong API ca; hai page kiểm quỹ độc lập còn **MOCK DATA** |
| Quỹ chung | Tổng hợp tiền mặt HO, Quỹ A, ngân hàng, công nợ phải thu và quỹ chi nhánh; tạo phiếu thu/chi không cần mở ca | **API THẬT** |
| Quỹ chi nhánh | Staff xem số dư ledger VND, USD, Quỹ A và trạng thái ca; tạo phiếu thu/chi tiền mặt theo đúng chi nhánh | **API THẬT**, branch scope lấy từ JWT |
| Tiếp quỹ | Một phiếu có nhiều loại tiền; nguồn cố định theo tài khoản; chờ duyệt, xác nhận hoặc từ chối; xác nhận mới post ledger | **API THẬT** |
| Tỷ giá | Tạo, duyệt, từ chối, lấy tỷ giá active và lịch sử; duyệt tỷ giá mới sẽ supersede bản active cùng loại | Trang tạo/duyệt và lịch sử dùng **API THẬT**; hai route legacy `wu-mg-rates`, `fx-rates` còn **MOCK DATA** |
| Ngân hàng | Danh sách tài khoản, số dư, lịch sử biến động; nhận tiền WU/MG về làm tăng ngân hàng và giảm công nợ | **API THẬT** |
| Công nợ | Mỗi ngày tạo một khoản theo chi nhánh + WU/MG + loại tiền; giao dịch trong ngày cộng dồn; xử lý một phần/toàn bộ và xem lịch sử | Page `debt-list` dùng **API THẬT**; route `settlement` quy về danh sách chung |
| Đối chiếu Journal | Nhận dòng Journal đã parse, đối chiếu theo provider/reference/amount, lưu run và item sai lệch | Page `journal` dùng **API THẬT**; page tổng quan cũ còn **MOCK DATA** |
| Báo cáo | Tổng hợp WU/MG/FX, quỹ, công nợ và cảnh báo theo database | Page `summary` dùng **API THẬT**; page tạo/xuất báo cáo cũ còn **MOCK DATA**, chưa xuất Excel/PDF thật |
| Audit Log | Đọc nhật ký append-only từ database, lọc theo action/entity/user | Page `live` dùng **API THẬT**; page tổng quan cũ còn **MOCK DATA** |
| Notification | Hiển thị cảnh báo/thông báo trong layout | **MOCK DATA**, chưa có API và WebSocket/SSE |

### 1. Auth, user và tổ chức

**Nghiệp vụ:** JWT access/refresh token; backend ánh xạ user sang employee, role và branch. Staff bị giới hạn theo `branchId`; ADMIN tạo được chi nhánh, employee và tài khoản MANAGER/STAFF. Username là duy nhất, mật khẩu được hash tại backend.

```txt
POST  /api/v1/auth/login
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
GET   /api/v1/auth/me
PATCH /api/v1/auth/change-password

GET   /api/v1/users
POST  /api/v1/users
PATCH /api/v1/users/:id
PATCH /api/v1/users/:id/deactivate

GET   /api/v1/branches
POST  /api/v1/branches
POST  /api/v1/organization/employees
```

`POST /branches` tạo branch và toàn bộ sổ quỹ ban đầu trong cùng transaction. Số dư đầu tiên không ghi trực tiếp vào account; người dùng được chuyển sang luồng Tiếp quỹ để phát sinh ledger đúng nghiệp vụ.

Chưa có API để chỉnh ma trận permission động. `PermissionMatrixPage` hiện là bảng tham chiếu static; quyền thực thi vẫn được bảo vệ bằng role/guard ở backend.

### 2. Dashboard và báo cáo tổng hợp

**Nghiệp vụ:** đọc dữ liệu đã POSTED/COMPLETED, quy đổi quỹ theo tỷ giá active, tổng hợp giao dịch và cảnh báo theo ngày. Dashboard công ty tự cập nhật bằng TanStack Query.

```txt
GET /api/v1/reports/summary?branchId=:branchId
GET /api/v1/reports/dashboard-operations?date=YYYY-MM-DD
GET /api/v1/reports/company-dashboard?date=YYYY-MM-DD
```

- `summary`: tổng hợp WU, MG, FX, công nợ, Quỹ A và cảnh báo.
- `dashboard-operations`: số giao dịch, giá trị giao dịch, sai lệch chờ xử lý và số chi nhánh đang mở ca.
- `company-dashboard`: snapshot tổng vốn, KPI, xu hướng 7 ngày, cơ cấu giao dịch, hiệu quả từng chi nhánh và tỷ giá active.

Chưa có API Dashboard riêng cho Staff. `BranchDashboardPage` hiện dùng `branchDashboard.mock.tsx`.

### 3. Ca làm việc và kiểm quỹ

**Nghiệp vụ:** Staff chỉ mở/đóng ca tại chi nhánh được gán. Mở ca lưu kiểm đếm đầu ca; đóng ca lưu kiểm đếm cuối ca, số hệ thống, chênh lệch và trạng thái khớp/thừa/thiếu. GĐ/KTTH có thể đọc ca của chi nhánh nhưng không mở/đóng thay Staff.

```txt
GET  /api/v1/shifts/current?branchId=:branchId
POST /api/v1/shifts/open
POST /api/v1/shifts/:id/close
GET  /api/v1/fund/balances?branchId=:branchId
```

Ràng buộc ca đã được kiểm tra lại tại backend khi tạo WU/MG/FX; không chỉ dựa vào trạng thái UI. Tiếp quỹ, thu/chi ngân hàng và nghiệp vụ tiền mặt ngoài giao dịch khách hàng không bắt buộc mở ca.

Chưa có API riêng cho lịch sử kiểm quỹ, kiểm quỹ trung tâm và bảng mệnh giá ngoài luồng mở/đóng ca. Các route `/cash-count/branch` và `/cash-count/central` còn dùng mock data. Module Ca làm việc chỉ còn page `/shift-management/active-shift`; `/open-shift` và `/close-shift` redirect về page này.

### 4. Giao dịch khách hàng

**Nghiệp vụ chung:** Staff chỉ xem/tạo tại branch của mình; ADMIN/MANAGER được chọn branch. Tạo giao dịch phải có ca đang mở, snapshot tỷ giá tại thời điểm tạo và post ledger. WU/MG đồng thời tạo công nợ theo `paid_currency`.

```txt
GET  /api/v1/wu/transactions?branchId=:branchId
POST /api/v1/wu/transactions

GET  /api/v1/mg/transactions?branchId=:branchId
POST /api/v1/mg/transactions

GET  /api/v1/fx/transactions?branchId=:branchId
GET  /api/v1/fx/stock?branchId=:branchId
POST /api/v1/fx/transactions
```

Quản trị giao dịch đã post:

```txt
GET   /api/v1/transactions/change-requests?status=:status
PATCH /api/v1/transactions/:id/metadata
POST  /api/v1/transactions/:id/void
POST  /api/v1/transactions/:id/deactivate
POST  /api/v1/transactions/:id/change-requests
POST  /api/v1/transactions/change-requests/:requestId/approve
POST  /api/v1/transactions/change-requests/:requestId/reject
```

- Sửa metadata chỉ cho phép đổi tên/số điện thoại khách và bắt buộc lý do.
- Deactivate/void tạo bút toán đảo, xử lý công nợ liên quan, đổi trạng thái giao dịch và ghi audit log.
- Không sửa trực tiếp branch, loại tiền, số tiền hoặc tỷ giá của giao dịch đã post.
- Staff có thể gửi yêu cầu void; ADMIN/MANAGER duyệt hoặc từ chối.

Chưa có API cho chuyển tiền trong nước. Route `/domestic-transfer/transactions` và dữ liệu `domesticTransferTransactionsMock` chỉ là UI demo.

### 5. Tỷ giá

**Nghiệp vụ:** tỷ giá mới được tạo ở trạng thái chờ duyệt. Khi duyệt, backend đặt bản mới thành `ACTIVE`, đóng hiệu lực bản active cũ cùng nhóm và ghi người/thời điểm duyệt. Form WU/MG/FX chỉ lấy bản active còn hiệu lực.

```txt
GET   /api/v1/exchange-rates
GET   /api/v1/exchange-rates/active
GET   /api/v1/exchange-rates/history
POST  /api/v1/exchange-rates
PATCH /api/v1/exchange-rates/:id/approve
PATCH /api/v1/exchange-rates/:id/reject
```

Các nhóm chính: `PAID_BUY`, `PAID_SELL`, `BANK_RATE`, `FX_BUY`, `FX_SELL`. Hai route legacy `/exchange-rate/wu-mg-rates` và `/exchange-rate/fx-rates` còn dùng mock; menu production đang trỏ vào trang tạo/duyệt và lịch sử dùng API thật.

### 6. Quỹ, tiếp quỹ và theo dõi chi nhánh

**Nghiệp vụ:** ledger POSTED là nguồn sự thật. Số dư sổ quỹ được tính `DEBIT - CREDIT`; không cập nhật số dư quỹ bằng state frontend.

```txt
GET   /api/v1/fund/balances?branchId=:branchId
GET   /api/v1/fund/central-summary
POST  /api/v1/fund/central-movements
POST  /api/v1/fund/branch-movements
GET   /api/v1/fund/transfers?branchId=:branchId&status=:status
POST  /api/v1/fund/transfers
PATCH /api/v1/fund/transfers/:id/confirm
PATCH /api/v1/fund/transfers/:id/reject

GET   /api/v1/branch-monitoring/branches
GET   /api/v1/branch-monitoring/:branchId/funds
GET   /api/v1/branch-monitoring/:branchId/activity?period=day|month|year&date=YYYY-MM-DD
```

- `central-summary` cộng tiền mặt HO, Quỹ A, ngân hàng, công nợ phải thu và quỹ các chi nhánh; USD dùng `PAID_BUY`, ngoại tệ dùng tỷ giá mua active.
- `central-movements` cho ADMIN/MANAGER tạo phiếu thu hoặc chi gồm nhiều loại tiền. Nguồn `CASH` ghi `cash_movements` và ledger; nguồn `BANK` ghi biến động và cập nhật số dư tài khoản ngân hàng. Backend kiểm tra số dư từng khoản khi chi và rollback toàn phiếu nếu có một khoản không hợp lệ; nghiệp vụ này không yêu cầu mở ca.
- `branch-movements` cho STAFF tạo phiếu tiền mặt tại chi nhánh đang làm việc. Backend lấy branch từ JWT, không nhận branch từ form và từ chối nguồn `BANK`. Sau khi post, page Quỹ Chi nhánh tự tải lại số dư ledger.
- Một phiếu tiếp quỹ chứa nhiều loại tiền. ADMIN/MANAGER gửi từ HO; Staff gửi từ branch được gán.
- Phiếu mới ở trạng thái chờ. Chỉ khi confirm backend mới khóa sổ nguồn, kiểm tra đủ số dư và post một ledger entry gồm các dòng giảm nguồn/tăng đích.
- Theo dõi chi nhánh trả về số nhân viên active, tồn VND/USD/Quỹ A, ca đang mở, số lượng/giá trị giao dịch và xu hướng tiền vào/ra.

Page Quỹ Chung, Theo dõi Chi nhánh của GĐ/KTTH và Quỹ Chi nhánh dành cho Staff đều dùng API thật. Staff chỉ đọc `/fund/balances` và `/bank/accounts` trong branch scope của token.

### 7. Ngân hàng và công nợ

**Nghiệp vụ:** giao dịch WU/MG tạo `EXPECTED_DEBT`. Khóa duy nhất của một khoản nợ ngày là `business_date + branch_id + provider_code + currency_code`; nhiều giao dịch cùng khóa được cộng vào một khoản, ngày mới tự tạo khoản mới. Trạng thái `PENDING`, `PARTIALLY_SETTLED`, `SETTLED` được suy ra từ tổng phát sinh và tổng đã xử lý. Khi tiền nhà cung cấp về ngân hàng, backend khóa tài khoản ngân hàng và khoản nợ, kiểm tra không nhận vượt số còn nợ, tăng số dư ngân hàng và tạo `SETTLEMENT` trong cùng database transaction.

```txt
GET  /api/v1/bank/accounts
GET  /api/v1/bank/movements?bankAccountId=:id
POST /api/v1/bank/receive

GET  /api/v1/debts?branchId=:branchId&providerCode=WU&currencyCode=USD
GET  /api/v1/debts?businessDate=YYYY-MM-DD
GET  /api/v1/debts?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
GET  /api/v1/debts/:id/movements
POST /api/v1/debts/:id/settle
POST /api/v1/debts/:id/settle-usd-cash
POST /api/v1/debts/record
```

`POST /debts/record` hiện được giữ để test/ghi nhận công nợ thủ công và nhận `businessDate` tùy chọn. Luồng production chính để WU/MG hoặc kết quả đối chiếu Journal sinh công nợ.

Các page tài khoản ngân hàng, biến động và nhận tiền dùng API thật. `/debt-management/debt-list` là màn hình chính dùng API thật, có lọc khoảng ngày, chi nhánh, đối tác, loại tiền, trạng thái; thao tác xử lý và lịch sử nằm ngay trên từng khoản. Route `/debt-management/settlement` được chuyển về màn hình này để tránh trùng luồng.

- Công nợ VND: form chọn tài khoản VND và gọi `POST /bank/receive`; số dư ngân hàng tăng và công nợ giảm trong cùng transaction.
- Công nợ USD: form tách phần nguyên USD tiền mặt và phần lẻ dưới `1 USD`; backend lấy `BANK_RATE` USD/VND active, tăng quỹ tiền mặt USD/VND, ghi ledger và giảm công nợ trong cùng transaction qua `POST /debts/:id/settle-usd-cash`.

### 8. Đối chiếu Journal

**Nghiệp vụ:** frontend nhận file và parse thành dòng Journal, backend tạo reconciliation run, match với giao dịch theo provider/reference/số tiền, lưu item khớp hoặc sai lệch. WU đối chiếu theo branch; MG có thể dùng phạm vi chung tùy journal.

```txt
GET  /api/v1/reconciliation/runs
GET  /api/v1/reconciliation/runs/:id/items
POST /api/v1/reconciliation/run
```

Workspace `/reconciliation/journal` dùng API thật. Trang `/reconciliation` hiện vẫn hiển thị `journalUploadsMock` và `wuReconciliationRowsMock`. Chưa có API upload/lưu file gốc vào storage; API hiện nhận các dòng đã parse từ frontend.

### 9. Báo cáo và Audit Log

```txt
GET /api/v1/reports/summary
GET /api/v1/reports/dashboard-operations
GET /api/v1/reports/company-dashboard
GET /api/v1/audit-logs?action=:action&entityType=:type&userId=:userId
```

`/reports/summary` và `/audit-log/live` dùng dữ liệu thật. Trang `/reports` hiện là UI demo với KPI, biểu đồ và leaderboard hard-code; các nút xem trước, xuất Excel và PDF chưa có API. Trang `/audit-log` cũ dùng `auditRecordsMock`; nhật ký thật nằm ở `/audit-log/live`.

Audit log được thiết kế append-only: thao tác quan trọng ghi actor, action, entity, dữ liệu trước/sau, IP và thời gian. Không cung cấp endpoint update/delete audit log.

### 10. Chức năng chưa có API production

| Chức năng | Dữ liệu hiện tại | API cần bổ sung |
| --- | --- | --- |
| Chuyển tiền trong nước | `domesticTransferTransactionsMock` | CRUD giao dịch, kiểm ca, ledger, danh sách/lọc |
| Dashboard Staff | `branchDashboard.mock.tsx` | Snapshot dashboard có branch scope |
| Kiểm quỹ độc lập | `cashCount.mock.ts` | Danh sách lần kiểm, chi tiết mệnh giá, duyệt sai lệch |
| Quỹ riêng của Staff | `funds.mock.ts` | Có thể tái sử dụng `/fund/balances` và thêm API snapshot chi nhánh scoped |
| Tổng quan đối chiếu cũ | `reconciliation.mock.ts` | Nên thay page bằng `/reconciliation/runs` và items |
| Tạo/xuất báo cáo | Dữ liệu hard-code | API preview, export Excel/PDF, lưu lịch sử export |
| Tổng quan Audit cũ | `auditLog.mock.ts` | Nên hợp nhất vào `/audit-logs` |
| Notification real-time | `notifications.mock.tsx` | API notification và WebSocket/SSE |
| Ma trận permission động | Mảng static trong frontend | API role, permission, role-permission và audit thay đổi |

## Luồng Giao Dịch WU/MG

### Luồng ca của Staff

```txt
1. Khi chưa mở ca:
   - Staff không được tạo WU/MG/FX/chuyển tiền khách.
   - Trang giao dịch chỉ hiển thị yêu cầu mở ca.
   - Staff vẫn được tạo phiếu điều chuyển/xuất vốn ở trạng thái chờ duyệt.
   - GĐ/KTTH duyệt hoặc từ chối phiếu vốn.

2. Khi mở ca:
   - Hệ thống hiển thị tồn tiền mặt đang ghi nhận theo ledger.
   - Staff nhập/xác nhận số tiền thực tế đầu ca.
   - Hệ thống lưu kiểm quỹ đầu ca và mở ca.
   - Sau khi có ca mở, Staff được tạo WU/MG/FX.

3. Khi đóng ca:
   - Staff nhập tay số tiền thực đếm cuối ca.
   - Hệ thống so sánh với tồn ledger tại thời điểm đóng ca.
   - Kết quả khớp/thừa/thiếu được lưu vào kiểm quỹ cuối ca.
   - Nếu có sai lệch, hệ thống tạo notification để GĐ/KTTH theo dõi.
```

### Nhóm tỷ giá chính

```txt
PAID_BUY     Paid mua, áp dụng cho WU/MG khi khách nhận VND.
PAID_SELL    Paid bán, áp dụng cho WU/MG khi khách nhận USD.
BANK_RATE    Tỷ giá ngân hàng, dùng xử lý phần lẻ công nợ USD.
FX_BUY       Tỷ giá mua ngoại tệ từ khách: USD, EUR, AUD...
FX_SELL      Tỷ giá bán ngoại tệ cho khách: USD, EUR, AUD...
```

`PAID_BUY` và `PAID_SELL` dùng chung provider `WU_MG`. `BANK_RATE` dùng provider `BANK`. Mua/bán ngoại tệ dùng provider `INTERNAL`.

Gửi -> Duyệt -> vô hiệu hóa tỷ giá cũ.

### Western Union

WU dùng `MSKH/MTCN` gồm 10 số. Trên UI có thể hiển thị dạng dễ đọc:

```txt
633-775-1692
```

Nhưng dữ liệu gửi backend và lưu DB vẫn là 10 chữ số:

```txt
6337751692
```

Luồng tạo giao dịch WU:

```txt
1. Nhân viên chi nhánh chọn/tự nhận chi nhánh đang làm việc.
2. Nhập MSKH/MTCN và thông tin khách hàng.
3. Nhập Amount USD (WU) và Amount VND (WU).
4. Hệ thống tính WU implied rate = Amount VND / Amount USD.
5. Chọn tiền khách nhận: USD hoặc VND.
6. Nếu khách nhận USD:
   - Trả USD phần chẵn.
   - Phần lẻ USD quy đổi sang VND theo tỷ giá giao dịch.
   - Ledger ghi giảm quỹ USD và có thể giảm thêm quỹ VND.
7. Nếu khách nhận VND:
   - Trả một số VND.
   - Ledger ghi giảm quỹ VND.
8. Hệ thống lấy tỷ giá WU active:
   - Khách nhận USD dùng PAID_SELL.
   - Khách nhận VND dùng PAID_BUY.
9. Nhân viên chọn tỷ giá giao dịch bằng slider bước 50 VND trong biên độ giữa WU implied rate và tỷ giá hệ thống.
10. Xem tóm tắt giao dịch và xác nhận tạo.
11. Backend lưu giao dịch, ghi ledger quỹ và tạo công nợ WU theo Paid Currency.
```

Các field tài chính chính:

```txt
wu_usd_amount    Số USD gốc của WU
wu_vnd_amount    Số VND gốc của WU
received_usd     USD thực chi cho khách
received_vnd     VND thực chi cho khách, gồm phần lẻ USD quy đổi
wu_rate          Tỷ giá implied từ WU
system_rate      Tỷ giá active của hệ thống tại thời điểm giao dịch
applied_rate     Tỷ giá giao dịch được chọn
payout_currency  Loại tiền khách nhận, dùng để chọn PAID_SELL/PAID_BUY
paid_currency    Loại tiền WU hoàn, dùng để tạo công nợ
```

### MoneyGram

MG dùng `Reference Number` - 8 ký tự (chữ cái viết hoa và số), mỗi Reference chỉ được xử lý một lần.

Luồng tạo giao dịch MG:

```txt
1. Nhân viên chi nhánh chọn/tự nhận chi nhánh đang làm việc.
2. Nhập Reference Number và thông tin khách hàng.
3. Chọn Paid Currency MG hoàn: USD hoặc VND.
4. Nhập một số tiền MG theo Paid Currency đã chọn.
5. Chọn tiền khách nhận: USD hoặc VND.
6. Hệ thống lấy tỷ giá Paid active theo loại tiền khách nhận:
   - Khách nhận USD dùng PAID_SELL.
   - Khách nhận VND dùng PAID_BUY.
7. Hệ thống gợi ý số tiền khách nhận:
   - Paid USD, khách nhận VND: quy đổi USD sang VND.
   - Paid VND, khách nhận USD: quy đổi VND sang USD.
   - Cùng loại tiền: giữ nguyên số tiền.
8. Nếu khách nhận USD:
   - Trả USD phần chẵn.
   - Phần lẻ USD quy đổi sang VND theo Paid bán.
   - Ledger ghi giảm quỹ USD và có thể giảm thêm quỹ VND.
9. Nếu khách nhận VND:
   - Trả một số VND.
   - Ledger ghi giảm quỹ VND.
10. Xem tóm tắt giao dịch và xác nhận tạo.
11. Backend lưu giao dịch, ghi ledger quỹ và tạo công nợ MG theo Paid Currency.
```

Khác WU, MG hiện giữ `applied_rate = system_rate` vì DB đang có ràng buộc tỷ giá MG phải bằng tỷ giá hệ thống.
Nếu sau này muốn MG có slider tỷ giá giao dịch như WU, cần migrate lại constraint `chk_mg_rate_same`.

Các field tài chính chính:

```txt
mg_usd_amount    Giá trị MG quy đổi ra USD
mg_vnd_amount    Giá trị MG quy đổi ra VND
payout_currency  Loại tiền khách chọn nhận: USD hoặc VND
payout_amount    Số tiền khách nhận theo loại đã chọn
received_usd     USD thực chi cho khách
received_vnd     VND thực chi cho khách, gồm phần lẻ USD quy đổi
mg_rate          Tỷ giá implied từ MG
system_rate      Paid mua/Paid bán active tại thời điểm giao dịch
applied_rate     Hiện bằng system_rate
paid_currency    Loại tiền MG hoàn, dùng để tạo công nợ
```

### Quản trị giao dịch

GĐ (`ADMIN`) và KTTH (`MANAGER`) được quản trị giao dịch toàn hệ thống:

```txt
PATCH /api/v1/transactions/:id/metadata
  Sửa customerName/customerPhone, bắt buộc có reason và ghi Audit Log.

POST /api/v1/transactions/:id/deactivate
  Chỉ áp dụng cho giao dịch COMPLETED, bắt buộc có reason.
  Backend đảo ledger, đảo công nợ còn chưa tất toán, chuyển trạng thái VOIDED và ghi Audit Log.
```

Chi nhánh, loại giao dịch, số tiền và tỷ giá không được cập nhật trực tiếp vì đã phát sinh ledger/công nợ. Nếu sai dữ liệu tài chính, người quản lý phải deactive giao dịch cũ rồi tạo giao dịch thay thế tại đúng chi nhánh. Backend từ chối deactive nếu công nợ liên quan đã được giải quyết một phần hoặc toàn bộ.

### Theo dõi chi nhánh

Các API chỉ dành cho GĐ (`ADMIN`) và KTTH (`MANAGER`):

```txt
GET /api/v1/branch-monitoring/branches
GET /api/v1/branch-monitoring/:branchId/funds
GET /api/v1/branch-monitoring/:branchId/activity?period=day|month|year&date=YYYY-MM-DD
GET /api/v1/reports/dashboard-operations?date=YYYY-MM-DD
GET /api/v1/reports/company-dashboard?date=YYYY-MM-DD
```

API quỹ tính số dư từ ledger `POSTED`, quy đổi USD tiền mặt theo `PAID_BUY` và Quỹ A theo `FX_BUY` đang active. API hoạt động chỉ tính giá trị của giao dịch `COMPLETED`; giao dịch `VOIDED` vẫn nằm trong tổng số phát sinh nhưng không được cộng vào giá trị giao dịch.

API `dashboard-operations` cấp bốn KPI đầu trang Dashboard Công Ty: số giao dịch, giá trị giao dịch hoàn tất, sai lệch đối soát chưa xử lý và số chi nhánh đang mở ca. Sai lệch từ 1.000.000 VND trở lên được phân loại là sai lệch lớn.

API `company-dashboard` cấp toàn bộ snapshot Dashboard Công Ty trong một response: tổng vốn và thành phần quỹ, bốn KPI vận hành, giá trị giao dịch/lợi nhuận WU-MG trong 7 ngày, cơ cấu giao dịch, hiệu quả chi nhánh và tỷ giá active. Tổng vốn quy đổi gồm tiền mặt, Quỹ A, ngân hàng và công nợ; tỷ giá quy đổi lấy `PAID_BUY` cho USD và `FX_BUY` cho các ngoại tệ khác.

## Database Design

Bản thiết kế database production draft:

- [docs/database/dongda_v3_database_design_for_review.md](docs/database/dongda_v3_database_design_for_review.md)
- [docs/database/dongda_v3_postgresql_draft_for_review.sql](docs/database/dongda_v3_postgresql_draft_for_review.sql)

Nguyên tắc chính:

- User đại diện Employee
- Employee thuộc Branch
- WU/MG/FX/Chuyển tiền bắt buộc mở ca
- Tiếp quỹ, ngân hàng, chi tiền mặt không bắt buộc mở ca
- Journal cuối ngày tạo công nợ thực tế
- Ledger là nguồn sự thật tài chính

## Lệnh Hay Dùng

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend:

```bash
cd backend
npm run build
npm run start:dev
```

Docker:

```bash
docker compose up --build
docker compose down
docker compose logs -f backend
docker compose logs -f frontend
```

## Ghi Chú Phát Triển

- Một số module frontend vẫn dùng mock data trong khi auth đã dùng API thật.
- Khi backend hoàn thiện từng module, nên thay mock bằng `module/api` + `module/hooks`.
- Không nên format dữ liệu tiền trực tiếp trong input text thường; dùng `InputNumber` với formatter/parser.
- Các nghiệp vụ tiền cần đi qua service layer và ledger, không để UI tự tính sổ chính thức.
