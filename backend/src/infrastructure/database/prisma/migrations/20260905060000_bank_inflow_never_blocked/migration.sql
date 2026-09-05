-- Lỗi thật vừa gặp trên bản test (team báo "chuyển khoản trả tiền mặt" bị lỗi):
--   TRANSFER_IN (khách chuyển khoản vào, mình trả tiền mặt) trên 1 TK đang âm sẵn do còn khoản
--   ADVANCE_CK khác chưa hoàn: balance_before -28.818.000 -> balance_after +21.232.000 (CỘNG tiền vào,
--   kết quả tốt lên rõ ràng) vẫn bị chặn vì constraint cũ bắt balance_before >= 0 cho mọi loại trừ
--   ADVANCE_CK/ADVANCE_SETTLE. Sai logic: dòng tiền VÀO không bao giờ được phép chặn, vì nó luôn làm
--   số dư tốt lên (hoặc ít nhất không xấu đi) — TK đang âm do ứng CK là trạng thái hợp lệ, tiền vào để
--   trả dần là đúng mục đích, không phải lỗi.
-- Bỏ hẳn điều kiện balance_before (không bảo vệ được gì thêm ngoài balance_after cho dòng tiền ra).
-- Dòng tiền VÀO (DEPOSIT, TRANSFER_IN, ADVANCE_SETTLE) luôn được phép bất kể số dư trước/sau.
-- Dòng tiền RA (WITHDRAW, TRANSFER_OUT, RECONCILIATION...) vẫn phải đảm bảo balance_after >= 0.
-- ADVANCE_CK (ứng CK) vẫn được phép âm hoàn toàn như thiết kế.
ALTER TABLE bank_balance_movements DROP CONSTRAINT IF EXISTS chk_bank_movements_non_negative_balance;
ALTER TABLE bank_balance_movements
    ADD CONSTRAINT chk_bank_movements_non_negative_balance
    CHECK (
        movement_type = 'ADVANCE_CK'
        OR movement_type IN ('DEPOSIT', 'TRANSFER_IN', 'ADVANCE_SETTLE')
        OR balance_after >= 0
    ) NOT VALID;
