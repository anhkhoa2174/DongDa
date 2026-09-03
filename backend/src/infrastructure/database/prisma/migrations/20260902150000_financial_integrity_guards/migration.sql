ALTER TABLE bank_accounts
    ADD CONSTRAINT chk_bank_accounts_non_negative_balance
    CHECK (current_balance >= 0 AND available_balance >= 0);

-- Ba movement lịch sử cũ đang có balance_before/balance_after âm. NOT VALID giữ nguyên
-- dữ liệu kiểm toán cũ nhưng PostgreSQL vẫn kiểm tra mọi INSERT/UPDATE mới.
ALTER TABLE bank_balance_movements
    ADD CONSTRAINT chk_bank_movements_non_negative_balance
    CHECK (balance_before >= 0 AND balance_after >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION prevent_posted_financial_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status::text = 'POSTED' THEN
        RAISE EXCEPTION 'Posted financial history in table % is append-only', TG_TABLE_NAME
            USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_posted_ledger_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_status text;
BEGIN
    SELECT status::text INTO parent_status
    FROM ledger_entries
    WHERE id = OLD.ledger_entry_id;

    IF parent_status = 'POSTED' THEN
        RAISE EXCEPTION 'Ledger lines of a posted entry are append-only'
            USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_ledger_entries_append_only
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_financial_history_mutation();

CREATE TRIGGER trg_ledger_lines_append_only
BEFORE UPDATE OR DELETE ON ledger_lines
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_line_mutation();

CREATE TRIGGER trg_bank_movements_append_only
BEFORE UPDATE OR DELETE ON bank_balance_movements
FOR EACH ROW EXECUTE FUNCTION prevent_posted_financial_history_mutation();

CREATE TRIGGER trg_cash_movements_append_only
BEFORE UPDATE OR DELETE ON cash_movements
FOR EACH ROW EXECUTE FUNCTION prevent_posted_financial_history_mutation();

CREATE TRIGGER trg_debt_movements_append_only
BEFORE UPDATE OR DELETE ON debt_movements
FOR EACH ROW EXECUTE FUNCTION prevent_posted_financial_history_mutation();
