-- Migration trước (20260903090000) chỉ loại trừ ADVANCE_CK khỏi CHECK không-âm, quên ADVANCE_SETTLE.
-- Khi 1 tài khoản có NHIỀU khoản ứng CK chồng nhau chưa hoàn hết (số dư âm sâu), hoàn TỪNG khoản
-- một vẫn ra balance_after âm cho tới khi hoàn hết — đây là trạng thái hợp lệ, không phải lỗi.
-- Lỗi thật (23514) xảy ra trên môi trường test: balance_before -12.211.000 -> balance_after -11.211.000
-- khi hoàn 1.000.000 trong khi tài khoản còn nhiều khoản ứng khác chưa hoàn.
ALTER TABLE bank_balance_movements DROP CONSTRAINT IF EXISTS chk_bank_movements_non_negative_balance;
ALTER TABLE bank_balance_movements
    ADD CONSTRAINT chk_bank_movements_non_negative_balance
    CHECK (movement_type IN ('ADVANCE_CK', 'ADVANCE_SETTLE') OR (balance_before >= 0 AND balance_after >= 0)) NOT VALID;
