-- MG now supports selecting an applied rate within the approved PAID/FX range.
-- The legacy baseline required applied_rate to equal system_rate and conflicts
-- with the current slider workflow. Rate bounds remain validated by the use case.
ALTER TABLE mg_transaction_details
    DROP CONSTRAINT IF EXISTS chk_mg_rate_same;
