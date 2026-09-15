-- A Final reconciliation with no system transaction and no Journal row means
-- that the selected branches had no activity for the period. Older code left
-- these valid runs in PENDING_REVIEW because it required total_count > 0.
UPDATE reconciliation_runs AS final_run
SET
  status = 'MATCHED',
  posted_at = COALESCE(final_run.posted_at, final_run.created_at),
  approved_by_user_id = COALESCE(
    final_run.approved_by_user_id,
    final_run.reviewed_by_user_id,
    final_run.created_by_user_id
  ),
  updated_at = NOW()
WHERE final_run.stage = 'FINAL'
  AND final_run.status = 'PENDING_REVIEW'
  AND final_run.system_total_amount = 0
  AND final_run.journal_total_amount = 0
  AND final_run.variance_amount = 0
  AND EXISTS (
    SELECT 1
    FROM reconciliation_final_sources AS source
    WHERE source.final_run_id = final_run.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM reconciliation_items AS item
    WHERE item.reconciliation_run_id = final_run.id
  );
