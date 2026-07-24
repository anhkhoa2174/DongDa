# Dong Da v3 Database Design - Draft For Review

## Muc Tieu Thiet Ke

Ban thiet ke nay dieu chinh schema v2 theo cac quy tac nghiep vu moi:

- Mot `user` dai dien cho dung mot `employee`.
- `employee` lam viec tai mot `branch`.
- WU, MG, mua/ban ngoai te, chuyen tien can mo ca de thuc hien.
- Tiep quy, thu/chi ngan hang, chi tien mat noi bo khong can mo ca.
- Journal WU/MG cuoi ngay la nguon xac nhan cong no thuc te.
- MG upload Journal cap cong ty, WU upload Journal theo chi nhanh.
- `ledger` la nguon su that tai chinh.
- Moi nghiep vu tien de tao but toan phai co nguoi tao, workflow/approval phu hop va audit duoc.

## Mo Hinh To Chuc Va Tai Khoan

Quan he chinh:

```txt
companies 1 - n branches
branches 1 - n employees
employees 1 - 0/1 users
users n - n roles
roles n - n permissions
```

Ly do tach `employees` khoi `users`:

- Employee la ho so nhan su.
- User la tai khoan dang nhap.
- Nhan vien co the chua co account.
- Account co the bi khoa nhung nhan vien van con lam viec.
- Sau nay chuyen chi nhanh chi can cap nhat employee/assignment, khong lam roi auth.

## Phan Nhom Nghiep Vu

### Nghiep Vu Bat Buoc Mo Ca

Dung bang `customer_transactions`.

Bao gom:

- WU
- MG
- FX mua/ban ngoai te
- Domestic transfer

Bat buoc co:

```txt
branch_id
shift_id NOT NULL
created_by_user_id
operation_type.requires_shift = true
```

Backend/DB can validate:

- Shift thuoc cung branch.
- Shift dang `OPEN` hoac `ACTIVE`.
- User/employee thuoc branch do.

### Nghiep Vu Khong Can Mo Ca

Dung cac bang nghiep vu rieng:

- `fund_transfers`
- `bank_balance_movements`
- `cash_movements`
- `debt_movements`
- `cash_counts`

Khong bat buoc `shift_id`.

Kiem soat bang:

```txt
permission
approval workflow
ledger entries
audit logs
```

## Ledger

Moi nghiep vu sau khi duyet/post se tao:

```txt
ledger_entries
ledger_lines
```

`ledger_entries.source_type + source_id` tro ve nghiep vu goc:

- CUSTOMER_TRANSACTION
- FUND_TRANSFER
- BANK_MOVEMENT
- CASH_MOVEMENT
- DEBT_MOVEMENT
- CASH_COUNT
- JOURNAL_RECONCILIATION
- DAY_CLOSING

`ledger_lines` ghi bien dong tren `fund_accounts`.

## Journal, Doi Soat Va Cong No Thuc Te

Cong no duoc tach thanh 2 lop:

```txt
EXPECTED_DEBT: phat sinh tu giao dich WU/MG trong ngay
ACTUAL_DEBT: chi tao sau khi Journal da doi soat va duyet
```

Luong xu ly:

```txt
Upload Journal
-> Parse rows
-> Match voi giao dich noi bo
-> Tao reconciliation_run
-> Review/approve
-> Tao ACTUAL_DEBT trong debt_movements
-> Post ledger
```

Voi MG:

```txt
journal_batches.scope = COMPANY
branch_id = NULL
```

MG co the dung tong cong ty, nhung lech tung chi nhanh. Khi do:

- Cong no thuc te cap cong ty lay theo Journal.
- Lech chi nhanh luu o `reconciliation_items`.
- Neu can dieu chinh thi tao `reconciliation_adjustments`.

Voi WU:

```txt
journal_batches.scope = BRANCH
branch_id = chi nhanh upload
```

Sau do co the gom cac batch WU vao reconciliation cap cong ty.

## Bank Statement Import

Ngan hang co 2 lop du lieu:

- `bank_balance_movements`: bien dong noi bo/he thong.
- `bank_statement_batches` va `bank_statement_rows`: sao ke ngan hang upload.

Bang `bank_reconciliation_items` dung de doi soat giua sao ke ngan hang va bien dong he thong.

## Exchange Rates

Bang `exchange_rates` luu:

- Paid buy/sell
- WU provider/system
- MG system
- FX buy/sell
- hieu luc theo thoi gian
- nguoi tao/duyet

## Approval Workflow

Cac nghiep vu back-office nhu tiep quy, chi tien mat, ngan hang, dieu chinh doi soat co the tao:

```txt
approval_requests
approval_steps
approval_actions
```

Component/UI chi can biet entity dang `PENDING/APPROVED/REJECTED`, con luong duyet nam o workflow.

## Dong Ngay

Cuoi ngay dung:

- `business_days`
- `day_closing_runs`
- `branch_daily_summaries`
- `company_daily_summaries`

De chot:

- giao dich trong ngay
- Journal da doi soat
- cong no thuc te
- quy tien mat/ngan hang/quy chi nhanh
- variance con treo

## Fund Accounts

Moi noi giu tien la mot `fund_account`:

- Tien mat VND cua chi nhanh
- Tien mat USD cua chi nhanh
- Quy A EUR/AUD/JPY...
- Tai khoan ngan hang
- Cong no

Viec nay giup bao cao:

```txt
Tien mat = CASH_VND + CASH_USD quy doi + FUND_A quy doi
Ngan hang = BANK accounts
Cong no = DEBT accounts
Tong quy chi nhanh = fund accounts cua branch
```

## Rule Chinh Can Duyet

1. `branches` se thay cho cach goi `departments` neu don vi lam viec chinh la chi nhanh/hoi so.
2. `users` khong con luu `branch_id`, `full_name`, `employee_code`; tat ca nam o `employees`.
3. `customer_transactions.shift_id` la bat buoc.
4. Cac nghiep vu back-office khong co `shift_id` bat buoc.
5. `operation_types.requires_shift` dung de backend va trigger validate.
6. Tat ca nghiep vu tien deu phai post vao ledger.
7. Thu/chi ngan hang co bang lich su bien dong rieng: `bank_balance_movements`.
8. Cong no thuc te chi tao tu reconciliation da duyet, khong tao truc tiep tu file upload.
9. Journal, bank statement va day closing la cac quy trinh rieng, deu co workflow/review.

## Cac Cau Hoi Can Duyet

- Mot employee co duoc lam nhieu branch khong? Ban hien tai thiet ke mot branch hien hanh.
- Role cua user la mot role hay nhieu role? Ban draft ho tro nhieu role bang `user_roles`.
- Back-office chi tien mat noi bo co can 2 buoc duyet khong, hay tao la POSTED ngay voi KTTH/Giam doc?
- Cong no WU/MG co can doi tac/provider rieng khong? Ban draft giu `debt_accounts` theo provider.
- MG Journal chung neu tong cong ty dung nhung chi nhanh lech thi co tu dong tao adjustment khong, hay chi ghi variance de KTTH xu ly?
- WU co can mot reconciliation cap cong ty gom tat ca batch chi nhanh khong?
