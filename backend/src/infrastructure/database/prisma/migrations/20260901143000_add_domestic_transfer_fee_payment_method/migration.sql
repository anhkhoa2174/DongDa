ALTER TABLE domestic_transfer_details
  ADD COLUMN fee_payment_method VARCHAR(20);

-- Preserve the posting behavior of historical transactions.
UPDATE domestic_transfer_details
SET fee_payment_method = CASE
  WHEN transfer_type = 'BANK_TO_CASH' THEN 'BANK'
  ELSE 'CASH'
END;

ALTER TABLE domestic_transfer_details
  ALTER COLUMN fee_payment_method SET NOT NULL,
  ALTER COLUMN fee_payment_method SET DEFAULT 'CASH',
  ADD CONSTRAINT ck_domestic_transfer_fee_payment_method
    CHECK (fee_payment_method IN ('CASH', 'BANK'));
