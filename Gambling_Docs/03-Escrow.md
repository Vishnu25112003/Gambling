# Escrow

## One-Line Summary
Handles bet locking, match settlement, refunds, and disconnect/forfeit rules — the shared "money during a game" layer every game plugs into.

## Overview
Once a user has a balance (from `02-Deposit-Withdraw.md`), this is what happens to that balance while they're actually playing a game. No blockchain transaction happens per bet — it's all database bookkeeping between two balance fields: `availableBalance` and `lockedBalance`. Every game, no matter what it is, calls the same four functions defined here. This file is what makes games "pluggable" — a game never writes its own money-handling code.

**Scope — mechanism, not policy.** This file describes *how* money moves. It does not define the fee rate, the payout split, or the betting modes — those live in `10-Game-Common-Rules.md` and are the single source of truth for them. When you see a percentage referenced below, doc 10 is where it is set.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** Built — all four functions ship in `backend/src/escrow/`, tested against real PostgreSQL (see `05-Progress-Log.md`, 2026-08-15)
- **Depends on:** `01-Auth-Wallet-Connect.md` (user must exist) and `02-Deposit-Withdraw.md` (user must have a balance to bet with)
- **Governed by:** `10-Game-Common-Rules.md` (fee rate, payout split, betting modes)

## How It Works (Flow)

**Placing a bet:**
1. Player joins a game and commits a bet amount
2. Backend calls `lockBalance(userId, amount, matchId)` — moves that amount from `availableBalance` → `lockedBalance`
3. This is DB-only — no on-chain transaction happens here
4. Player's max possible bet = whatever is currently in their `availableBalance` (no separate cap) — applies in both betting modes, see Rule 3 in `10-Game-Common-Rules.md`

