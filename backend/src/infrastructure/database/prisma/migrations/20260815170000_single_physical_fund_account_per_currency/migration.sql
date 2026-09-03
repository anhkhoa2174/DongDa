-- One physical fund account per branch and currency for its entire lifetime.
-- All historical movements are moved to the canonical account before duplicates are removed.
CREATE TEMP TABLE fund_account_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY branch_id, currency_code
      ORDER BY
        CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
        CASE
          WHEN code = CASE
            WHEN currency_code IN ('VND', 'USD') THEN 'CASH_' || currency_code::text
            ELSE 'FUND_A_' || currency_code::text
          END THEN 0
          ELSE 1
        END,
        created_at,
        id
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY branch_id, currency_code
      ORDER BY
        CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
        CASE
          WHEN code = CASE
            WHEN currency_code IN ('VND', 'USD') THEN 'CASH_' || currency_code::text
            ELSE 'FUND_A_' || currency_code::text
          END THEN 0
          ELSE 1
        END,
        created_at,
        id
    ) AS account_order
  FROM fund_accounts
  WHERE account_type IN ('CASH', 'FUND_A')
)
SELECT id AS duplicate_id, keep_id
FROM ranked
WHERE account_order > 1;

-- These two child tables have unique keys containing fund_account_id. Rebuild
-- affected rows as aggregates so merging cannot violate those constraints.
CREATE TEMP TABLE merged_cash_count_lines ON COMMIT DROP AS
SELECT
  line.cash_count_id,
  COALESCE(mapping.keep_id, line.fund_account_id) AS fund_account_id,
  line.currency_code,
  sum(line.system_amount) AS system_amount,
  sum(line.actual_amount) AS actual_amount,
  sum(line.variance) AS variance,
  min(line.created_at) AS created_at
FROM cash_count_lines line
LEFT JOIN fund_account_merge_map mapping ON mapping.duplicate_id = line.fund_account_id
WHERE line.fund_account_id IN (
  SELECT duplicate_id FROM fund_account_merge_map
  UNION
  SELECT keep_id FROM fund_account_merge_map
)
GROUP BY line.cash_count_id, COALESCE(mapping.keep_id, line.fund_account_id), line.currency_code;

DELETE FROM cash_count_lines
WHERE fund_account_id IN (
  SELECT duplicate_id FROM fund_account_merge_map
  UNION
  SELECT keep_id FROM fund_account_merge_map
);

INSERT INTO cash_count_lines (
  cash_count_id, fund_account_id, currency_code,
  system_amount, actual_amount, variance, created_at
)
SELECT
  cash_count_id, fund_account_id, currency_code,
  system_amount, actual_amount, variance, created_at
FROM merged_cash_count_lines;

CREATE TEMP TABLE merged_fund_snapshots ON COMMIT DROP AS
SELECT
  snapshot.business_date,
  COALESCE(mapping.keep_id, snapshot.fund_account_id) AS fund_account_id,
  sum(snapshot.opening_balance) AS opening_balance,
  sum(snapshot.total_debit) AS total_debit,
  sum(snapshot.total_credit) AS total_credit,
  sum(snapshot.closing_balance) AS closing_balance,
  max(snapshot.calculated_at) AS calculated_at
FROM fund_balance_snapshots snapshot
LEFT JOIN fund_account_merge_map mapping ON mapping.duplicate_id = snapshot.fund_account_id
WHERE snapshot.fund_account_id IN (
  SELECT duplicate_id FROM fund_account_merge_map
  UNION
  SELECT keep_id FROM fund_account_merge_map
)
GROUP BY snapshot.business_date, COALESCE(mapping.keep_id, snapshot.fund_account_id);

DELETE FROM fund_balance_snapshots
WHERE fund_account_id IN (
  SELECT duplicate_id FROM fund_account_merge_map
  UNION
  SELECT keep_id FROM fund_account_merge_map
);

INSERT INTO fund_balance_snapshots (
  fund_account_id, business_date, opening_balance, total_debit,
  total_credit, closing_balance, calculated_at
)
SELECT
  fund_account_id, business_date, opening_balance, total_debit,
  total_credit, closing_balance, calculated_at
FROM merged_fund_snapshots;

UPDATE ledger_lines child
SET fund_account_id = mapping.keep_id
FROM fund_account_merge_map mapping
WHERE child.fund_account_id = mapping.duplicate_id;

UPDATE cash_movements child
SET fund_account_id = mapping.keep_id
FROM fund_account_merge_map mapping
WHERE child.fund_account_id = mapping.duplicate_id;

UPDATE fund_transfer_items child
SET source_account_id = mapping.keep_id
FROM fund_account_merge_map mapping
WHERE child.source_account_id = mapping.duplicate_id;

UPDATE fund_transfer_items child
SET destination_account_id = mapping.keep_id
FROM fund_account_merge_map mapping
WHERE child.destination_account_id = mapping.duplicate_id;

DELETE FROM fund_accounts account
USING fund_account_merge_map mapping
WHERE account.id = mapping.duplicate_id;

-- Normalize the surviving account identity and keep it active. Balance remains
-- the sum of all posted ledger lines now pointing to this single account.
UPDATE fund_accounts
SET
  code = CASE
    WHEN currency_code IN ('VND', 'USD') THEN 'CASH_' || currency_code::text
    ELSE 'FUND_A_' || currency_code::text
  END,
  name = CASE
    WHEN currency_code IN ('VND', 'USD') THEN 'Quỹ tiền mặt ' || currency_code::text
    ELSE 'Quỹ A ' || currency_code::text
  END,
  account_type = CASE
    WHEN currency_code IN ('VND', 'USD') THEN 'CASH'::fund_account_type
    ELSE 'FUND_A'::fund_account_type
  END,
  status = 'ACTIVE',
  updated_at = now()
WHERE account_type IN ('CASH', 'FUND_A');

DROP INDEX IF EXISTS uq_fund_accounts_active_branch_currency;

CREATE UNIQUE INDEX uq_fund_accounts_branch_currency
ON fund_accounts(branch_id, currency_code)
WHERE account_type IN ('CASH', 'FUND_A');
