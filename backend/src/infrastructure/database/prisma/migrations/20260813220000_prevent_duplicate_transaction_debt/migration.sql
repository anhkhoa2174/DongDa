-- Một giao dịch nguồn chỉ được tạo đúng một khoản công nợ dự kiến.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM debt_movements
    WHERE movement_type = 'EXPECTED_DEBT'
      AND status = 'POSTED'
      AND source_id IS NOT NULL
    GROUP BY source_type, source_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce debt idempotency: duplicate expected debt sources exist';
  END IF;
END $$;

CREATE UNIQUE INDEX uq_debt_expected_source
ON debt_movements(source_type, source_id)
WHERE movement_type = 'EXPECTED_DEBT'
  AND status = 'POSTED'
  AND source_id IS NOT NULL;

