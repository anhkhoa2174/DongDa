-- Mỗi khoản công nợ được quản lý theo ngày nghiệp vụ, chi nhánh, đối tác và loại tiền.
ALTER TABLE "debt_accounts"
  ADD COLUMN "business_date" DATE;

-- Khoản lịch sử giữ nguyên số dư; ngày được lấy từ lần phát sinh nợ đầu tiên.
UPDATE "debt_accounts" AS account
SET "business_date" = COALESCE(
  (
    SELECT MIN(movement."business_date")
    FROM "debt_movements" AS movement
    WHERE movement."debt_account_id" = account."id"
      AND movement."movement_type" IN ('EXPECTED_DEBT', 'ACTUAL_DEBT')
  ),
  account."created_at"::date
);

ALTER TABLE "debt_accounts"
  ALTER COLUMN "business_date" SET NOT NULL;

ALTER TABLE "debt_accounts"
  DROP CONSTRAINT "uq_debt_account";

ALTER TABLE "debt_accounts"
  ADD CONSTRAINT "uq_debt_account_day"
  UNIQUE ("branch_id", "provider_code", "currency_code", "business_date");

CREATE INDEX "idx_debt_accounts_date_status"
  ON "debt_accounts" ("business_date", "status");
