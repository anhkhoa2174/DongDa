ALTER TABLE "fx_transaction_details"
  ADD COLUMN "fractional_amount" NUMERIC(20, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "fractional_rate" NUMERIC(20, 6),
  ADD COLUMN "deduction_vnd" NUMERIC(20, 0) NOT NULL DEFAULT 0;

UPDATE "fx_transaction_details"
SET "fractional_rate" = "rate"
WHERE "is_buy" = TRUE;

ALTER TABLE "fx_transaction_details"
  ADD CONSTRAINT "chk_fx_fractional_amount"
    CHECK (fractional_amount >= 0 AND fractional_amount < 1 AND fractional_amount <= fx_amount),
  ADD CONSTRAINT "chk_fx_deduction_vnd"
    CHECK (deduction_vnd >= 0),
  ADD CONSTRAINT "chk_fx_buy_adjustments"
    CHECK (
      (is_buy AND fractional_rate IS NOT NULL)
      OR
      (NOT is_buy AND fractional_amount = 0 AND fractional_rate IS NULL AND deduction_vnd = 0)
    );
