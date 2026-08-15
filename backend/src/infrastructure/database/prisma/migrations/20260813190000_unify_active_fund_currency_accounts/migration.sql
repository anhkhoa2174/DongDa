-- Một đơn vị tiền chỉ có đúng một sổ quỹ vật lý ACTIVE tại mỗi chi nhánh.
-- Sổ INACTIVE vẫn được giữ nguyên để bảo toàn toàn bộ lịch sử ledger/audit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fund_accounts
    WHERE status = 'ACTIVE' AND account_type IN ('CASH', 'FUND_A')
    GROUP BY branch_id, currency_code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce canonical fund accounts: duplicate ACTIVE branch/currency accounts exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fund_accounts
    WHERE status = 'ACTIVE'
      AND (
        (account_type = 'CASH' AND currency_code NOT IN ('VND', 'USD'))
        OR (account_type = 'FUND_A' AND currency_code IN ('VND', 'USD'))
      )
  ) THEN
    RAISE EXCEPTION 'Cannot enforce canonical fund accounts: ACTIVE accounts use a non-canonical type';
  END IF;
END $$;

DROP INDEX IF EXISTS uq_fund_accounts_active_type_currency;

CREATE UNIQUE INDEX uq_fund_accounts_active_branch_currency
ON fund_accounts(branch_id, currency_code)
WHERE status = 'ACTIVE' AND account_type IN ('CASH', 'FUND_A');

ALTER TABLE fund_accounts
ADD CONSTRAINT chk_fund_accounts_canonical_currency_type
CHECK (
  account_type NOT IN ('CASH', 'FUND_A')
  OR (account_type = 'CASH' AND currency_code IN ('VND', 'USD'))
  OR (account_type = 'FUND_A' AND currency_code NOT IN ('VND', 'USD'))
);
