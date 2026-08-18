# DongDa — Bàn giao & Bối cảnh dự án (cho session/người tiếp theo)

> File này tổng hợp **mọi thứ cần biết** để tiếp tục dự án: nghiệp vụ, feedback
> khách hàng, những gì đã làm, việc còn lại, và các quyết định đang chờ.
> Đọc kèm: `../CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`.

---

## 1. Dự án là gì

App quản lý **quỹ tiền + giao dịch Western Union (WU) / MoneyGram (MG)** đa chi
nhánh cho **Công ty TNHH TM DV PT Đống Đa**. Thay thế Excel/sổ giấy/Zalo.

**3 nghiệp vụ chính:**
1. **Chi trả WU/MG:** khách cầm mã ra nhận tiền; công ty ứng tiền mặt trả trước,
   WU/MG hoàn lại qua ngân hàng sau (→ sinh **công nợ**).
2. **Mua/bán ngoại tệ** (FX): USD, EUR, JPY...
3. **Quản lý quỹ** nhiều chi nhánh + 1 hội sở (tiếp quỹ, kiểm quỹ, điều chuyển).

**Stack:** Backend NestJS + Prisma + PostgreSQL (Clean/Hexagonal). Frontend React
+ Ant Design + Vite + TanStack Query. Chi tiết ở `backend/CLAUDE.md`,
`frontend/CLAUDE.md`.

---

## 2. Vai trò (roles)

| Viết tắt | Là ai | Quyền | Code |
|---|---|---|---|
| **GĐ** | Giám đốc | Toàn quyền | `ADMIN` |
| **KTTH** | Kế toán tổng hợp (ở hội sở) | Quản tiền, duyệt tỉ giá, đối chiếu, báo cáo. KHÔNG giao dịch trực tiếp khách | `MANAGER` |
| **NV** | Nhân viên chi nhánh | Ngồi quầy, trực tiếp trả tiền/đổi tiền khách | `STAFF` |
| — | Kiểm toán | Chỉ đọc | `AUDITOR` |

- `GLOBAL_ROLES` (ADMIN/MANAGER/AUDITOR) đi được mọi chi nhánh; STAFF khóa 1 chi nhánh.
- Nguồn sự thật: `backend/src/domain/entities/user.entity.ts` (`canAccessBranch`, `hasPermission`).

---

## 3. Luồng nghiệp vụ 1 ngày

1. **Sáng:** NV **mở ca** + **kiểm quỹ đầu ca** (đếm tiền). Phải có ca mở mới giao dịch được.
2. Hội sở **tiếp quỹ** xuống chi nhánh (để có tiền trả khách).
3. **Trong ngày:** NV làm **giao dịch** (WU/MG/mua-bán ngoại tệ). Mỗi GD dùng **tỉ giá** đang ACTIVE.
   - Trả tiền WU cho khách = ứng tiền mặt trước → **sinh công nợ** (WU nợ công ty).
4. **Chiều:** NV **đóng ca** + **kiểm quỹ cuối ca**. Lệch → **bắt nhập lý do**.
5. **Cuối ngày (KTTH/GĐ):** **đối chiếu** (journal WU/MG + tồn thực tế) → **báo cáo**.
6. WU/MG **hoàn tiền** vào tài khoản ngân hàng (ACB/MSB) → xóa công nợ.

---

## 4. Khái niệm nghiệp vụ QUAN TRỌNG (hay gây nhầm)

### Hội sở vs Chi nhánh
- **Hội sở** (`HEAD_OFFICE`, code `HO`, tên "Hội sở") = nhà mẹ, giữ tiền tổng.
- **Chi nhánh** (`BRANCH`): NCT, Tao Đàn, Bảy Hiền, An Đông... = cửa hàng con.
- Hội sở là 1 bản ghi branch riêng, KHÔNG trùng chi nhánh nào.

### Quỹ gốc vs Quỹ A
- **Quỹ gốc** = tiền mặt VND + USD (`CASH_VND`, `CASH_USD`).
- **Quỹ A** = các ngoại tệ khác (EUR, JPY, KRW... — `FUND_A_<CCY>`).
- Client muốn gộp hiển thị 2 nhóm này.

