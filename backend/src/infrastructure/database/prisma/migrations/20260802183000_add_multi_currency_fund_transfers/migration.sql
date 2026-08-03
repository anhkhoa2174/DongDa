-- Một phiếu tiếp quỹ có một header và nhiều dòng loại tiền.
CREATE TABLE fund_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_transfer_id UUID NOT NULL REFERENCES fund_transfers(id) ON DELETE CASCADE,
    source_account_id UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    destination_account_id UUID NOT NULL REFERENCES fund_accounts(id) ON DELETE RESTRICT,
    currency_code currency_code NOT NULL,
    amount NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_fund_transfer_items_currency UNIQUE (fund_transfer_id, currency_code)
);

CREATE INDEX idx_fund_transfer_items_transfer ON fund_transfer_items(fund_transfer_id);
CREATE INDEX idx_fund_transfer_items_source_account ON fund_transfer_items(source_account_id);
CREATE INDEX idx_fund_transfer_items_destination_account ON fund_transfer_items(destination_account_id);

-- Bảo toàn các phiếu một loại tiền đã có.
INSERT INTO fund_transfer_items (
    fund_transfer_id,
    source_account_id,
    destination_account_id,
    currency_code,
    amount
)
SELECT
    id,
    source_account_id,
    destination_account_id,
    currency_code,
    amount
FROM fund_transfers;

ALTER TABLE fund_transfers DROP CONSTRAINT IF EXISTS chk_fund_transfer_accounts;
ALTER TABLE fund_transfers DROP COLUMN source_account_id;
ALTER TABLE fund_transfers DROP COLUMN destination_account_id;
ALTER TABLE fund_transfers DROP COLUMN currency_code;
ALTER TABLE fund_transfers DROP COLUMN amount;
