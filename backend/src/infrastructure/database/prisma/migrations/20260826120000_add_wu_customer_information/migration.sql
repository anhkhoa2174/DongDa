ALTER TABLE "wu_transaction_details"
  ADD COLUMN "sending_country" VARCHAR(100),
  ADD COLUMN "sender_state" VARCHAR(100),
  ADD COLUMN "receiver_date_of_birth" DATE,
  ADD COLUMN "current_address" TEXT,
  ADD COLUMN "identity_address" TEXT,
  ADD COLUMN "identity_document_type" VARCHAR(50),
  ADD COLUMN "identity_document_number" VARCHAR(100),
  ADD COLUMN "identity_issuing_country" VARCHAR(100),
  ADD COLUMN "identity_issue_date" DATE,
  ADD COLUMN "identity_expiry_date" DATE,
  ADD COLUMN "has_visa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "visa_type" VARCHAR(100),
  ADD COLUMN "visa_number" VARCHAR(100),
  ADD COLUMN "visa_issue_date" DATE,
  ADD COLUMN "visa_expiry_date" DATE,
  ADD COLUMN "employment_status" VARCHAR(100),
  ADD COLUMN "country_of_birth" VARCHAR(100),
  ADD COLUMN "sender_relationship" VARCHAR(100),
  ADD COLUMN "receive_purpose" VARCHAR(150),
  ADD COLUMN "sender_name" VARCHAR(150),
  ADD COLUMN "received_date" DATE;

-- Existing transactions predate this richer form. Keep them readable, while all
-- new transactions are validated by the API before insertion.
