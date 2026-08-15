ALTER TABLE reconciliation_runs
ADD COLUMN currency_code currency_code NOT NULL DEFAULT 'USD';

ALTER TABLE reconciliation_items
ADD COLUMN currency_code currency_code NOT NULL DEFAULT 'USD';

DROP INDEX uq_reconciliation_posted_scope;

CREATE UNIQUE INDEX uq_reconciliation_posted_scope
ON reconciliation_runs(provider, scope, branch_id, business_date, currency_code) NULLS NOT DISTINCT
WHERE posted_at IS NOT NULL;
