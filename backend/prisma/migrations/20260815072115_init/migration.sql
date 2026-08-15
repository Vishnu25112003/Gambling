-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('deposit', 'withdrawal', 'lock', 'settlement', 'refund', 'forfeit', 'fee');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('pending', 'confirmed', 'failed');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('open', 'settled', 'refunded');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('pooled', 'solo_vs_house');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('active', 'disconnected', 'forfeited', 'settled', 'refunded');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "availableBalance" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "lockedBalance" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "displayName" VARCHAR(32),
    "totalWagered" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "netProfit" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "id" UUID NOT NULL,
    "nonce" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "txSignature" TEXT,
    "userId" UUID,
    "type" "LedgerType" NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(20,9) NOT NULL,
    "balanceAfterAvailable" DECIMAL(20,9),
    "balanceAfterLocked" DECIMAL(20,9),
    "senderAddress" TEXT,
    "destinationAddress" TEXT,
    "matchId" UUID,
    "gameType" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "gameType" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'open',
    "pot" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "feeCollected" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "gameState" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_participants" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lockedAmount" DECIMAL(20,9) NOT NULL,
    "forfeitedAmount" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "payout" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE INDEX "users_netProfit_idx" ON "users"("netProfit" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "auth_nonces_nonce_key" ON "auth_nonces"("nonce");

-- CreateIndex
CREATE INDEX "auth_nonces_expiresAt_idx" ON "auth_nonces"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_txSignature_key" ON "ledger_entries"("txSignature");

-- CreateIndex
CREATE INDEX "ledger_entries_userId_timestamp_idx" ON "ledger_entries"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ledger_entries_type_idx" ON "ledger_entries"("type");

-- CreateIndex
CREATE INDEX "ledger_entries_status_idx" ON "ledger_entries"("status");

-- CreateIndex
CREATE INDEX "matches_gameType_status_idx" ON "matches"("gameType", "status");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "match_participants_userId_idx" ON "match_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_matchId_userId_key" ON "match_participants"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Money integrity constraints (added by hand to the generated migration).
--
-- These are the reason PostgreSQL is a better fit than MongoDB for this
-- system: the database itself now refuses to hold an impossible balance. Even
-- if application logic has a bug, a transaction that would drive a balance
-- negative aborts instead of silently corrupting the ledger.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_available_balance_non_negative" CHECK ("availableBalance" >= 0),
  ADD CONSTRAINT "users_locked_balance_non_negative"    CHECK ("lockedBalance" >= 0),
  ADD CONSTRAINT "users_total_wagered_non_negative"     CHECK ("totalWagered" >= 0),
  ADD CONSTRAINT "users_games_played_non_negative"      CHECK ("gamesPlayed" >= 0);

ALTER TABLE "match_participants"
  ADD CONSTRAINT "participant_locked_non_negative"    CHECK ("lockedAmount" >= 0),
  ADD CONSTRAINT "participant_forfeited_non_negative" CHECK ("forfeitedAmount" >= 0),
  ADD CONSTRAINT "participant_payout_non_negative"    CHECK ("payout" >= 0);

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_pot_non_negative"  CHECK ("pot" >= 0),
  ADD CONSTRAINT "matches_fee_non_negative"  CHECK ("feeCollected" >= 0),
  -- The house can never take more than the whole pot.
  ADD CONSTRAINT "matches_fee_within_pot"    CHECK ("feeCollected" <= "pot");
