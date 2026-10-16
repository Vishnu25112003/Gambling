-- Rewards — rakeback.
--
-- A player earns back a tier-based share of the platform fee their own stake
-- generated on each settled match. The share accrues into
-- "users"."rakebackUnclaimed" and is moved into "availableBalance" by an explicit
-- claim, which writes one 'rakeback' ledger row.

-- AlterEnum
--
-- Safe inside Prisma's migration transaction on PostgreSQL 12+: the new value is
-- only declared here, first used at runtime.
ALTER TYPE "LedgerType" ADD VALUE 'rakeback';

-- AlterTable
--
-- NOT NULL DEFAULT 0 backfills every existing account to "nothing accrued yet" —
-- no existing balance, ledger row or stat is touched. Rakeback starts accruing
-- from the first match settled after this migration.
ALTER TABLE "users" ADD COLUMN "rakebackUnclaimed" DECIMAL(20,9) NOT NULL DEFAULT 0;

-- Integrity: an accrual counter can never go negative, same convention as the
-- balance CHECKs in the init migration.
ALTER TABLE "users"
  ADD CONSTRAINT "users_rakeback_unclaimed_non_negative" CHECK ("rakebackUnclaimed" >= 0);