### Tỉ giá & Lãi/Lỗ WU (RẤT quan trọng)
- **WU KHÔNG báo tỉ giá** — WU chỉ báo **SỐ TIỀN** (USD hoặc VND).
- **Tỉ giá là của CÔNG TY** (do KTTH/GĐ đặt), gồm:
  - **Paid Mua** (`PAID_BUY`) — dùng khi khách nhận **VND**.
  - **Paid Bán** (`PAID_SELL`) — dùng khi khách nhận **USD**.
- Trong form WU có 2 tỉ giá: **applied rate** (NV áp, kéo thanh trong biên độ) và
  **system rate** (mốc Paid Mua/Bán).
- **Công thức lời:** `profit = (wuRate − appliedRate) × wuUsd`
  (`wuRate = wuVndAmount / wuUsdAmount`). Xem `backend/src/domain/entities/wu.entity.ts`.
- **Ví dụ:** WU báo 100 USD; wuRate 25.200; NV áp 25.000 → trả khách 2.500.000;
  WU hoàn 2.520.000 → **lời 20.000đ**.

### Paid Currency (WU hoàn)
- Là **loại tiền WU hoàn lại cho công ty** (USD hay VND) — lựa chọn RIÊNG của công ty.
- Form WU có 2 nút TÁCH RIÊNG: "Tiền khách nhận" (payout) vs "Paid Currency (WU hoàn)".
- **Feedback bug:** "chi nhánh Paid VNĐ mà hệ thống ghi Paid USD" — backend hiện lưu
  đúng `dto.paidCurrency`; nghi là do form mặc định USD hoặc do hiểu sai nghĩa.
  **CHƯA rõ định nghĩa chính xác "Paid Currency" → cần hỏi client** (xem mục 8).

### Trả khách USD chẵn + lẻ
- VD khách nhận 754 USD → có thể lấy **700 USD tiền mặt + 54 USD quy ra VND**.
- Form WU (WuWorkspacePage) đã có ô "Trả khách USD (số nguyên)" + "Trả khách VND".

### ACB / MSB
- 2 ngân hàng công ty dùng (ACB = Á Châu, MSB = Hàng Hải). WU/MG **hoàn tiền về**
  tài khoản ACB/MSB → dùng để **đối chiếu ngân hàng** (F9.4/F9.5, CHƯA làm).

### Công nợ
- Khi trả khách WU/MG = ứng tiền → **công nợ phải thu** (WU/MG nợ công ty).
- Đã đổi sang **gom theo NGÀY**: 1 dòng công nợ / (chi nhánh, provider, currency, business_date).

### Journal
- **Danh sách giao dịch WU/MG gửi về cuối ngày** (bản ghi phía WU/MG) → dùng
  **đối chiếu** với sổ công ty. "Upload journal" = tải file journal lên để máy so tự động.

---

## 5. Tài liệu nghiệp vụ (trong `docs/business/`)

| File | Nội dung |
|---|---|
| `Requirements_v1.1_Full.docx` / `v1.2` | **Yêu cầu chi tiết** — module F1..F12, business rules (BR-...). Trích text bằng python zipfile để đọc. |
| `DongDa_v2.0.docx` | Requirements bản gọn hơn (kiến trúc menu, MVP). |
| `dongda_v3_database_design_for_review.md` + `.sql` | Thiết kế DB v3 (54 bảng — nền tảng schema hiện tại). |
| `Official sổ theo dõi thu chi hằng ngày ... 01-2026.xlsx` | **SỔ QUỸ THẬT** công ty đang dùng — mỗi ngày 1 sheet. **Đây là format báo cáo client muốn** (xem mục 8). Cột: STT/Ngày/MTCN/Tên/Nhận từ ACB(USD,VND)/Chi(USD,VND)/Tồn(USD,VND) + Tồn đầu kỳ + tồn chạy dần. |
| `FORM MẪU BẢN FINAL 08-07-2025.xlsx` | **Mẫu FORM NHẬP LIỆU** phiếu chi WU/MG (phiếu ACB/MSB, thông tin người gửi/nhận/giấy tờ). KHÔNG phải mẫu báo cáo. |
| `WU Nguyễn cư trinh 10-8-26.pdf` | **Journal WU thật** — PDF **SCAN** (CamScanner, ảnh). 2 bảng: 27 GD USD + 10 GD VND. Cột: Ngày/Mã Người Điều Hành/MTCN/Loại Chi Trả/Tên Người Nhận/Số Tiền Thanh Toán/Thuế. MTCN dạng `440-280-1610`. |
| `MG ANTHIEN 10-07-2026.pdf` | **Journal MG thật** — PDF scan. Cột: STT/Ngày chi trả/Mã số giao dịch(8 số)/Họ tên người nhận/Họ tên người gửi/Số tiền/Loại tiền. |

