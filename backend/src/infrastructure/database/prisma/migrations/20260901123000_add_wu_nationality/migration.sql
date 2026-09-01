ALTER TABLE wu_transaction_details
  ADD COLUMN nationality VARCHAR(100);

UPDATE wu_transaction_details
SET nationality = country_of_birth
WHERE nationality IS NULL;
