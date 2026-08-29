-- DongDav6: (1) tạm ứng CK hằng ngày trên tài khoản ngân hàng; (2) chi nhánh upload Journal chờ KTTH duyệt.
ALTER TYPE bank_movement_type ADD VALUE IF NOT EXISTS 'ADVANCE_CK';
ALTER TYPE bank_movement_type ADD VALUE IF NOT EXISTS 'ADVANCE_SETTLE';
ALTER TYPE reconciliation_item_status ADD VALUE IF NOT EXISTS 'JOURNAL_ONLY';
-- Mã MTCN/Reference của dòng Journal chờ duyệt (chưa có journal_row) lưu trực tiếp trên item.
ALTER TABLE reconciliation_items ADD COLUMN IF NOT EXISTS code VARCHAR(150);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_code ON reconciliation_items(code);
