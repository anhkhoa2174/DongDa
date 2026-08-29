-- Preserve approved/rejected rate history, but allow at most one pending draft
-- for each business identity. Keep the newest draft if legacy data contains duplicates.
WITH ranked_drafts AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY rate_type, provider, from_currency, to_currency
      ORDER BY created_at DESC, id DESC
    ) AS duplicate_order
  FROM exchange_rates
  WHERE status = 'DRAFT'
)
UPDATE exchange_rates
SET status = 'REJECTED', updated_at = now()
WHERE id IN (
  SELECT id
  FROM ranked_drafts
  WHERE duplicate_order > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_rates_draft_identity
ON exchange_rates(rate_type, provider, from_currency, to_currency)
NULLS NOT DISTINCT
WHERE status = 'DRAFT';

-- Reassert the physical-fund identity constraint for databases upgraded from
-- an older baseline. Historical INACTIVE accounts remain available for audit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fund_accounts_active_branch_currency
ON fund_accounts(branch_id, currency_code)
WHERE status = 'ACTIVE' AND account_type IN ('CASH', 'FUND_A');
