ALTER TABLE approval_requests
ADD COLUMN payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE customer_transactions
ADD COLUMN replacement_of_transaction_id UUID,
ADD COLUMN revision INTEGER NOT NULL DEFAULT 1,
ADD CONSTRAINT fk_customer_transaction_replacement
  FOREIGN KEY (replacement_of_transaction_id)
  REFERENCES customer_transactions(id)
  ON DELETE RESTRICT;

CREATE INDEX idx_customer_transactions_replacement_of
ON customer_transactions(replacement_of_transaction_id);

DROP INDEX IF EXISTS uq_wu_mtcn;
ALTER TABLE mg_transaction_details DROP CONSTRAINT IF EXISTS uq_mg_reference_no;
CREATE INDEX idx_wu_mtcn ON wu_transaction_details(mtcn);
CREATE INDEX idx_mg_reference_no ON mg_transaction_details(reference_no);

CREATE OR REPLACE FUNCTION enforce_one_completed_wu_mtcn()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('WU:' || NEW.mtcn));
  IF EXISTS (
    SELECT 1
    FROM wu_transaction_details detail
    JOIN customer_transactions txn ON txn.id = detail.transaction_id
    WHERE detail.mtcn = NEW.mtcn
      AND detail.transaction_id <> NEW.transaction_id
      AND txn.status = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'MTCN % already has a completed transaction', NEW.mtcn
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_one_completed_mg_reference()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('MG:' || NEW.reference_no));
  IF EXISTS (
    SELECT 1
    FROM mg_transaction_details detail
    JOIN customer_transactions txn ON txn.id = detail.transaction_id
    WHERE detail.reference_no = NEW.reference_no
      AND detail.transaction_id <> NEW.transaction_id
      AND txn.status = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'MoneyGram reference % already has a completed transaction', NEW.reference_no
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_one_completed_wu_mtcn
BEFORE INSERT OR UPDATE OF mtcn ON wu_transaction_details
FOR EACH ROW EXECUTE FUNCTION enforce_one_completed_wu_mtcn();

CREATE TRIGGER trg_one_completed_mg_reference
BEFORE INSERT OR UPDATE OF reference_no ON mg_transaction_details
FOR EACH ROW EXECUTE FUNCTION enforce_one_completed_mg_reference();
