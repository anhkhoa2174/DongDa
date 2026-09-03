ALTER TABLE exchange_rates
ADD COLUMN margin NUMERIC(20, 6) NOT NULL DEFAULT 0;

ALTER TABLE exchange_rates
ADD CONSTRAINT ck_exchange_rates_margin_non_negative
CHECK (margin >= 0);
