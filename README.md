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
