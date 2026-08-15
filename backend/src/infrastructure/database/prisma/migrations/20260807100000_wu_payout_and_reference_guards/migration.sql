ALTER TABLE wu_transaction_details
ADD COLUMN payout_currency currency_code DEFAULT 'USD';

UPDATE wu_transaction_details
SET payout_currency = CASE
  WHEN received_usd > 0 THEN 'USD'::currency_code
  WHEN received_vnd = wu_vnd_amount THEN 'VND'::currency_code
  ELSE 'USD'::currency_code
END;

ALTER TABLE wu_transaction_details
ALTER COLUMN payout_currency SET NOT NULL;

ALTER TABLE wu_transaction_details
ADD CONSTRAINT chk_wu_payout_currency CHECK (payout_currency IN ('USD', 'VND'));

CREATE OR REPLACE FUNCTION enforce_completed_transaction_reference()
RETURNS TRIGGER AS $$
DECLARE
  v_mtcn VARCHAR(50);
  v_reference VARCHAR(50);
BEGIN
  IF NEW.status <> 'COMPLETED' OR OLD.status = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  IF NEW.operation_code = 'WU' THEN
    SELECT mtcn INTO v_mtcn FROM wu_transaction_details WHERE transaction_id = NEW.id;
    IF v_mtcn IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('WU:' || v_mtcn));
      IF EXISTS (
        SELECT 1 FROM wu_transaction_details detail
        JOIN customer_transactions txn ON txn.id = detail.transaction_id
        WHERE detail.mtcn = v_mtcn AND detail.transaction_id <> NEW.id AND txn.status = 'COMPLETED'
      ) THEN
        RAISE EXCEPTION 'MTCN % already has a completed transaction', v_mtcn USING ERRCODE = '23505';
      END IF;
    END IF;
  ELSIF NEW.operation_code = 'MG' THEN
    SELECT reference_no INTO v_reference FROM mg_transaction_details WHERE transaction_id = NEW.id;
    IF v_reference IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('MG:' || v_reference));
      IF EXISTS (
        SELECT 1 FROM mg_transaction_details detail
        JOIN customer_transactions txn ON txn.id = detail.transaction_id
        WHERE detail.reference_no = v_reference AND detail.transaction_id <> NEW.id AND txn.status = 'COMPLETED'
      ) THEN
        RAISE EXCEPTION 'MoneyGram reference % already has a completed transaction', v_reference USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_completed_transaction_reference
BEFORE UPDATE OF status ON customer_transactions
FOR EACH ROW EXECUTE FUNCTION enforce_completed_transaction_reference();
