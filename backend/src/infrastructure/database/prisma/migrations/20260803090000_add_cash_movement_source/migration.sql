ALTER TABLE cash_movements
ADD COLUMN source_name VARCHAR(255);

UPDATE cash_movements
SET source_name = COALESCE(NULLIF(BTRIM(description), ''), 'Không xác định')
WHERE source_name IS NULL;

ALTER TABLE cash_movements
ALTER COLUMN source_name SET NOT NULL;