**Match ends normally:**
1. Game logic (inside the specific game's own module) determines the winner(s)
2. Backend calls `settleMatch(matchId, winners[], weights[])`
3. **If it's a pooled/multiplayer game:** the platform fee is taken off the total pot first, and the remainder is split among the winners by weight
4. **If it's a solo-vs-house game:** no fee is charged here — the edge is already inside that game's odds table, so `settleMatch` just pays out as instructed
5. Winner's payout moves into their `availableBalance`; loser's locked amount is cleared (it funded the payout + fee)

The fee rate, and the weights that decide each finisher's share, are set by Rules 1 and 2 in `10-Game-Common-Rules.md` — this function applies them, it does not define them.

**Player disconnects mid-match:**
1. Backend calls `forfeitPlayer(matchId, userId)`
2. A **15-second reconnect grace period** starts
3. If the player reconnects within 15 seconds → they resume normally, nothing is forfeited
4. If they don't reconnect in time → their locked bet is forfeited to the remaining player(s)/pot

**Server or game crashes:**
1. Backend calls `refundMatch(matchId)`
2. Every player's locked balance for that match is returned in full to their `availableBalance`
3. No fee is taken — a crash is the platform's fault, not the player's

## Where This Lives
*(As shipped)*
```
backend/src/escrow/
  ├── lockBalance.ts
  ├── settleMatch.ts
  ├── refundMatch.ts
  ├── forfeitPlayer.ts
  ├── types.ts              → LockResult, SettleResult, SettleMatchOptions, …
  └── index.ts              → the only import surface a game should use
backend/prisma/
  └── schema.prisma         → Match + MatchParticipant models (see Reference)
```
Every individual game module (under `backend/src/games/<game-id>/`) **imports and calls** these functions — it never contains its own balance-handling code.

## Implementation Plan

*Everything below is built and tested unless marked otherwise.*

```
[x] Build Match + MatchParticipant models (Postgres via Prisma)
    - Match: id, gameType, status (open/settled/refunded), createdAt
    - MatchParticipant: matchId (FK), userId (FK), lockedAmount — one row per player in a match, instead of an embedded array (relational model, not document model)

[x] Build lockBalance(userId, amount, matchId)
    - Validate: amount > 0 AND amount <= user's current availableBalance
    - Atomically move amount: availableBalance -= amount, lockedBalance += amount
    - Record this lock as a MatchParticipant row
    - Must run inside a Postgres transaction (row lock via `SELECT ... FOR UPDATE`, or Prisma's `$transaction`) with the balance check in the same transaction, to avoid race conditions

[x] Build settleMatch(matchId, winners[], weights[])
    - Look up the Match record, confirm it's still "open"
    - Determine game type: pooled/multiplayer or solo-vs-house
    - POOLED: take the platform fee off the total locked pot, distribute the remainder to winners by weight (rate: Rule 1, weights: Rule 2, both in `10-Game-Common-Rules.md`)
    - SOLO-VS-HOUSE: charge no fee — it is already baked into that game's odds table (defined in that game's own doc); this function just executes the payout as instructed
    - Move winner payouts: lockedBalance -= their stake, availableBalance += payout
    - Clear losers' lockedBalance (already accounted for in the pot)
    - Mark Match as "settled", log a settlement ledger entry (participants, result, feeCollected, timestamp)

[x] Build refundMatch(matchId)
    - Look up all participants' locked amounts for this match
    - Return each amount in full: lockedBalance -= amount, availableBalance += amount
    - Mark Match as "refunded", log the refund event
    - No fee taken under any circumstance here

[x] Build forfeitPlayer(matchId, userId)
    - Start a 15-second timer tied to this player's disconnect event
    - If a reconnect event fires for the same userId + matchId within 15 sec → cancel the timer, player resumes
    - If the timer completes with no reconnect → forfeit this player's locked amount to the remaining participant(s)/pot — the stake stays in the pot and is never returned
    - Log the forfeit event either way (reconnected or forfeited)

[x] Add ledger logging across all four functions
    - Every lock, settlement, refund, and forfeit gets its own logged entry
    - This is what makes any balance fully traceable/auditable later if a dispute comes up

[x] Statistics writes for `11-User-Profiles.md`
    - lockBalance also writes MatchParticipant.stakeTotal, which is NEVER reduced.
      settleMatch zeroes lockedAmount, so without it the stake a player put in is
      unrecoverable after the match and no win/loss/net can be computed
    - settleMatch increments User.gamesWon when payout > total stake. A win is
      finishing IN PROFIT, not merely being named in winners[] — a pooled draw
      returns every stake and pays nobody

[x] FIXED: a forfeited player was counted twice
    - forfeitPlayer debits netProfit and increments gamesPlayed when the reconnect
      window closes; settleMatch's loop then did both AGAIN for the same
      participant, so one 1 SOL forfeit recorded 2 games played and a 2 SOL loss
    - settleMatch now skips the counters for a participant already `forfeited`.
      The money half was always a no-op there: such a row has lockedAmount = 0 and
      is never a winner

[x] FIXED: a forfeit followed by a crash-refund never unwound
    - refundMatch returned the stake and decremented totalWagered, but left the
      forfeit's netProfit debit and gamesPlayed increment in place forever — so a
      refunded match "never happened" everywhere except those two counters
    - refundMatch now restores both when forfeitedAmount > 0

[ ] Add betting-mode enforcement for Rule 3 (`10-Game-Common-Rules.md`) — NOT BUILT
    - Add `betMode` (fixed | free) and nullable `fixedBetAmount` to the Match model
    - Host sets both at match creation; both are immutable once the match is open
    - In FIXED mode, lockBalance must reject any amount that is not exactly fixedBetAmount
    - In FREE mode, the existing rule stands unchanged: any amount up to availableBalance
    - Needed before the first game with a host-created lobby ships
```

## Reference

**Escrow Function Signatures**
| Function | Parameters | Purpose |
|---|---|---|
| `lockBalance` | `(userId, amount, matchId)` | Freezes a bet: available → locked |
| `settleMatch` | `(matchId, winners[], weights[])` | Pays winners, takes fee, unlocks everything |
| `refundMatch` | `(matchId)` | Full refund to all participants — crash/cancel only |
| `forfeitPlayer` | `(matchId, userId)` | Forfeits a disconnected player's locked bet after grace period |

**Match Models (PostgreSQL via Prisma)**
```prisma
enum MatchStatus {
  open
  settled
  refunded
}

model Match {
  id           String              @id @default(uuid())
  gameType     String
  status       MatchStatus         @default(open)
  createdAt    DateTime            @default(now())
  participants MatchParticipant[]
}

model MatchParticipant {
  id            String   @id @default(uuid())
  matchId       String
  match         Match    @relation(fields: [matchId], references: [id])
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  lockedAmount  Decimal  @db.Decimal(20, 9)
  /// Written once at lock time and never reduced — `11-User-Profiles.md`.
  /// lockedAmount is set to 0 at settlement, so this is the only surviving
  /// record of what the player actually staked.
  stakeTotal    Decimal  @default(0) @db.Decimal(20, 9)
}
```

**Rules Locked**
- Balance fields: `availableBalance`, `lockedBalance` (defined on User, see `01-Auth-Wallet-Connect.md`)
- Max bet = user's own `availableBalance`, no separate cap
- Disconnect grace period: 15 seconds before forfeit
- Crash/server failure: full refund, no fee taken
- Platform fee, payout splits, and betting modes: **defined in `10-Game-Common-Rules.md`**, not here. Escrow applies them; it does not set them.
- Fee is applied at settlement only — `refundMatch` never takes one

## Open Questions
- **Rule 3 (fixed vs free bet) is not enforceable yet** — the `Match` model has no `betMode` column, so every match currently behaves as Free Bet. See the implementation plan above.
- **Forfeit timers are in-memory**, so more than one backend process would double-fire them. Needs Redis before scaling out (see `05-Progress-Log.md`, 2026-08-15).

## Related Docs
- `10-Game-Common-Rules.md` — the fee, payout, and betting-mode rules this layer enforces
- `01-Auth-Wallet-Connect.md` — where `availableBalance` / `lockedBalance` are defined
- `02-Deposit-Withdraw.md` — how a balance gets there in the first place
- `09-Referral-Program.md` — hooks into `settleMatch` to pay referral commission
- `11-User-Profiles.md` — reads every statistic on a profile out of the matches this layer settles, and writes `gamesWon` / `stakeTotal` from here

## Last Updated
2026-08-18 — Recorded the `gamesWon` / `stakeTotal` writes added for `11-User-Profiles.md`, and two forfeit double-counting bugs found and fixed during that work.
2026-08-18 — Fee/payout policy moved out to `10-Game-Common-Rules.md`; status, folder layout, and implementation plan brought in line with what actually shipped.
2026-08-14 — Initial version, written after escrow flow discussion.
