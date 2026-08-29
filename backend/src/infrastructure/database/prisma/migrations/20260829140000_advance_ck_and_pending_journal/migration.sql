-- DongDav6: (1) tạm ứng CK hằng ngày trên tài khoản ngân hàng; (2) chi nhánh upload Journal chờ KTTH duyệt.
ALTER TYPE bank_movement_type ADD VALUE IF NOT EXISTS 'ADVANCE_CK';
ALTER TYPE bank_movement_type ADD VALUE IF NOT EXISTS 'ADVANCE_SETTLE';
ALTER TYPE reconciliation_item_status ADD VALUE IF NOT EXISTS 'JOURNAL_ONLY';
-- Mã MTCN/Reference của dòng Journal chờ duyệt (chưa có journal_row) lưu trực tiếp trên item.
ALTER TABLE reconciliation_items ADD COLUMN IF NOT EXISTS code VARCHAR(150);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_code ON reconciliation_items(code);
-- (bank_account_id, bank_reference) đang UNIQUE NULLS NOT DISTINCT -> mọi biến động không có mã tham chiếu
-- bị coi là trùng nhau (chỉ ghi được 1 dòng/tài khoản). Đổi về UNIQUE thường: NULL không trùng NULL.
ALTER TABLE bank_balance_movements DROP CONSTRAINT IF EXISTS uq_bank_movement_reference;
ALTER TABLE bank_balance_movements ADD CONSTRAINT uq_bank_movement_reference UNIQUE (bank_account_id, bank_reference);
