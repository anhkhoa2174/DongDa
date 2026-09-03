-- Hủy một ADVANCE_CK có thể vẫn để tài khoản âm khi còn các khoản ứng khác.
-- Chỉ cho phép số dư âm đối với bút toán đảo giao dịch chuyển tiền hợp lệ,
-- đồng thời buộc số dư sau phải tăng đúng bằng số tiền được hoàn lại.
ALTER TABLE bank_balance_movements
    DROP CONSTRAINT IF EXISTS chk_bank_movements_non_negative_balance;

ALTER TABLE bank_balance_movements
    ADD CONSTRAINT chk_bank_movements_non_negative_balance
    CHECK (
        movement_type = 'ADVANCE_CK'
        OR (balance_before >= 0 AND balance_after >= 0)
        OR (
            movement_type = 'TRANSFER_IN'
            AND bank_reference LIKE 'DOMESTIC_VOID:%'
            AND balance_before < 0
            AND balance_after = balance_before + amount
        )
    ) NOT VALID;
