ALTER TABLE domestic_transfer_details
  ADD COLUMN transfer_type varchar(30) NOT NULL DEFAULT 'CASH_TO_BANK',
  ADD COLUMN bank_account_id uuid,
  ADD COLUMN fee numeric(20, 2) NOT NULL DEFAULT 0,
  ADD COLUMN counterparty_bank varchar(150),
  ADD COLUMN counterparty_account varchar(100);

ALTER TABLE domestic_transfer_details
  ADD CONSTRAINT domestic_transfer_details_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE INDEX idx_domestic_transfer_bank_account
  ON domestic_transfer_details(bank_account_id);

ALTER TABLE domestic_transfer_details
  ADD CONSTRAINT ck_domestic_transfer_type
  CHECK (transfer_type IN ('CASH_TO_BANK', 'BANK_TO_CASH')),
  ADD CONSTRAINT ck_domestic_transfer_fee_nonnegative
  CHECK (fee >= 0);
