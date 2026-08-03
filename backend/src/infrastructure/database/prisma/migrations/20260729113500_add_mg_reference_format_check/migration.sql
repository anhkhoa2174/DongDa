DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_mg_reference_no_format'
  ) THEN
    ALTER TABLE mg_transaction_details
      ADD CONSTRAINT chk_mg_reference_no_format
      CHECK (reference_no ~ '^[A-Z0-9]{8}$')
      NOT VALID;
  END IF;
END $$;