---

## 6. Feedback KHÁCH HÀNG (Kiển Trần — chủ doanh nghiệp)

### Phần Chi nhánh (nhân viên)
- Tách quỹ **tiền mặt USD+VND thành "quỹ gốc"**, nhóm 2 là **"quỹ A"**.
- Nút **Tiếp quỹ + Kiểm quỹ tô màu vàng-đen**, đưa lên trước (nghiệp vụ chính);
  phiếu thu/chi để thường.
- Thanh kéo tỉ giá: **để bước 5** (hiện bước 50 quá thô). *(logic `validateAppliedRate`, `RATE_STEP`)*
- Trả khách **USD chẵn + lẻ** (700 USD + 54 quy VND).
- **Chuyển ngoại tệ Quỹ A chi nhánh → Quỹ A hội sở** — hiện tiếp quỹ chưa làm được.
- **Giao dịch chuyển khoản** ghi nhận thế nào? (phần ngân hàng còn dở).
- **BUG:** chi nhánh Paid VND mà hệ thống ghi Paid USD.

### Trang Giám đốc / Dashboard
- Tạo tài khoản NV: **bỏ email bắt buộc**, cho **1 user chọn NHIỀU chi nhánh** (tích chọn),
  **bớt điều kiện mật khẩu**.
- Dashboard: tổng vốn VND để nhỏ, **thêm tổng vốn quy USD**, 4 số USD/VND to + vàng.
- **"Kiểm quỹ tổng" chưa hoạt động** / "Quỹ chưa xem được".
- **Báo cáo:** nút chưa chạy (ĐÃ FIX), muốn **thống kê hết + tự chọn cột hiện ra**.

### Acc Giám Đốc (mới nhất)
- **Thông báo** ghi nhận toàn bộ giao dịch **tất cả chi nhánh**.
- **Lợi nhuận** chưa hiện ở trang chi nhánh.
- Quỹ Chung: tạo tên quỹ chung; **bán ngoại tệ Quỹ A hội sở thu VND ở đâu?**;
  **tổng vốn kiểm soát tăng/giảm theo tuần**; thêm dòng **Tiền mặt USD**;
  "Quỹ tại chi nhánh" thêm **tổng USD**.
- **Tỉ giá:** tạo **hàng loạt** (như tiếp quỹ); tách **2 tab Mua/Bán**; thêm cột
  **Quốc gia**; **cho nhập giá thập phân** (KRW 16.75 — bug); trình bày rõ hơn.

---

## 7. Đã LÀM (session này — branch `feat/DongDav4`)

**Commit của tôi (Khoa + AI):**
1. `fix(shift)` — Cho GĐ/KTTH mở/đóng ca (trước chỉ STAFF → kẹt cả luồng).
2. `fix(ledger)` — Sửa 500 khi Void/Deactivate GD (partial unique index cho bút toán đảo).
   → **Máy khác pull về phải `docker compose down -v && up -d --build`** để áp migration.
3. `fix(shift)` — Kiểm quỹ ca nhận đủ 20 loại tiền.
4. `feat(reconciliation)` — **Upload Journal WU/MG** (CSV/XLSX) + fix đọc tiếng Việt.
5. `feat(shift)` — **BR-F8.4-01**: bắt nhập lý do khi kiểm quỹ cuối ca lệch (BE+FE).
6. `feat(reports)` — Báo cáo theo từng loại (F10.2-8) + **xuất Excel thật** (F10.10).
7. `feat(reconciliation)` — **Đối chiếu quỹ F9.1** + tổng hợp F9.7 (hồi sinh màn mock).
8. `feat(reconciliation)` — **OCR đọc Journal PDF scan** (tesseract + poppler trong
   Dockerfile). WU 34/37, MG 1/1. Có bước KTTH rà lại/sửa vì OCR không 100%.
