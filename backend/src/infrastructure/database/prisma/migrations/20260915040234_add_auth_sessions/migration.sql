-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "branch_id" UUID,
    "role" VARCHAR(20) NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'ACTIVE',
    "refresh_token_hash" TEXT NOT NULL,
    "device_ip" TEXT,
    "user_agent" TEXT,
    "last_heartbeat_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_branch_id_role_status_idx" ON "auth_sessions"("branch_id", "role", "status");

-- RenameForeignKey
ALTER TABLE "customer_transactions" RENAME CONSTRAINT "fk_customer_transaction_replacement" TO "customer_transactions_replacement_of_transaction_id_fkey";

-- RenameForeignKey
ALTER TABLE "reconciliation_final_sources" RENAME CONSTRAINT "reconciliation_final_sources_branch_fkey" TO "reconciliation_final_sources_branch_run_id_fkey";

-- RenameForeignKey
ALTER TABLE "reconciliation_final_sources" RENAME CONSTRAINT "reconciliation_final_sources_final_fkey" TO "reconciliation_final_sources_final_run_id_fkey";

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
