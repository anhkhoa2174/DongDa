-- Enforce "only 1 active STAFF session per branch" at the DB level.
-- The application-level count-then-create check in LoginUseCase is a fast
-- pre-check for the common case, but two concurrent logins to the same
-- branch could both pass that check before either insert completes. This
-- partial unique index is the real backstop against that race: Postgres
-- rejects a second INSERT of an ACTIVE/STAFF row for the same branch_id.
--
-- Deliberately NOT a plain @@unique([branch_id, role]) in Prisma: that would
-- also block ADMIN/MANAGER/AUDITOR (no branch lock for them) and would block
-- multiple REVOKED/EXPIRED historical rows for the same branch+role, which
-- must remain allowed. Prisma's @@unique cannot express a WHERE clause, so
-- this is applied as raw SQL.
CREATE UNIQUE INDEX "auth_sessions_one_active_staff_per_branch"
ON "auth_sessions" ("branch_id", "role")
WHERE "status" = 'ACTIVE' AND "role" = 'STAFF';
