CREATE OR REPLACE FUNCTION prevent_posted_financial_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status::text = 'POSTED' THEN
        RAISE EXCEPTION 'Posted financial history in table % is append-only', TG_TABLE_NAME
            USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
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
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
