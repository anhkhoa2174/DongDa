# Luồng Test Backend (thủ công qua Swagger UI) — theo yêu cầu DongDav6.md

Tài liệu này là **kịch bản test bằng tay** cho backend đang chạy tại
`http://localhost:3000` (Swagger UI: `http://localhost:3000/api/docs`), bám
theo từng gạch đầu dòng trong [backend/DongDav6.md](backend/DongDav6.md).

**Anh là người trực tiếp bấm test** — tài liệu chỉ đưa endpoint, payload và
kết quả mong đợi để anh đối chiếu. Payload ở bản này **cố ý khác** với dữ liệu
đã tạo ở lần test trước (chi nhánh mới `CN03`, nhân viên mới `staff02`, MTCN/
Reference mới, ngoại tệ mới `GBP` thay vì `EUR`, ngân hàng mới `TCB`...) để
tránh trùng/conflict với dữ liệu cũ còn nằm trong DB (`CN01`, `CN02`, MTCN
`1234567890`, Reference `AB123456`, bank `VCB` đã có sẵn).

Cách dùng: mở Swagger UI → bấm **Authorize** (dán `accessToken`, không cần gõ
chữ "Bearer") → chọn đúng endpoint theo từng bước → **Try it out** → dán
payload vào ô Request body → **Execute** → so kết quả trả về với cột "Kết quả
mong đợi". Làm **đúng thứ tự từ Bước 1** vì bước sau phụ thuộc dữ liệu (ID) trả
về từ bước trước.

## 0. Tình trạng backend hiện tại

### Đã sửa trong lúc kiểm thử (bug thật, ảnh hưởng trực tiếp yêu cầu của anh)

| Bug | File | Triệu chứng | Đã sửa |
| --- | --- | --- | --- |
| Xuất PDF (WU + Reports) luôn lỗi 500 | [backend/src/application/use-cases/reports/build-pdf.ts](backend/src/application/use-cases/reports/build-pdf.ts) | `jspdf-autotable` bản v5 không tự gắn `doc.autoTable` như bản v3 → `doc.autoTable is not a function` | ✅ Đã sửa: gọi `applyPlugin(jsPDF)` khi load module |
| `POST /reconciliation/run` cho MG/FX luôn lỗi 500 khi có `branchId` | [backend/src/application/use-cases/reconciliation/reconciliation.use-cases.ts](backend/src/application/use-cases/reconciliation/reconciliation.use-cases.ts) | Scope `COMPANY` nhưng vẫn gán `branch_id` → vi phạm check constraint `chk_journal_file_scope` | ✅ Đã sửa: chỉ gán `branchId` khi `scope === 'BRANCH'` |

### Còn lỗi — CHƯA sửa (cần anh xác nhận hướng xử lý trước khi đổi schema)

| Tính năng | Endpoint | Nguyên nhân gốc |
| --- | --- | --- |
| Ghi nhận / hoàn tạm ứng CK ngân hàng | `POST /bank/advance-ck`, `POST /bank/advance-ck/:id/settle`, `GET /bank/advances` | Enum Prisma `bank_movement_type` **chưa có** giá trị `ADVANCE_CK` / `ADVANCE_SETTLE`, dù code đã dùng. Cần migration thêm enum value. |
| STAFF upload Journal WU/MG chờ KTTH duyệt | `POST /reconciliation/upload-journal`, `GET /reconciliation/pending-journals`, `GET /reconciliation/pending-journals/:id` | Enum `reconciliation_item_status` chưa có `JOURNAL_ONLY`, và bảng `reconciliation_items` chưa có cột `code`. Cần migration thêm enum value + cột. |

