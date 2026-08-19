-- Doc 11 — User Profiles
--
-- Adds the identity a public profile page needs (`username`, `avatarUrl`), the
-- one counter nothing recorded before (`gamesWon`), and the one column that makes
-- per-match statistics possible at all (`stakeTotal`).

-- AlterTable
--
-- `stakeTotal` is the stake as it was at lock time, and it is never reduced.
-- `settleMatch` sets "lockedAmount" to 0, so after a match that column can no
-- longer answer "what did this player stake" — and without that number there is
-- no win, no loss and no net for any row of match history.
ALTER TABLE "match_participants" ADD COLUMN     "stakeTotal" DECIMAL(20,9) NOT NULL DEFAULT 0;

-- AlterTable
--
-- "username" is nullable-unique, exactly like "users"."referralCode" and
-- "ledger_entries"."txSignature": Postgres treats NULLs as distinct in a unique
-- index, so no existing account needs a backfilled handle.
ALTER TABLE "users" ADD COLUMN     "avatarUrl" VARCHAR(255),
ADD COLUMN     "gamesWon" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "username" VARCHAR(20);

-- CreateIndex
--
-- Match history and streaks both read a player's settled matches newest-first.
-- Without this the profile page is a full scan of "matches" per request.
CREATE INDEX "matches_status_settledAt_idx" ON "matches"("status", "settledAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- ---------------------------------------------------------------------------
-- Backfill "stakeTotal" for rows that predate the column.
--
-- The `lock` ledger entries are the authoritative record of what was staked, and
-- they are still exact for a match that has already settled — which the
-- participant row itself is not, since "lockedAmount" was zeroed at settlement.
-- The COALESCE fallback covers a still-open match that somehow has no ledger row.
--
-- `amount` is signed from the player's perspective, so a lock is negative; the
-- unary minus turns it back into a stake.
-- ---------------------------------------------------------------------------

UPDATE "match_participants" mp
   SET "stakeTotal" = COALESCE(
         (SELECT SUM(-le."amount")
            FROM "ledger_entries" le
           WHERE le."userId"  = mp."userId"
             AND le."matchId" = mp."matchId"
             AND le."type"    = 'lock'),
         mp."lockedAmount" + mp."forfeitedAmount"
       );

-- ---------------------------------------------------------------------------
-- Integrity constraints (added by hand to the generated migration, following the
-- convention set by 20260815072115_init).
--
-- Same principle as the balance CHECKs: the database refuses to hold a state the
-- application could not correctly render, even if a route handler has a bug.
-- ---------------------------------------------------------------------------

ALTER TABLE "match_participants"
  ADD CONSTRAINT "participant_stake_total_non_negative" CHECK ("stakeTotal" >= 0);

ALTER TABLE "users"
  ADD CONSTRAINT "users_games_won_non_negative"  CHECK ("gamesWon" >= 0),
  -- A win is a game played. This is what catches double-counting at the source:
  -- a settlement path that credits a win twice, or a game twice, aborts here
  -- instead of quietly producing a 200% win rate on the profile page.
  ADD CONSTRAINT "users_games_won_within_played" CHECK ("gamesWon" <= "gamesPlayed"),
  -- A username is a URL segment. Enforced in the database, not only in zod, for
  -- the same reason balances are: no code path may store "../../etc" or an empty
  -- string as somebody's public handle.
  ADD CONSTRAINT "users_username_shape"
    CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9_]{3,20}$');