9. `fix(reconciliation)` — Chạy đối chiếu **tách theo từng loại tiền** (WU có USD+VND).
   **← commit này CHƯA push (local bb921a1), chờ lệnh push.**

**15/08/2026 (branch `DongDav5`, Khoa + AI):**
10. `feat(reconciliation)` — Journal có **tên khách hàng** (parse CSV/XLSX/OCR → lưu `journal_rows.customer_name`
    → cột Khách hàng ở chi tiết). **Chi nhánh tự upload Journal + đối chiếu** cho chính mình (backend ép branchId
    từ JWT, cả WU lẫn MG); GĐ/KTTH chạy MG toàn công ty hoặc từng chi nhánh, lọc lịch sử theo chi nhánh.
11. `feat(bank)` — **Mỗi chi nhánh có tài khoản ngân hàng riêng**: API tạo/ngưng tài khoản, ghi chuyển khoản/
    nộp/rút (`POST /bank/accounts/:id/movements`), FE bỏ mock, modal Thêm tài khoản + Tiền vào/ra, STAFF chỉ
    thấy/ghi tài khoản chi nhánh mình. Trước đó KHÔNG có cách nào tạo tài khoản NH (module chết).

**Còn dang dở (ưu tiên sau):** kiểm quỹ sai → quy trình xử lý + báo GĐ/KTTH; OCR ảnh (hiện chỉ PDF scan);
đối chiếu ngân hàng F9.4/F9.5 (sao kê ↔ biến động).

**Anh Quyền (Trương Quyền) làm song song:** UI (thu/chi, dashboard), form WU (chẵn/lẻ,
MTCN có gạch), **fix Quỹ A duplicate** (unique index), **công nợ theo ngày**, format
tiền/tỉ giá, tỉ giá thập phân. (Đã review — xem mục 9.)

---

## 8. QUYẾT ĐỊNH đang chờ CLIENT / anh Quyền (đừng tự đoán — CLAUDE.md)

1. **Journal WU/MG chỉ có bản PDF SCAN** (không có file Excel/CSV export). → đã làm
   OCR. Nếu client xuất được **file dữ liệu gốc** thì chính xác hơn nhiều (OCR sai
   vài số trên scan mờ). **Hỏi: cổng WU/MG có export Excel/CSV không?**
2. **Báo cáo Excel** — client muốn giống **sổ thu chi hằng ngày** (mục 5)?
   Cần xác nhận nghĩa cột: **"Nhận từ ACB"** = tiền WU/MG hoàn về? **"Chi"** = trả khách?
   **"Tồn"** = tồn tiền mặt chi nhánh? Và có muốn **liệt kê từng giao dịch + tự chọn cột** không?
3. **FX lãi/lỗ (F5.5)** — doc cho chọn **Average Cost HOẶC FIFO** (cấu hình khi triển
   khai). **Vướng:** ngoại tệ về qua **tiếp quỹ/tồn đầu kỳ** thì tính **giá vốn** theo gì?
   (không được coi = 0 → lãi ảo). **Hỏi client cách tính giá vốn cho ngoại tệ không-mua.**
4. **Paid Currency** — trả khách VND thì Paid Currency đúng ra là gì? Định nghĩa chính xác?
5. **Multi-branch (1 user nhiều chi nhánh)** — client muốn. Là thay đổi vừa-lớn (bảng
   nhiều-nhiều + JWT + guard + form + "STAFF chọn chi nhánh đang làm"). **Anh Quyền
   đang làm user profile → phối hợp kẻo đụng.**
6. **Void vs Deactivate** hiện làm y hệt nhau (cùng đảo tiền) — có đúng ý không?

---

## 9. Bug / lỗi đã biết (từ review)

