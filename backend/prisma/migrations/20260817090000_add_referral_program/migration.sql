-- Doc 09 — Invite & Earn (referral program)
--
-- A player shares an invite link; the friend who signs up through it is bound
-- permanently; the first time that friend WINS a match, the referrer is credited
-- 5% of the friend's net profit on it, funded by the house.

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'earned');

-- AlterEnum
--
-- Safe inside Prisma's migration transaction on PostgreSQL 12+: ADD VALUE may be
-- run in a transaction as long as the new value is not USED in that same
-- transaction. This migration only declares it; the first row of this type is
-- written at runtime, long after the commit.
ALTER TYPE "LedgerType" ADD VALUE 'referral';

-- AlterTable
--
-- Nullable-unique, exactly like "ledger_entries"."txSignature": Postgres treats
-- NULLs as distinct in a unique index, so accounts created before this migration
-- need no backfill. Codes are minted on signup, and lazily on first read for
-- everyone who predates the column.
ALTER TABLE "users" ADD COLUMN     "referralCode" VARCHAR(12);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "referrerId" UUID NOT NULL,
    "referredUserId" UUID NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'pending',
    "commissionBps" INTEGER NOT NULL DEFAULT 500,
    "earnedAmount" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "matchId" UUID,
    "gameType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earnedAt" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- The constraint that makes a referrer permanent: one row per referred player,
-- so a player can be claimed once, by one person, and no later code entry can
-- overwrite the attribution.
CREATE UNIQUE INDEX "referrals_referredUserId_key" ON "referrals"("referredUserId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_createdAt_idx" ON "referrals"("referrerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity constraints (added by hand to the generated migration, following
-- the convention set by 20260815072115_init).
--
-- Self-referral is blocked HERE, not only in application code, for the same
-- reason "availableBalance" >= 0 lives in the database: a bug in a route handler
-- must not be able to mint a payout out of nothing.
-- ---------------------------------------------------------------------------

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_earned_non_negative" CHECK ("earnedAmount" >= 0),
  ADD CONSTRAINT "referrals_commission_bps_sane" CHECK ("commissionBps" >= 0 AND "commissionBps" <= 10000),
  ADD CONSTRAINT "referrals_no_self_referral"    CHECK ("referrerId" <> "referredUserId");
