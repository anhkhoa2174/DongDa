CREATE TABLE cash_count_denominations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_count_line_id UUID NOT NULL REFERENCES cash_count_lines(id) ON DELETE CASCADE,
  denomination NUMERIC(20, 2) NOT NULL CHECK (denomination > 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  amount NUMERIC(20, 2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cash_count_line_denomination UNIQUE (cash_count_line_id, denomination),
  CONSTRAINT chk_cash_count_denomination_amount
    CHECK (ABS(amount - denomination * quantity) <= 0.01)
);

CREATE INDEX idx_cash_count_denominations_line
  ON cash_count_denominations(cash_count_line_id);
