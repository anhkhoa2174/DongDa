CREATE TABLE "financial_idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" VARCHAR(100) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_idempotency_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_financial_idempotency_scope_key" UNIQUE ("scope", "idempotency_key")
);

CREATE INDEX "idx_financial_idempotency_created_at"
    ON "financial_idempotency_keys"("created_at");
