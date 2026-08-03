ALTER TABLE mg_transaction_details
    ADD COLUMN IF NOT EXISTS received_usd NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (received_usd >= 0),
    ADD COLUMN IF NOT EXISTS received_vnd NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (received_vnd >= 0);

