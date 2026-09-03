-- WU two-level reconciliation: branch sheet -> final company sheet.
CREATE TYPE reconciliation_stage AS ENUM ('BRANCH', 'FINAL');

ALTER TABLE reconciliation_runs
  ADD COLUMN stage reconciliation_stage NOT NULL DEFAULT 'BRANCH',
  ADD COLUMN submitted_at TIMESTAMPTZ(6);

-- Existing financially posted runs already represent final results.
UPDATE reconciliation_runs SET stage = 'FINAL' WHERE posted_at IS NOT NULL;

CREATE TABLE reconciliation_final_sources (
  final_run_id UUID NOT NULL,
  branch_run_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT reconciliation_final_sources_pkey PRIMARY KEY (final_run_id, branch_run_id),
  CONSTRAINT reconciliation_final_sources_distinct CHECK (final_run_id <> branch_run_id),
  CONSTRAINT reconciliation_final_sources_final_fkey
    FOREIGN KEY (final_run_id) REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  CONSTRAINT reconciliation_final_sources_branch_fkey
    FOREIGN KEY (branch_run_id) REFERENCES reconciliation_runs(id) ON DELETE RESTRICT
);

CREATE INDEX idx_reconciliation_final_sources_branch
  ON reconciliation_final_sources(branch_run_id);

CREATE INDEX idx_reconciliation_runs_wu_review_queue
  ON reconciliation_runs(provider, stage, submitted_at, business_date);
