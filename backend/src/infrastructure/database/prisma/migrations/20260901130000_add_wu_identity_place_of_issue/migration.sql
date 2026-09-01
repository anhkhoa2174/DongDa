ALTER TABLE wu_transaction_details
  ADD COLUMN identity_place_of_issue VARCHAR(150);

UPDATE wu_transaction_details
SET identity_place_of_issue = identity_issuing_country
WHERE identity_place_of_issue IS NULL;
