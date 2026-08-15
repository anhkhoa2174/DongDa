# Module Tỷ Giá

Module tỷ giá quản lý toàn bộ tỷ giá nghiệp vụ của Đống Đa: Paid WU/MG, tỷ giá ngân hàng, và tỷ giá mua/bán ngoại tệ. UI chỉ hiển thị tỷ giá đang `ACTIVE`; tỷ giá thay thế nằm ở trạng thái `DRAFT` cho đến khi được duyệt.

## Mục Tiêu

- KTTH/Giám đốc tạo tỷ giá mới ở trạng thái `DRAFT`.
- KTTH/Giám đốc duyệt để tỷ giá mới thành `ACTIVE`.
- Khi duyệt tỷ giá mới cùng loại, bản `ACTIVE` cũ tự chuyển `SUPERSEDED`.
- Nhân viên chi nhánh chỉ dùng tỷ giá `ACTIVE` khi tạo WU, MG, mua/bán ngoại tệ.
- Công nợ USD dùng `BANK_RATE` để quy đổi phần lẻ USD sang VND.

## Nhóm Tỷ Giá

```txt
PAID_BUY     Paid mua, áp dụng cho WU/MG khi khách nhận VND.
PAID_SELL    Paid bán, áp dụng cho WU/MG khi khách nhận USD.
BANK_RATE    Tỷ giá ngân hàng, dùng xử lý phần lẻ công nợ USD.
FX_BUY       Tỷ giá mua ngoại tệ từ khách: USD, EUR, AUD...
FX_SELL      Tỷ giá bán ngoại tệ cho khách: USD, EUR, AUD...
```

Provider mặc định:

```txt
PAID_BUY / PAID_SELL  -> WU_MG
BANK_RATE             -> BANK
FX_BUY / FX_SELL      -> INTERNAL
```

Các rate type legacy `WU_SYSTEM`, `WU_PROVIDER`, `MG_SYSTEM` vẫn còn trong enum để không phá dữ liệu cũ, nhưng không dùng cho flow tạo mới.

## Vòng Đời

```txt
DRAFT
  -> ACTIVE      khi được duyệt
  -> REJECTED    khi bị từ chối

ACTIVE
  -> SUPERSEDED  khi tỷ giá mới cùng identity được duyệt
```

Identity của một tỷ giá:

```txt
rate_type + provider + from_currency + to_currency
```

Ví dụ:

```txt
PAID_SELL + WU_MG + USD + VND
```

Tại một thời điểm chỉ nên có 1 bản `ACTIVE` cho cùng identity.

## Luồng Tạo/Duyệt

1. Người có quyền vào trang `Duyệt tỷ giá`.
2. Chọn loại tỷ giá.
3. Chọn hoặc nhập mã ngoại tệ.
4. Nhập tỷ giá VND.
5. Tạo bản thay thế ở trạng thái `DRAFT`.
6. Người có quyền duyệt hoặc từ chối.
7. Khi duyệt:
   - bản mới chuyển `ACTIVE`;
   - bản active cũ cùng identity chuyển `SUPERSEDED`.

## API

Backend controller:

```txt
backend/src/interfaces/http/controllers/exchange-rate.controller.ts
```

Endpoint:

```txt
POST   /api/v1/exchange-rates
GET    /api/v1/exchange-rates
GET    /api/v1/exchange-rates/active
GET    /api/v1/exchange-rates/history
PATCH  /api/v1/exchange-rates/:id/approve
PATCH  /api/v1/exchange-rates/:id/reject
POST   /api/v1/exchange-rates/parse-image   multipart field `image`
POST   /api/v1/exchange-rates/batch         tạo nhiều DRAFT trong một transaction
```

Quyền:

```txt
GET /active và GET danh sách  mọi user đã đăng nhập
GET /history                  ADMIN, MANAGER, AUDITOR
POST   ADMIN, MANAGER
PATCH  ADMIN, MANAGER
```

Query lịch sử:

```txt
page, pageSize
status, rateType
keyword       tên người nhập
from, to      khoảng ngày tạo theo múi giờ Việt Nam
```

Response lịch sử:

```ts
{
  items: Array<ExchangeRate & {
    createdByName: string;
    approvedByName?: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
```

Payload tạo tỷ giá:

```ts
{
  rateType: 'PAID_BUY' | 'PAID_SELL' | 'BANK_RATE' | 'FX_BUY' | 'FX_SELL';
  provider?: 'WU_MG' | 'BANK' | 'INTERNAL';
  fromCurrency: string;
  toCurrency?: 'VND';
  rate: number;
  effectiveFrom?: string;
}
```

Backend sẽ tự normalize provider theo `rateType`, nên UI không cần tin vào input provider để quyết định nghiệp vụ.

## Nhập Tỷ Giá Từ Ảnh

GĐ/KTTH có thể chọn **Nhập tỷ giá từ ảnh** trên trang tạo/duyệt:

