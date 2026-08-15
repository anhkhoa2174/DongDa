ALTER TABLE wu_transaction_details
ADD COLUMN paid_currency currency_code NOT NULL DEFAULT 'USD';

ALTER TABLE mg_transaction_details
ADD COLUMN paid_currency currency_code NOT NULL DEFAULT 'USD';

-- Một Journal đã ghi sổ duy nhất cho mỗi ngày và phạm vi nghiệp vụ.
CREATE UNIQUE INDEX uq_reconciliation_posted_scope
ON reconciliation_runs(provider, scope, branch_id, business_date) NULLS NOT DISTINCT
WHERE posted_at IS NOT NULL;

-- Chỉ một tỷ giá đang ACTIVE cho cùng một định danh nghiệp vụ.
CREATE UNIQUE INDEX uq_exchange_rates_active_identity
ON exchange_rates(
  rate_type,
  provider,
  from_currency,
  to_currency
) NULLS NOT DISTINCT
WHERE status = 'ACTIVE';