- **[MEDIUM] WU rate band đảo ngược:** khi implied ≈ systemRate (chênh < 5), FE
  `getRateBounds/clampRate` cho ra `min > max` → backend đá 400 → **không tạo được GD**.
  Cần nới biên / bỏ ép bội-5 khi biên hẹp. (`WuWorkspacePage.tsx`)
- **[LOW] Tỉ giá rất nhỏ hiện "0":** IDR/LAK/KHR (≈0.0017) — `formatExchangeRate`
  mặc định 2 số lẻ. Chỉ hiển thị, giá trị lưu đúng.
- **Migration `unify_active_fund_currency_accounts`:** tên "unify" nhưng KHÔNG gộp —
  chỉ RAISE nếu có Quỹ A trùng sẵn. DB nào đang có trùng → **deploy fail**, phải dọn tay trước.
- **Ô "Quy đổi"** (TransactionsMainPage) cộng cả GD đã VOIDED — nên loại GD hủy.
- **Void = Deactivate** trùng chức năng.
- Báo cáo: mức chi tiết từng giao dịch + chọn cột **chưa làm** (mới có số tổng).

---

## 10. Còn THIẾU so với docs (chưa làm)

- **Đối chiếu ngân hàng F9.4/F9.5** (công nợ ↔ tiền về ngân hàng, sao kê) + upload sao kê.
- **Báo cáo ca F8.5** (tự sinh khi đóng ca) + **Duyệt ca F8.6** (KTTH/GĐ rà soát;
  cột `reviewed_by`/`approved_by` đã có sẵn trong bảng shifts).
- **FX lãi/lỗ F5.5** (chờ quyết cách tính giá vốn — mục 8.3).
- **Cảnh báo khách trùng tên khác MSKH F9.6.**
- **Tỉ giá theo tier / biên độ theo chi nhánh F2.1/F2.4.**
- **Dashboard riêng theo vai trò, biểu đồ xu hướng vốn.**
- **Chuyển + bán ngoại tệ Quỹ A ở hội sở** (feedback client).

---

## 11. Kỹ thuật — chạy & test

```bash
# Backend (tự migrate + seed). Sau khi pull nếu có migration mới -> down -v:
cd backend && docker compose up -d --build   # DB :5435, API :3000
# Frontend
cd frontend && npm run dev                    # :5173, proxy /api -> :3000
```

- **Tài khoản seed:** `admin` / `Admin@123456` (GĐ/ADMIN), `auditor` / (kiểm toán).
  Seed chỉ tạo Hội sở (HO) + admin + auditor → chi nhánh/NV/tỉ giá/quỹ phải tạo thêm.
- **FE gọi API thật:** `frontend/.env` có `VITE_USE_MOCK_API=false`.
- **OCR journal:** cần `tesseract-ocr + vie/eng + poppler-utils` (đã thêm vào
  `backend/Dockerfile.dev`). Code: `src/infrastructure/ocr/journal-ocr.ts` +
  `src/application/use-cases/reconciliation/ocr-journal-parse.ts`.
- **Reset DB test:** `docker compose down -v && docker compose up -d --build`.

### Dựng nhanh data test (qua API, sau khi reset DB)
Cần theo thứ tự để tạo được giao dịch WU: tạo chi nhánh → tạo+duyệt tỉ giá
(`PAID_BUY`, provider `WU_MG`, from `USD`) → nạp quỹ trung tâm → tiếp quỹ chi nhánh
→ confirm → mở ca → tạo WU. (Xem lịch sử lệnh curl trong session trước hoặc hỏi lại.)

### Máy dev
- WSL hay rớt do `.wslconfig` giới hạn RAM. Đã chỉnh `C:\Users\AnhKhoa\.wslconfig`
  lên `memory=12GB, processors=8, swap=4GB`. Docker Desktop tắt thì `docker` biến
  mất trong distro — bật lại Docker Desktop.

---

## 12. Trạng thái git

- Branch làm việc: **`feat/DongDav4`**.
- Đã push tới `96aa844` (OCR journal).
- **Chưa push:** `bb921a1` (fix đối chiếu tách theo loại tiền) — commit local, chờ push.
- Repo thuộc `anhkhoa2174` → SSH host `github.com` mặc định (KHÔNG phải github.com-pocket).
