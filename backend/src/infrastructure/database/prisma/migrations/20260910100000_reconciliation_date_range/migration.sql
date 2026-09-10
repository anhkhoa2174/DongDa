-- Store the exact transaction period selected for branch and final reconciliation.
ALTER TABLE reconciliation_runs
  ADD COLUMN period_from DATE,
  ADD COLUMN period_to DATE;

UPDATE reconciliation_runs
SET period_from = business_date,
    period_to = business_date;

ALTER TABLE reconciliation_runs
  ALTER COLUMN period_from SET NOT NULL,
  ALTER COLUMN period_to SET NOT NULL,
  ADD CONSTRAINT chk_reconciliation_period CHECK (period_from <= period_to);

CREATE INDEX idx_reconciliation_runs_period
  ON reconciliation_runs(provider, period_from, period_to, currency_code, stage);
