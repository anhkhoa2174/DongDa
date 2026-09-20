-- A partial Final posts matched debts immediately. Remaining discrepancies are
-- corrected by branches and submitted in new branch runs for another Final on
-- the same date and currency, so uniqueness belongs to the consumed source run.
DROP INDEX IF EXISTS uq_reconciliation_posted_scope;

CREATE INDEX idx_reconciliation_posted_scope
  ON reconciliation_runs(provider, scope, branch_id, business_date, currency_code)
  WHERE posted_at IS NOT NULL;

DROP INDEX IF EXISTS idx_reconciliation_final_sources_branch;

CREATE UNIQUE INDEX uq_reconciliation_final_source_branch
  ON reconciliation_final_sources(branch_run_id);
