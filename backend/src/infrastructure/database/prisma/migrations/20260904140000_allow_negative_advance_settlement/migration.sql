-- Một tài khoản có thể có nhiều khoản ADVANCE_CK chưa hoàn. Khi hoàn từng phiếu,
-- số dư trước và sau ADVANCE_SETTLE có thể vẫn âm cho tới phiếu cuối cùng.
ALTER TABLE bank_balance_movements
    DROP CONSTRAINT IF EXISTS chk_bank_movements_non_negative_balance;

ALTER TABLE bank_balance_movements
    ADD CONSTRAINT chk_bank_movements_non_negative_balance
    CHECK (
        movement_type = 'ADVANCE_CK'
        OR (balance_before >= 0 AND balance_after >= 0)
        OR (
            movement_type = 'ADVANCE_SETTLE'
            AND balance_after = balance_before + amount
        )
        OR (
            movement_type = 'TRANSFER_IN'
            AND bank_reference LIKE 'DOMESTIC_VOID:%'
            AND balance_before < 0
            AND balance_after = balance_before + amount
        )
    ) NOT VALID;
