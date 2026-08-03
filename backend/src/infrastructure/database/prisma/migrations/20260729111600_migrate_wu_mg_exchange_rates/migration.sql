UPDATE exchange_rates
SET provider = 'WU_MG'
WHERE provider IN ('WU', 'MG');

WITH ranked_active_rates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY rate_type, provider, from_currency, to_currency
      ORDER BY effective_from DESC, created_at DESC, id DESC
    ) AS row_number
  FROM exchange_rates
  WHERE provider = 'WU_MG'
    AND status = 'ACTIVE'
)
UPDATE exchange_rates
SET status = 'SUPERSEDED',
    effective_to = NOW()
WHERE id IN (
  SELECT id
  FROM ranked_active_rates
  WHERE row_number > 1
);