Đây đúng là 2 nghiệp vụ nằm trong yêu cầu DongDav6.md ("ghi nhận số CK hằng
ngày" và "Upload WU/MG tại chi nhánh → đối chiếu → gửi về KTTH"). Em **chưa tự
tạo migration** vì đây là thay đổi schema — theo quy ước trong
[backend/CLAUDE.md](backend/CLAUDE.md) và yêu cầu "khi nghiệp vụ chưa rõ thì
hỏi". Anh xác nhận thì em thêm migration cho 2 chỗ này ngay.

Ngoài ra: **chưa có API tạo `banks` / `bank_accounts`** — muốn test phần Ngân
hàng phải tự tạo bằng Prisma Studio hoặc SQL (hướng dẫn ở Bước 6.1 bên dưới).
Đây cũng là điểm nên bổ sung endpoint `POST /banks` và `POST /bank/accounts`
nếu anh cần quản lý qua UI thay vì thao tác trực tiếp trên DB.

### Cách chạy backend (đã dùng để test)

Repo có lỗi biên dịch TypeScript **có sẵn từ trước** (không phải do làm bug ở
trên) tại 3 chỗ không liên quan tới các luồng chính:

- `fund-transfer.use-cases.spec.ts` (test cũ thiếu field `rate`)
- `prisma-bank.repository.ts` dòng so sánh `'ADVANCE_CK'` (đúng bug ở trên)
- `prisma-reconciliation.repository.ts` 2 chỗ liên quan `JOURNAL_ONLY`/`code`
  (đúng bug ở trên)

`tsc` vẫn emit JS dù có lỗi type (không set `noEmitOnError`), nên
`npm run start:dev` (watch mode qua Nest CLI) **không tự chạy** app khi có lỗi
biên dịch. Cách chạy ổn định nhất hiện tại:

```bash
cd backend
npx prisma generate --schema=src/infrastructure/database/prisma/schema.prisma
npm run build            # có thể in lỗi TS ở 3 chỗ trên, vẫn tạo được dist/
node dist/main.js         # chạy server thật, không watch
```

Swagger UI: `http://localhost:3000/api/docs`.

## 1. Chuẩn bị: chi nhánh, nhân viên, tỷ giá mới

### Bước 1.1 — Đăng nhập lấy token

**Endpoint:** `POST /auth/login`

```json
{ "username": "admin", "password": "Admin@123456" }
```

**Kết quả mong đợi:** `200 OK`, body có `accessToken`, `refreshToken`,
`user.role = "ADMIN"`. Bấm **Authorize** trong Swagger, dán `accessToken`.

### Bước 1.2 — Tạo chi nhánh mới `CN03`

**Endpoint:** `POST /branches` (yêu cầu role ADMIN)

```json
{
  "code": "CN03",
  "name": "Chi nhánh Test Manual",
  "address": "99 Đường Test, Q3",
  "phone": "0283334444"
}
```

**Kết quả mong đợi:** `201 Created`, trả về `id` (UUID) + `type: "BRANCH"`.
→ **Ghi lại `id` này thành `CN03_ID`, dùng lại ở toàn bộ các bước sau.**

`POST /branches` tự tạo sổ `CASH_VND`, `CASH_USD` và `FUND_A_<currency>` cho
mọi ngoại tệ nhưng **số dư = 0** — phải tiếp quỹ ở Bước 1.5 mới có tiền.

### Bước 1.3 — Tạo tài khoản `staff02` cho CN03

**Endpoint:** `POST /organization/employees` (role ADMIN)

```json
{
  "branchId": "fd102173-cf5e-47b7-93fe-a50f5048cae4",
  "fullName": "Đặng Thị Nhân Viên",
  "phone": "0909887766",
  "email": "staff02@dongda.vn",
  "account": { "username": "staff02", "password": "Staff2@123456", "role": "STAFF" }
}
```

**Kết quả mong đợi:** `201 Created`, `user.username = "staff02"`,
`user.role = "STAFF"`. Đăng nhập thử `POST /auth/login` với tài khoản này để
lấy `STAFF_TOKEN` riêng — dùng token này (Authorize lại) cho các bước STAFF.

### Bước 1.4 — Tạo + duyệt tỷ giá GBP (ngoại tệ mới, chưa từng active)

WU/MG (`PAID_BUY` 25000, `PAID_SELL` 25200, provider `WU_MG`) và `BANK_RATE`
25100 **đã ACTIVE sẵn từ lần test trước** — không cần tạo lại. Chỉ cần tạo mới
tỷ giá cho **GBP** (lần trước mới test EUR) để mua/bán ở Bước 4.

**Endpoint:** `POST /exchange-rates` (role ADMIN/MANAGER) — gọi 2 lần:

```json
{ "rateType": "FX_BUY", "provider": "INTERNAL", "fromCurrency": "GBP", "toCurrency": "VND", "rate": 31000 }
```

```json
{ "rateType": "FX_SELL", "provider": "INTERNAL", "fromCurrency": "GBP", "toCurrency": "VND", "rate": 31500 }
```

**Kết quả mong đợi mỗi lần:** `201 Created`, `status: "DRAFT"`. Ghi lại 2 `id`.
a2a0c53a-97f4-4ec9-b432-3c0aa9ae073f
86511a2d-2da3-497d-bd5c-9be2c7e3ad75

**Endpoint duyệt:** `PATCH /exchange-rates/{id}/approve` (role ADMIN/MANAGER),
gọi cho từng `id` vừa tạo, không cần body.

**Kết quả mong đợi:** `status: "ACTIVE"`. Gọi `GET /exchange-rates/active` để
xác nhận có đủ 7 dòng ACTIVE (5 dòng cũ + `FX_BUY`/`FX_SELL` GBP mới). chuẩn

### Bước 1.5 — Tiếp quỹ cho CN03 (số tiền khác lần trước: 80tr VND + 3.500 USD)

**(a) Chi hoàn nguyên trung tâm (test nhánh OUT — lần trước chỉ test IN):**

**Endpoint:** `POST /fund/central-movements` (role ADMIN/MANAGER)

```json
{
  "direction": "OUT",
  "sourceType": "CASH",
  "items": [{ "currencyCode": "VND", "amount": 5000000 }],
  "note": "Chi hoa hồng đại lý - test OUT"
}
```

**Kết quả mong đợi:** `201`, `voucherNo` dạng `PC-...`. Gọi
`GET /fund/central-summary` → `vndCash` giảm đúng 5.000.000 so với trước đó.

**(b) HO tạo phiếu tiếp quỹ xuống CN03:**

**Endpoint:** `POST /fund/transfers` (role ADMIN)

```json
{
  "destinationBranchId": "<CN03_ID>",
  "items": [
    { "currencyCode": "VND", "amount": 80000000 },
    { "currencyCode": "USD", "amount": 3500 }
  ]
}
```

**Kết quả mong đợi:** `201`, `status: "PENDING_APPROVAL"`. Ghi lại `id` thành
`TRANSFER_ID`.

**(c) `staff02` xác nhận nhận quỹ** (đổi sang `STAFF_TOKEN`):

**Endpoint:** `PATCH /fund/transfers/{TRANSFER_ID}/confirm`, không cần body.

**Kết quả mong đợi:** `status: "CONFIRMED"`. Gọi
`GET /fund/balances?branchId=<CN03_ID>` → `CASH_VND.balance = 80000000`,
`CASH_USD.balance = 3500`.

### Bước 1.6 — Mở ca cho `staff02` (cố tình đếm lệch để test cảnh báo sai lệch)

**Endpoint:** `POST /shifts/open` (dùng `STAFF_TOKEN`)

`openingCounts` bắt buộc đủ **cả 20 loại tiền**. Đếm VND thiếu 100.000 so với
sổ (80.000.000) để test rule "Kiểm quỹ" — DongDav6.md yêu cầu Báo cáo Sai lệch
và Rủi ro phải bắt được các trường hợp này:

```json
{
  "branchId": "<CN03_ID>",
  "openingCounts": [
    { "currency": "VND", "actualAmount": 79900000 },
    { "currency": "USD", "actualAmount": 3500 },
    { "currency": "GBP", "actualAmount": 0 },
    { "currency": "AUD", "actualAmount": 0 },
    { "currency": "JPY", "actualAmount": 0 },
    { "currency": "EUR", "actualAmount": 0 },
    { "currency": "SGD", "actualAmount": 0 },
    { "currency": "THB", "actualAmount": 0 },
    { "currency": "CNY", "actualAmount": 0 },
    { "currency": "HKD", "actualAmount": 0 },
    { "currency": "KRW", "actualAmount": 0 },
    { "currency": "CAD", "actualAmount": 0 },
    { "currency": "CHF", "actualAmount": 0 },
    { "currency": "NZD", "actualAmount": 0 },
    { "currency": "TWD", "actualAmount": 0 },
    { "currency": "MYR", "actualAmount": 0 },
    { "currency": "IDR", "actualAmount": 0 },
    { "currency": "PHP", "actualAmount": 0 },
    { "currency": "LAK", "actualAmount": 0 },
    { "currency": "KHR", "actualAmount": 0 }
  ],
  "note": "Mở ca CN03 - cố tình lệch 100.000 VND để test cảnh báo"
}
```

**Kết quả mong đợi:** `201`, `shift.status: "OPEN"`. Trong `cashCount.lines`,
dòng `VND` phải có `systemAmount: 80000000`, `actualAmount: 79900000`,
**`variance: -100000`** (khác 0 — đây là điểm cần quan sát, không phải lỗi).
Ghi lại `shift.id` thành `SHIFT_ID`.

## 2. Western Union (WU) — Form GD mới + xuất PDF

Yêu cầu: *"Điều chỉnh Form GD, Xuất ra file PDF (preview trước khi tải)"*.
Payload lần này dùng **MTCN mới**, và đổi chiều `payoutCurrency` sang **USD**
(lần trước test `VND`) để kiểm tra luôn nhánh validate còn lại.

**Endpoint:** `POST /wu/transactions` (dùng `STAFF_TOKEN`)

```json
{
  "branchId": "<CN03_ID>",
  "mtcn": "5566778899",
  "customerName": "Phạm Văn Test",
  "wuUsdAmount": 400,
  "wuVndAmount": 10080000,
  "receivedUsd": 300,
  "receivedVnd": 2520000,
  "appliedRate": 25200,
  "payoutCurrency": "USD",
  "paidCurrency": "VND"
}
```

Diễn giải payload: khách gửi 400 USD (WU), tỷ giá áp dụng 25.200 (khớp
`PAID_SELL` đang active vì `payoutCurrency=USD`); khách nhận 300 USD tiền mặt +
phần lẻ 100 USD còn lại quy đổi = 100 × 25.200 = 2.520.000 VND.

**Kết quả mong đợi:** `201 Created`, `status: "COMPLETED"`,
`appliedRate: 25200`, `profit` là một số (không bắt buộc = 0). Ghi lại `id`
thành `WU_ID`.

**Test tiếp:**

- `GET /wu/transactions/{WU_ID}/preview` → trả đúng JSON vừa tạo.
- `GET /wu/transactions/{WU_ID}/pdf` → tải về, mở ra phải là file PDF đọc được
  (đã sửa bug `jspdf-autotable` — nếu vẫn lỗi 500 thì báo lại).
- Gọi lại `POST /wu/transactions` với **cùng `mtcn: "5566778899"`** lần nữa →
  **kỳ vọng lỗi `409 Conflict`** ("MSKH đã được xử lý") — test rule không cho
  xử lý trùng MTCN.
- Thử đổi `appliedRate` thành `25201` (không chia hết cho 5) → **kỳ vọng lỗi
  `400`** ("Tỷ giá áp dụng WU phải là số nguyên theo bước 5 VND").

## 3. MoneyGram (MG) — Reference mới, chiều tiền ngược lại

Lần trước test `paidCurrency=USD, payoutCurrency=VND`; lần này đổi ngược lại
`paidCurrency=VND, payoutCurrency=USD` để phủ cả 2 nhánh tính toán.

**Endpoint:** `POST /mg/transactions` (dùng `STAFF_TOKEN`)

```json
{
  "branchId": "<CN03_ID>",
  "referenceNo": "ZX998877",
  "customerName": "Ngô Thị Mới",
  "paidCurrency": "VND",
  "mgVndAmount": 5040000,
  "payoutCurrency": "USD",
  "payoutAmount": 200,
  "receivedUsd": 200,
  "receivedVnd": 0
}
```

Diễn giải: công ty trả 5.040.000 VND cho mạng MG (paidCurrency VND); tỷ giá
`PAID_SELL` active 25.200 → quy đổi ra USD trả khách = 5.040.000 / 25.200 =
**200 USD** đúng bằng `payoutAmount`.

**Kết quả mong đợi:** `201 Created`, `status: "COMPLETED"`,
`payoutAmount: 200`. Ghi lại `id` thành `MG_ID`.

**Test thêm:** gọi lại với `referenceNo` không đủ 8 ký tự (vd `"ZX99887"`) →
kỳ vọng `400` ("Reference Number phải gồm đúng 8 ký tự...").

## 4. Mua/bán ngoại tệ (FX) — dùng GBP thay vì EUR, test cả mua lẫn bán

**Endpoint:** `POST /fx/transactions` (dùng `STAFF_TOKEN`)

**4.1 — Mua 150 GBP từ khách:**

```json
{
  "branchId": "<CN03_ID>",
  "isBuy": true,
  "fxCurrency": "GBP",
  "fxAmount": 150,
  "rate": 31000,
  "customerName": "Khách bán GBP cho công ty"
}
```

**Kết quả mong đợi:** `201`, `vndAmount: 4650000` (150 × 31.000 — API tự lấy
tỷ giá `FX_BUY` active, field `rate` trong body chỉ mang tính tham khảo).

**4.2 — Bán 50 GBP cho khách khác** (lần trước chưa test chiều bán):

```json
{
  "branchId": "<CN03_ID>",
  "isBuy": false,
  "fxCurrency": "GBP",
  "fxAmount": 50,
  "rate": 31500,
  "customerName": "Khách mua GBP"
}
```

**Kết quả mong đợi:** `201`, `vndAmount: 1575000` (50 × 31.500). Gọi
`GET /fx/stock?branchId=<CN03_ID>` → dòng `GBP` phải còn **100** (150 mua −
50 bán).

**4.3 — Test rule "không bán vượt tồn":** thử bán tiếp `fxAmount: 500` GBP
(vượt tồn 100 đang có) → **kỳ vọng lỗi `400`** báo không đủ tồn Quỹ A.

## 5. Đối chiếu Journal (F9) — chạy TRƯỚC khi tất toán công nợ

⚠️ Phải làm mục này **trước** mục 6/7 bên dưới — nếu công nợ của ngày đã được
tất toán hết, API `run` sẽ báo lỗi nghiệp vụ "đã đối chiếu và ghi công nợ thực
tế" (đã gặp ở lần test trước).

### 5.1 — Đối chiếu WU (provider WU luôn chạy scope BRANCH)

**Endpoint:** `POST /reconciliation/run` (role ADMIN/MANAGER)

```json
{
  "provider": "WU",
  "businessDate": "2026-08-28",
  "branchId": "<CN03_ID>",
  "rows": [
    { "code": "5566778899", "amount": 10080000, "currencyCode": "VND", "branchId": "<CN03_ID>", "customerName": "Phạm Văn Test" },
    { "code": "0000000001", "amount": 500000, "currencyCode": "VND", "branchId": "<CN03_ID>" }
  ]
}
```

**Kết quả mong đợi:** `201`, `matchedCount: 1`, `totalCount: 2`,
`varianceTotal` khác 0 (dòng `0000000001` không có trong hệ thống). Ghi lại
`id` thành `RUN_WU_ID`.

**Kiểm tra tiếp:** `GET /reconciliation/runs/{RUN_WU_ID}/items` → 1 dòng
`status: "MATCHED"` (mã 5566778899), 1 dòng `status: "MISSING_IN_SYSTEM"` (mã
0000000001).

### 5.2 — Đối chiếu MG (provider khác WU → luôn chạy scope COMPANY)

```json
{
  "provider": "MG",
  "businessDate": "2026-08-28",
  "rows": [
    { "code": "ZX998877", "amount": 5040000, "currencyCode": "VND", "branchId": "<CN03_ID>", "customerName": "Ngô Thị Mới" }
  ]
}
```

**Kết quả mong đợi:** `201`, `matchedCount: 1`, `matchRate: 1`,
`varianceTotal: 0`.

### 5.3 — Xem đối chiếu Quỹ (F9.1)

**Endpoint:** `GET /reconciliation/fund?branchId=<CN03_ID>` — kỳ vọng trả về
dòng theo từng loại tiền của CN03 với `physicalActual` (lấy từ lần kiểm ca gần
nhất ở Bước 1.6) và `variance` tương ứng.

### 5.4 — STAFF upload Journal tại chi nhánh → chờ KTTH duyệt — **vẫn đang lỗi**

Đúng luồng 2 bước DongDav6.md yêu cầu ("Upload WU/MG tại chi nhánh → đối chiếu
→ gửi về KTTH"). Tạo file `journal_cn03.csv` nội dung:

```csv
MSKH,Amount,CustomerName
5566778899,400,Pham Van Test
```

**Endpoint:** `POST /reconciliation/upload-journal?provider=WU&businessDate=2026-08-28`
(dùng `STAFF_TOKEN`, body dạng `multipart/form-data`, field `file` đính kèm
file CSV trên — Swagger UI hỗ trợ chọn file trực tiếp trong ô `file`).

**Kết quả mong đợi (thực tế hiện tại):** `500 Internal Server Error` — do
enum `reconciliation_item_status` thiếu `JOURNAL_ONLY` và bảng
`reconciliation_items` thiếu cột `code` (xem mục 0). Gọi để xác nhận lỗi vẫn
còn, không phải anh làm sai.

## 6. Ngân hàng (F7) — ngân hàng mới `TCB`, debt bằng VND (khác lần trước)

Vì `paidCurrency` của WU/MG lần này là `VND` nên công nợ phát sinh là **VND**
(khác lần trước là USD) — cần tài khoản ngân hàng VND để nhận tiền về.

### 6.1 — Tạo bank + bank account (chưa có API — dùng Prisma Studio, giao diện web)

Chạy trong terminal (từ thư mục `backend/`):

```bash
npx prisma studio --schema=src/infrastructure/database/prisma/schema.prisma
```

Mở `http://localhost:5555` (đây cũng là giao diện web, không phải SQL tay):

1. Vào bảng `banks` → **Add record** → `code: "TCB"`, `name: "Techcombank"`.
2. Vào bảng `bank_accounts` → **Add record**:
   - `branch_id`: `<CN03_ID>`
   - `bank_id`: id của bản ghi TCB vừa tạo
   - `account_no`: `19021112223334`
   - `account_name`: `CN03 - TCB VND`
   - `currency_code`: `VND`
3. Lưu, quay lại Swagger gọi `GET /bank/accounts` → phải thấy tài khoản mới
   với `bankCode: "TCB"`, `currentBalance: 0`.

### 6.2 — Nhận một phần công nợ WU về ngân hàng

**Endpoint:** `POST /bank/receive` (role ADMIN/MANAGER)

```json
{
  "bankAccountId": "<TCB_CN03_VND_ACCOUNT_ID>",
  "debtAccountId": "<lấy từ GET /debts, dòng WU của CN03>",
  "amount": 6000000,
  "bankReference": "TCB-REF-001",
  "description": "WU chuyển khoản về qua TCB"
}
```

**Kết quả mong đợi:** `201`, `movementType: "DEPOSIT"`, `balanceAfter: 6000000`.
`GET /debts` → dòng WU CN03 chuyển `status: "PARTIALLY_SETTLED"`,
`outstanding: 4080000` (10.080.000 − 6.000.000).

### 6.3 — Tạm ứng CK hằng ngày — **vẫn đang lỗi (đã biết từ trước)**

**Endpoint:** `POST /bank/advance-ck` (dùng `STAFF_TOKEN`)

```json
{
  "bankAccountId": "<TCB_CN03_VND_ACCOUNT_ID>",
  "branchId": "<CN03_ID>",
  "amount": 2000000,
  "description": "Nhân viên CN03 ứng trước chuyển tiền khách"
}
```

**Kết quả mong đợi (thực tế hiện tại):** `500 Internal Server Error` — do
enum `bank_movement_type` thiếu `ADVANCE_CK` (xem mục 0). Gọi để xác nhận lỗi
vẫn còn, không phải anh làm sai.

## 7. Công nợ (F2) — tất toán bằng 3 cách khác nhau (lần trước chỉ test 1 cách)

**Endpoint xem trước:** `GET /debts?branchId=<CN03_ID>` — phải thấy 2 dòng:
WU (VND, `outstanding: 4080000` sau Bước 6.2) và MG (VND, `outstanding: 5040000`).

### 7.1 — Tất toán hết công nợ MG bằng `settle-vnd-cash` (chưa test trước)

**Endpoint:** `POST /debts/{MG_DEBT_ID}/settle-vnd-cash` (role ADMIN/MANAGER)

```json
{ "amount": 5040000, "description": "Thu nốt công nợ MG tiền mặt VND" }
```

**Kết quả mong đợi:** `201`, `movementType: "SETTLEMENT"`. `GET /debts` → dòng
MG chuyển `status: "SETTLED"`, `outstanding: 0`.

### 7.2 — Tất toán phần còn lại của WU bằng `settle-batch` (chưa test trước)

**Endpoint:** `POST /debts/settle-batch` (role ADMIN/MANAGER)

```json
{
  "debtAccountIds": ["<WU_DEBT_ID>"],
  "amount": 4080000,
  "settlementSource": "CASH",
  "description": "Tất toán đợt cuối công nợ WU CN03"
}
```

**Kết quả mong đợi:** `201`, `accountCount: 1`, `totalAmount: 4080000`.
`GET /debts` → dòng WU CN03 chuyển `status: "SETTLED"`, `outstanding: 0`.

### 7.3 — Xem lại lịch sử biến động (truy nguồn gốc)

**Endpoint:** `GET /debts/{WU_DEBT_ID}/movements` — kỳ vọng thấy đủ 3 dòng:
`EXPECTED_DEBT` (từ GD WU gốc, nguồn `CUSTOMER_TRANSACTION`), `SETTLEMENT` từ
`BANK_MOVEMENT` (Bước 6.2), `SETTLEMENT` từ batch (Bước 7.2) — đúng yêu cầu
"tách công nợ theo giao dịch... dẫn nguồn gốc chi tiết".

## 8. Đóng ca — kỳ vọng khớp sổ (đối lập với lúc mở ca bị lệch)

Trước khi đóng, gọi `GET /fund/balances?branchId=<CN03_ID>` để lấy số dư thật
hiện tại (đã cộng trừ qua các giao dịch ở mục 2–4), dự kiến:

- `CASH_VND`: 80.000.000 − 2.520.000 (WU) − 4.650.000 (mua GBP) + 1.575.000
  (bán GBP) = **74.405.000**
- `CASH_USD`: 3.500 − 300 (WU) − 200 (MG) = **3.000**
- `FUND_A_GBP`: **100**

**Endpoint:** `POST /shifts/{SHIFT_ID}/close` (dùng `STAFF_TOKEN`)

```json
{
  "closingCounts": [
    { "currency": "VND", "actualAmount": 74405000 },
    { "currency": "USD", "actualAmount": 3000 },
    { "currency": "GBP", "actualAmount": 100 },
    { "currency": "AUD", "actualAmount": 0 },
    { "currency": "JPY", "actualAmount": 0 },
    { "currency": "EUR", "actualAmount": 0 },
    { "currency": "SGD", "actualAmount": 0 },
    { "currency": "THB", "actualAmount": 0 },
    { "currency": "CNY", "actualAmount": 0 },
    { "currency": "HKD", "actualAmount": 0 },
    { "currency": "KRW", "actualAmount": 0 },
    { "currency": "CAD", "actualAmount": 0 },
    { "currency": "CHF", "actualAmount": 0 },
    { "currency": "NZD", "actualAmount": 0 },
    { "currency": "TWD", "actualAmount": 0 },
    { "currency": "MYR", "actualAmount": 0 },
    { "currency": "IDR", "actualAmount": 0 },
    { "currency": "PHP", "actualAmount": 0 },
    { "currency": "LAK", "actualAmount": 0 },
    { "currency": "KHR", "actualAmount": 0 }
  ],
  "note": "Đóng ca CN03 - khớp sổ"
}
```

**Kết quả mong đợi:** `status: "CLOSED"`, mọi dòng trong `cashCount.lines` có
`variance: 0` — đối lập với `variance: -100000` lúc mở ca ở Bước 1.6, chứng
minh kiểm quỹ phát hiện đúng cả lúc lệch lẫn lúc khớp. Nếu số dư thực tế lúc
anh test khác con số dự kiến trên (do làm thêm bước khác), hãy dùng đúng số
lấy từ `GET /fund/balances` ngay trước khi đóng ca.

## 9. Báo cáo (F10) — 5 loại chưa test trước (`mg`, `debt`, `bank`, `gap`, `transfer`)

**Endpoint:** `POST /reports/generate` (role ADMIN/MANAGER/AUDITOR), lặp lại
với từng body sau, `format` đổi giữa `PREVIEW`/`PDF`/`EXCEL` tùy ý:

```json
{ "reportType": "mg", "format": "PREVIEW", "branchId": "<CN03_ID>" }
```

```json
{ "reportType": "debt", "format": "PREVIEW" }
```

```json
{ "reportType": "bank", "format": "PDF" }
```

```json
{ "reportType": "gap", "format": "PREVIEW" }
```

```json
{ "reportType": "transfer", "format": "PREVIEW" }
```

**Kết quả mong đợi:** mỗi request `201`. `mg`/`debt` phải phản ánh đúng số
liệu vừa tạo ở CN03 (payout 200 USD, outstanding 0 sau khi tất toán). `bank`
với `format: PDF` phải tải về file PDF hợp lệ. `gap` liệt kê cảnh báo (nếu
còn công nợ/lệch quỹ chưa xử lý). `transfer` hiện chỉ trả ghi chú tạm
("chưa có trong bản tổng hợp — sẽ bổ sung theo F10.6") — **đây là điểm cần
lưu ý với anh**, báo cáo Điều động vốn trong DongDav6.md **chưa thực sự có dữ
liệu**, chỉ là placeholder.

Đối chiếu thêm bằng `GET /reports/summary?branchId=<CN03_ID>` và
`GET /reports/dashboard-operations?date=2026-08-28` — số liệu phải khớp với
các giao dịch vừa tạo ở CN03.

## 10. Quỹ A trung tâm — bán ngoại tệ có Tỷ giá + Khấu trừ (dùng GBP)

Yêu cầu: *"bán ngoại tệ Quỹ A ở mỗi loại ngoại tệ thêm 1 ô Tỷ giá và 1 ô Khấu
trừ, sau đó mới tính thành tiền VNĐ"*. Lần trước đã test với EUR — lần này
dùng **GBP** và số khác để xác nhận công thức không phụ thuộc loại tiền.

**(a) Nạp thử GBP vào Quỹ A trung tâm để có tồn mà bán:**

**Endpoint:** `POST /fund/central-movements` (role ADMIN)

```json
{
  "direction": "IN",
  "sourceType": "CASH",
  "items": [{ "currencyCode": "GBP", "amount": 300 }],
  "note": "Nhập Quỹ A GBP - test"
}
```

**(b) Bán 300 GBP, tỷ giá 31.500, khấu trừ 20.000đ:**

**Endpoint:** `POST /fund/central-conversions` (role ADMIN)

```json
{
  "items": [{ "currencyCode": "GBP", "amount": 300, "rate": 31500, "deduction": 20000 }],
  "note": "Bán GBP Quỹ A - test"
}
```

**Kết quả mong đợi:** `vndAmount: 9430000` — công thức
`300 × 31.500 − 20.000 = 9.430.000`. Nếu số trả về khác, đây là bug cần báo
lại ngay (công thức lần trước với EUR đã đúng, nên nếu GBP sai thì có vấn đề
làm tròn hoặc phụ thuộc loại tiền cụ thể).

## 11. Audit log & Notification

- `GET /audit-logs` (role ADMIN/MANAGER/AUDITOR) → phải thấy đầy đủ log cho
  từng action ở CN03 vừa làm (POST wu/transactions, POST mg/transactions,
  PATCH shifts/.../close...), field nhạy cảm (`password`, `accessToken`,
  `refreshToken`) phải bị che thành `"***"`.
- `GET /notifications` (dùng `STAFF_TOKEN` hoặc token của người tạo phiếu) →
  phải có thông báo tương ứng các mốc: tạo tài khoản `staff02`, xác nhận tiếp
  quỹ, đóng ca CN03.
- `GET /notifications/unread-count` → số `count` giảm dần sau khi
  `PATCH /notifications/read-all`.

## 12. Bảng đối chiếu nhanh với DongDav6.md

| Yêu cầu DongDav6.md | Bước test | Kết quả |
| --- | --- | --- |
| Ngân hàng: Form GD + Xuất PDF | — | Chưa có endpoint PDF riêng cho Ngân hàng (chỉ WU có) — cần xác nhận có đúng phạm vi không |
| Ngân hàng: ghi nhận CK hằng ngày | Bước 6.3 | ❌ Lỗi 500 — cần migration |
| Ngân hàng chính Cty số dư 0 | Bước 6.1 | ✅ Tài khoản mới mặc định `currentBalance: 0` |
| Công nợ: tách theo giao dịch, gom theo List (CN, Ngày) | Bước 7.3 | ✅ |
| WU: Form GD + Xuất PDF | Bước 2 | ✅ |
| Đối chiếu: tách 2 nghiệp vụ | Bước 5.1/5.2 (KTTH) hoạt động; Bước 5.4 (STAFF upload) vẫn lỗi | ⚠️ 1/2 luồng |
| Báo cáo (8 loại) | Bước 9 | ✅ trừ `transfer` còn placeholder |
| Quỹ: bán ngoại tệ Quỹ A + Tỷ giá + Khấu trừ | Bước 10 | ✅ |

## 13. Việc cần anh xác nhận

1. Có muốn tạo migration thêm `ADVANCE_CK`, `ADVANCE_SETTLE` vào enum
   `bank_movement_type` để chạy được tạm ứng CK không?
2. Có muốn tạo migration thêm `JOURNAL_ONLY` vào enum
   `reconciliation_item_status` và thêm cột `code` vào `reconciliation_items`
   để chạy được luồng STAFF upload Journal không?
3. Có cần bổ sung API `POST /banks` và `POST /bank/accounts` để không phải
   dùng Prisma Studio/SQL khi setup ngân hàng mới?
4. Báo cáo "Điều động Vốn" (`reportType: transfer`) hiện chỉ là placeholder —
   có cần triển khai thật theo F10.6 không?


cd /Users/lyq02/Desktop/DongDa

# 1. Cất tạm TOÀN BỘ thay đổi hiện tại (kể cả file mới chưa track)
git stash push --include-untracked -m "wip trước khi tách nhánh"

# 2. Tạo nhánh mới từ main (đúng git flow trong backend/CLAUDE.md: feat/<tên>)
git checkout -b feat/test-flows-and-bugfix

# 3. Lấy lại toàn bộ thay đổi vừa cất vào nhánh mới
git stash pop

# 4. Chỉ add đúng các file của phiên này (KHÔNG add file lạ ở trên)
git add BACKEND_READING_GUIDE.md TEST_FLOWS.md backend/DongDav6.md \
  backend/src/application/use-cases/reports/build-pdf.ts \
  backend/src/application/use-cases/reconciliation/reconciliation.use-cases.ts \
  backend/src/interfaces/http/controllers/reconciliation.controller.ts \
  backend/src/interfaces/http/controllers/wu.controller.ts \
  backend/src/application/dtos/bank/bank.dto.ts \
  backend/src/application/use-cases/bank/bank.use-cases.ts \
  backend/src/interfaces/http/controllers/bank.controller.ts \
  backend/src/infrastructure/database/repositories/prisma-debt.repository.ts \
  backend/src/application/dtos/fund/fund.dto.ts \
  backend/src/application/use-cases/fund/fund-transfer.use-cases.ts \
  backend/src/application/use-cases/reports/report-model.ts

# 5. Commit
git commit -m "fix: sửa lỗi xuất PDF và scope đối chiếu Journal; thêm tài liệu test theo DongDav6.md"

# 6. Push nhánh mới lên remote (chỉ chạy khi anh đã sẵn sàng chia sẻ)
git push -u origin feat/test-flows-and-bugfix