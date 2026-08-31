-- One debt per customer transaction with an explicit reconciliation/settlement lifecycle.
CREATE TYPE debt_lifecycle_status AS ENUM ('PENDING', 'RECONCILED', 'SETTLED', 'CANCELLED');

ALTER TABLE debt_accounts
  DROP CONSTRAINT IF EXISTS uq_debt_account_day,
  ADD COLUMN transaction_id UUID,
  ADD COLUMN reconciliation_run_id UUID,
  ADD COLUMN lifecycle_status debt_lifecycle_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN reconciled_at TIMESTAMPTZ(6),
  ADD COLUMN settled_at TIMESTAMPTZ(6),
  ADD COLUMN cancelled_at TIMESTAMPTZ(6);

ALTER TABLE wu_transaction_details
  ADD COLUMN bank_account_id UUID;

CREATE INDEX idx_wu_transaction_details_bank_account
  ON wu_transaction_details(bank_account_id);

ALTER TABLE wu_transaction_details
  ADD CONSTRAINT wu_transaction_details_bank_account_id_fkey
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT;

-- Existing expected movements become independent debts. Keep legacy accounts for
-- aggregate ACTUAL/SETTLEMENT history that cannot safely be attributed to one TX.
CREATE TEMP TABLE debt_tx_source AS
SELECT
  m.id AS movement_id,
  m.source_id AS transaction_id,
  m.debt_account_id AS old_account_id,
  m.branch_id,
  a.provider_code,
  m.currency_code,
  m.business_date,
  m.amount,
  m.created_at,
  m.updated_at
FROM debt_movements m
JOIN debt_accounts a ON a.id = m.debt_account_id
JOIN customer_transactions t ON t.id = m.source_id
WHERE m.movement_type = 'EXPECTED_DEBT'
  AND m.source_type = 'CUSTOMER_TRANSACTION'
  AND m.status = 'POSTED';

INSERT INTO debt_accounts (
  id, transaction_id, branch_id, provider_code, currency_code, business_date,
  name, lifecycle_status, status, created_at, updated_at
)
SELECT
  gen_random_uuid(), s.transaction_id, s.branch_id, s.provider_code, s.currency_code,
  s.business_date,
  'Công nợ ' || s.provider_code || ' - ' || t.transaction_no,
  CASE WHEN t.status = 'VOIDED' THEN 'CANCELLED'::debt_lifecycle_status
       ELSE 'PENDING'::debt_lifecycle_status END,
  'ACTIVE', s.created_at, s.updated_at
FROM debt_tx_source s
JOIN customer_transactions t ON t.id = s.transaction_id
ON CONFLICT DO NOTHING;

UPDATE debt_movements m
SET debt_account_id = a.id
FROM debt_tx_source s
JOIN debt_accounts a ON a.transaction_id = s.transaction_id
WHERE m.id = s.movement_id;

-- Preserve already completed allocation history if legacy data contains it.
UPDATE debt_accounts a
SET lifecycle_status = 'SETTLED', settled_at = NOW()
WHERE a.transaction_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM debt_movements expected
    JOIN debt_settlement_allocations alloc ON alloc.debt_movement_id = expected.id
    WHERE expected.debt_account_id = a.id
    GROUP BY expected.id, expected.amount
    HAVING SUM(alloc.amount) >= expected.amount
  );

CREATE UNIQUE INDEX uq_debt_account_transaction ON debt_accounts(transaction_id);
CREATE INDEX idx_debt_accounts_group
  ON debt_accounts(branch_id, provider_code, currency_code, business_date);
CREATE INDEX idx_debt_accounts_lifecycle
  ON debt_accounts(lifecycle_status, business_date);

ALTER TABLE debt_accounts
  ADD CONSTRAINT debt_accounts_transaction_id_fkey
    FOREIGN KEY (transaction_id) REFERENCES customer_transactions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT debt_accounts_reconciliation_run_id_fkey
    FOREIGN KEY (reconciliation_run_id) REFERENCES reconciliation_runs(id) ON DELETE RESTRICT;
