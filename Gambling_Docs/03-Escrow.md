# Escrow

## One-Line Summary
Handles bet locking, match settlement, refunds, and disconnect/forfeit rules — the shared "money during a game" layer every game plugs into.

## Overview
Once a user has a balance (from `02-Deposit-Withdraw.md`), this is what happens to that balance while they're actually playing a game. No blockchain transaction happens per bet — it's all database bookkeeping between two balance fields: `availableBalance` and `lockedBalance`. Every game, no matter what it is, calls the same four functions defined here. This file is what makes games "pluggable" — a game never writes its own money-handling code.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 0% — designed, not yet coded
- **Depends on:** `01-Auth-Wallet-Connect.md` (user must exist) and `02-Deposit-Withdraw.md` (user must have a balance to bet with)

## How It Works (Flow)

**Placing a bet:**
1. Player joins a game and commits a bet amount
2. Backend calls `lockBalance(userId, amount, matchId)` — moves that amount from `availableBalance` → `lockedBalance`
3. This is DB-only — no on-chain transaction happens here
4. Player's max possible bet = whatever is currently in their `availableBalance` (no separate cap)

**Match ends normally:**
1. Game logic (inside the specific game's own module) determines the winner(s)
2. Backend calls `settleMatch(matchId, winners[], weights[])`
3. **If it's a pooled/multiplayer game:** 5% fee is taken from the total pot first, remainder split among winners by weight
4. **If it's a solo-vs-house game:** the 5% edge is already baked into that game's payout odds — `settleMatch` just pays out according to those odds, no separate fee line
5. Winner's payout moves into their `availableBalance`; loser's locked amount is cleared (it funded the payout + fee)

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
*(Proposed folder layout — rename freely once real coding starts)*
```
/backend/escrow/
  ├── lockBalance.js
  ├── settleMatch.js
  ├── refundMatch.js
  ├── forfeitPlayer.js
/backend/prisma/
  └── schema.prisma         → Match + MatchParticipant models defined here (see Reference)
```
Every individual game module (once built, under `/backend/games/<game-name>/`) will **import and call** these functions — it will never contain its own balance-handling code.

## Implementation Plan (TODO)

```
[ ] Build Match + MatchParticipant models (Postgres via Prisma)
    - Match: id, gameType, status (open/settled/refunded), createdAt
    - MatchParticipant: matchId (FK), userId (FK), lockedAmount — one row per player in a match, instead of an embedded array (relational model, not document model)

[ ] Build lockBalance(userId, amount, matchId)
    - Validate: amount > 0 AND amount <= user's current availableBalance
    - Atomically move amount: availableBalance -= amount, lockedBalance += amount
    - Record this lock as a MatchParticipant row
    - Must run inside a Postgres transaction (row lock via `SELECT ... FOR UPDATE`, or Prisma's `$transaction`) with the balance check in the same transaction, to avoid race conditions

[ ] Build settleMatch(matchId, winners[], weights[])
    - Look up the Match record, confirm it's still "open"
    - Determine game type: pooled/multiplayer or solo-vs-house
    - POOLED: take 5% of the total locked pot as house fee, distribute remainder to winners by weight
    - SOLO-VS-HOUSE: fee is already baked into that specific game's odds table (defined in that game's own doc) — this function just executes the payout as instructed
    - Move winner payouts: lockedBalance -= their stake, availableBalance += payout
    - Clear losers' lockedBalance (already accounted for in the pot)
    - Mark Match as "settled", log a settlement ledger entry (participants, result, feeCollected, timestamp)

[ ] Build refundMatch(matchId)
    - Look up all participants' locked amounts for this match
    - Return each amount in full: lockedBalance -= amount, availableBalance += amount
    - Mark Match as "refunded", log the refund event
    - No fee taken under any circumstance here

[ ] Build forfeitPlayer(matchId, userId)
    - Start a 15-second timer tied to this player's disconnect event
    - If a reconnect event fires for the same userId + matchId within 15 sec → cancel the timer, player resumes
    - If the timer completes with no reconnect → forfeit this player's locked amount to the remaining participant(s)/pot, following the same pattern as AFK handling in Raja Rani
    - Log the forfeit event either way (reconnected or forfeited)

[ ] Add ledger logging across all four functions
    - Every lock, settlement, refund, and forfeit gets its own logged entry
    - This is what makes any balance fully traceable/auditable later if a dispute comes up
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
}
```

**Rules Locked**
- Balance fields: `availableBalance`, `lockedBalance` (defined on User, see `01-Auth-Wallet-Connect.md`)
- Max bet = user's own `availableBalance`, no separate cap
- Disconnect grace period: 15 seconds before forfeit
- Crash/server failure: full refund, no fee taken
- Platform fee: 5% — taken from pot (pooled games) or baked into odds (solo-vs-house games)

## Open Questions
- None currently — this layer is locked for the dev/testnet phase.

## Last Updated
2026-08-14 — Initial version, written after escrow flow discussion.
