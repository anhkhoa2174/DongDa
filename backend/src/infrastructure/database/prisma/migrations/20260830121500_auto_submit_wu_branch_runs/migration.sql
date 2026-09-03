-- WU branch reconciliation is submitted immediately after a successful run.
-- Backfill drafts created before this workflow became automatic.
UPDATE reconciliation_runs r
SET submitted_at = COALESCE(r.submitted_at, r.created_at),
    updated_at = NOW()
WHERE r.provider = 'WU'
  AND r.stage = 'BRANCH'
  AND r.submitted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM reconciliation_final_sources s
    WHERE s.branch_run_id = r.id
  );
