ALTER TABLE "wu_transaction_details"
ADD COLUMN "deduction_vnd" DECIMAL(20,2) NOT NULL DEFAULT 0;

ALTER TABLE "mg_transaction_details"
ADD COLUMN "deduction_vnd" DECIMAL(20,2) NOT NULL DEFAULT 0;

ALTER TABLE "wu_transaction_details"
ADD CONSTRAINT "chk_wu_deduction_vnd_non_negative"
CHECK ("deduction_vnd" >= 0);

ALTER TABLE "mg_transaction_details"
ADD CONSTRAINT "chk_mg_deduction_vnd_non_negative"
CHECK ("deduction_vnd" >= 0);