1. Chọn một ảnh JPEG, PNG hoặc WebP, tối đa 10 MB.
2. Frontend gửi ảnh tới `POST /exchange-rates/parse-image`.
3. Backend gửi ảnh inline tới Gemini và yêu cầu structured JSON theo schema nghiệp vụ.
4. Backend whitelist loại tỷ giá, provider, mã ngoại tệ, số dương và loại dòng trùng.
5. Người dùng xem lại, sửa hoặc xóa từng dòng trong modal.
6. `POST /exchange-rates/batch` tạo toàn bộ bản ghi `DRAFT` trong một DB transaction.
7. Tỷ giá chỉ trở thành `ACTIVE` sau thao tác duyệt riêng.

Cấu hình chỉ đặt trong `backend/.env`:

```env
GEMINI_API_KEY=your-google-ai-api-key
GEMINI_MODEL=gemini-2.5-flash
```

API key không được đặt trong biến `VITE_*` hoặc gửi xuống trình duyệt. System prompt coi chữ trong ảnh là dữ liệu không tin cậy, cấm làm theo chỉ dẫn trong ảnh, cấm suy đoán số bị mờ và cấm tự duyệt tỷ giá.

## Frontend Files

```txt
api/exchangeRate.api.ts
hooks/useExchangeRates.ts
pages/ExchangeRateApprovalPage.tsx
pages/ExchangeRatePage.tsx
pages/ExchangeRateHistoryPage.tsx
data/exchangeRates.mock.ts
model/exchangeRate.types.ts
routes.tsx
```

Luồng API thật đang nằm ở:

```txt
api/exchangeRate.api.ts
hooks/useExchangeRates.ts
pages/ExchangeRateApprovalPage.tsx
pages/ExchangeRateHistoryPage.tsx
```

Màn lịch sử dùng phân trang và lọc ở backend, không dùng mock data.

## Backend Files

```txt
backend/src/domain/entities/exchange-rate.entity.ts
backend/src/domain/repositories/exchange-rate.repository.ts
backend/src/application/dtos/exchange-rate/exchange-rate.dto.ts
backend/src/application/use-cases/exchange-rate/*
backend/src/infrastructure/database/repositories/prisma-exchange-rate.repository.ts
backend/src/interfaces/http/controllers/exchange-rate.controller.ts
```

Prisma schema:

```txt
backend/src/infrastructure/database/prisma/schema.prisma
```

Migration liên quan:

```txt
20260729111500_add_wu_mg_provider
20260729111600_migrate_wu_mg_exchange_rates
20260729112500_add_bank_rate_type
20260729112600_migrate_mg_system_rates
```

## Cách Các Module Khác Dùng Tỷ Giá

WU:

```txt
Khách nhận USD -> PAID_SELL + WU_MG + USD/VND
Khách nhận VND -> PAID_BUY  + WU_MG + USD/VND
```

MG:

```txt
Khách nhận USD -> PAID_SELL + WU_MG + USD/VND
Khách nhận VND -> PAID_BUY  + WU_MG + USD/VND
```

Mua/bán ngoại tệ:

```txt
Mua từ khách -> FX_BUY  + INTERNAL + currency/VND
Bán cho khách -> FX_SELL + INTERNAL + currency/VND
```

Công nợ USD:

```txt
Phần nguyên USD xử lý bằng USD tiền mặt.
Phần lẻ USD quy đổi sang VND bằng BANK_RATE + BANK + USD/VND.
```

## Quy Ước UI

- Danh sách chính chỉ hiển thị `ACTIVE`.
- Bảng chờ duyệt chỉ hiển thị `DRAFT`.
- Không hiển thị bản `SUPERSEDED` trong danh sách tạo/duyệt hằng ngày.
- Mã ngoại tệ được chuẩn hóa uppercase 3 ký tự.
- Tỷ giá là số dương, đơn vị mặc định là VND cho 1 đơn vị ngoại tệ.

## Checklist Test

1. Tạo `PAID_BUY` USD/VND, provider hiển thị `WU_MG`.
2. Duyệt `PAID_BUY`, bản chuyển `ACTIVE`.
3. Tạo `PAID_BUY` USD/VND mới, bản cũ vẫn `ACTIVE`, bản mới `DRAFT`.
4. Duyệt bản mới, bản cũ chuyển `SUPERSEDED`.
5. Tạo WU khách nhận VND, form lấy `PAID_BUY`.
6. Tạo WU khách nhận USD, form lấy `PAID_SELL`.
7. Tạo MG khách nhận VND, form lấy `PAID_BUY`.
8. Tạo MG khách nhận USD, form lấy `PAID_SELL`.
9. Tạo `BANK_RATE` USD/VND, provider hiển thị `BANK`.
10. Tạo `FX_BUY/FX_SELL` cho ngoại tệ mới, provider hiển thị `INTERNAL`.
11. Mở lịch sử bằng GĐ/KTTH/Auditor, lọc theo trạng thái, loại, ngoại tệ và ngày tạo.
12. Đăng nhập nhân viên chi nhánh, menu và route lịch sử không được hiển thị.

## Lưu Ý

- Không format số bằng `Intl` trực tiếp trong value của input text thường; dùng `InputNumber` formatter/parser.
- Không để component nghiệp vụ tự quyết định provider cuối cùng; backend đã normalize provider.
- Các giao dịch đã tạo phải lưu snapshot `system_rate` và `applied_rate`, không phụ thuộc tỷ giá active hiện tại.
