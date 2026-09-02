-- Nghiệp vụ (a Kiển 17/08): chi nhánh nhận tiền mặt của khách để chuyển khoản (CASH_TO_BANK) ghi ÂM
-- tạm thời vào tài khoản ngân hàng (ADVANCE_CK) cho tới khi KTTH/GĐ hoàn ứng. Migration
-- 20260902150000_financial_integrity_guards chặn nhầm luồng hợp lệ này bằng 2 lớp CHECK:
--   1) bank_accounts.current_balance/available_balance >= 0 — chặn ngay khi ghi ADVANCE_CK
--   2) bank_balance_movements.balance_before/balance_after >= 0 — chặn insert bút toán ADVANCE_CK
-- Gỡ constraint (1) vì current_balance là cột đơn, không phân biệt được "âm hợp lệ do đang ứng" với
-- "âm do lỗi" — validate việc đó ở tầng ứng dụng theo từng loại nghiệp vụ (nộp/rút/CK nội bộ/hoàn ứng
-- vẫn kiểm tra đủ số dư ở use-case tương ứng, chỉ ADVANCE_CK được phép âm).
-- Nới constraint (2) để chỉ chặn số dư âm cho các loại biến động KHÁC ADVANCE_CK.
ALTER TABLE bank_accounts DROP CONSTRAINT IF EXISTS chk_bank_accounts_non_negative_balance;

ALTER TABLE bank_balance_movements DROP CONSTRAINT IF EXISTS chk_bank_movements_non_negative_balance;
ALTER TABLE bank_balance_movements
    ADD CONSTRAINT chk_bank_movements_non_negative_balance
    CHECK (movement_type = 'ADVANCE_CK' OR (balance_before >= 0 AND balance_after >= 0)) NOT VALID;
