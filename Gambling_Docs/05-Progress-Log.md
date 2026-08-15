# Progress Log

Dated changelog of decisions and milestones. Newest entry on top.

---

## 2026-08-15 — PostgreSQL Migration Implemented

The MongoDB→PostgreSQL switch is now built, not just documented. Foundation
(docs 01, 02, 03, 06) runs on Postgres/Prisma. Still no games.

**Done:**
- Docker Postgres 16 on host port 5433, per doc 07. Port verified free on
  Dev4's machine; 5432 was indeed already taken.
- Prisma schema for User, AuthNonce, LedgerEntry, Match, MatchParticipant, all
  money columns `Decimal(20,9)`. Participants are a proper relational table with
  a unique `(matchId, userId)`.
- All four escrow functions ported to Postgres transactions; auth, wallet,
  leaderboard off Mongoose entirely. Mongoose removed from the project.
- 44 tests passing against a real throwaway Postgres database (was 34 on Mongo).
- Full auth flow re-verified end-to-end: 18/18 assertions.

**Decided during the build:**
- **CHECK constraints added to the init migration** — `availableBalance >= 0`,
  `lockedBalance >= 0`, `feeCollected <= pot`. The database now physically
  refuses an impossible balance even if application logic has a bug. This is the
  concrete payoff of the switch and is covered by tests.
- **Money never becomes a JavaScript number.** Stored as NUMERIC, handled as
  decimal.js, and sent over the API as exact decimal **strings** rather than JSON
  numbers — serialising a NUMERIC as a float would undo the whole point of the
  type. Pot splits are computed in whole lamports as BigInt so conservation is
  exact. The frontend formats strings for display and does no money math.
- **Concurrency via conditional UPDATE** (`WHERE availableBalance >= amount`)
  rather than read-then-write, satisfying doc 03's requirement. Ten simultaneous
  bets against a 5 SOL balance settle at exactly five.
- **Nonce expiry moved to a sweeper.** Mongo's TTL index has no Postgres
  equivalent; `nonceSweeper.ts` deletes expired rows on a timer. Security is
  unchanged — expired nonces were already rejected on read.
- **Prisma 7 specifics:** `url` is no longer allowed in schema.prisma. The CLI
  reads it from `backend/prisma.config.ts`; the runtime connects via the
  `@prisma/adapter-pg` driver adapter. Client generates to `src/generated/prisma`.

**Fields added beyond the docs' example models** (additive only, nothing
documented was changed or dropped): `Match.mode` (pooled | solo_vs_house — doc
03's settlement branches on it), `Match.pot`/`feeCollected`,
`MatchParticipant.forfeitedAmount`/`payout`/`status`, `User.displayName`/
`totalWagered`/`netProfit`/`gamesPlayed` (doc 06's profile and leaderboard), and
`LedgerEntry` audit fields. `LedgerType` extended past deposit/withdrawal to
cover lock/settlement/refund/forfeit/fee, which doc 03 requires.

**Notes for the docs:**
- `00-Overview.md` line 20 still says escrow happens "off-chain in MongoDB/
  Socket.IO" — leftover from before the switch, worth updating to Postgres.
- Doc 02's `LedgerEntry.txSignature` is non-nullable, but off-chain rows have no
  signature, so it's implemented as nullable-unique. Postgres treats NULLs as
  distinct, so this still allows exactly one row per real signature.

**Pending:**
- Games list still not decided — Phase 2 remains the blocker.
- Docker Compose isn't installed on Dev4's machine; `npm run db:up` falls back
  to plain `docker run` with an identical container.
- Redis needed before running more than one backend process (forfeit timers and
  the withdrawal queue are in-memory).

**Status:** Phases 3 and 4 complete on PostgreSQL. Next: pick games (Phase 2).

---

## 2026-08-15 — Database Switch: MongoDB → PostgreSQL
**Decided:**
- Switched database from MongoDB/Mongoose to PostgreSQL/Prisma across all docs — better fit for a ledger/escrow system needing strict balance integrity (relational constraints, mature row-locking, `NUMERIC` type for money instead of float-risk numbers)
- User, LedgerEntry, Match, and MatchParticipant models rewritten as Prisma schemas in `01`, `02`, `03`
- Match participants moved from an embedded array (Mongo-style) to a proper relational table (`MatchParticipant`)
- Local Postgres runs in Docker via `docker-compose.yml`, mapped to host port **5433** (not default 5432) to avoid clashing with other local containers — needs to be confirmed free on the actual dev machine, since this can't be checked remotely
- New doc created: `07-Local-Dev-Environment.md`

**Pending:**
- Confirm port 5433 is free on Dev4's machine; adjust if not
- Run first Prisma migration once schema is finalized

**Status:** Documentation updated. No code written yet.

---

## 2026-08-14 — Foundation Planning
**Decided:**
- New standalone hub (separate from Trumpcard Hub), gambling games only, games list TBD
- Auth: wallet-connect (Sign-In With Solana), no email/OAuth
- Internal generated ID as primary key, wallet address as unique mapped field
- Deposit/Withdraw: Option A treasury model (no contract yet), websocket detection, `confirmed` level
- Withdrawal network fee deducted from user payout
- Escrow: available/locked balance model, 4 shared functions (`lockBalance`, `settleMatch`, `refundMatch`, `forfeitPlayer`)
- 15-second reconnect grace period before forfeit; full refund on server crash
- 5% platform fee — pooled pot deduction (multiplayer) or baked into odds (solo-vs-house)
- Landing page: hero + game previews + leaderboard teaser + CTA
- Dashboard: enter freely, wallet-connect prompted on action (play/deposit) or via "Connect Wallet to view" placeholder on gated sections (profile, wallet, history)
- Locked architecture principle: games only call shared escrow/wallet interface, never touch money logic directly — enables swapping treasury model → on-chain program later, and adding contracts per-game later, without rewriting games

**Pending:**
- Games list not yet decided
- Landing page and dashboard visual/component design not yet started
- Actual code implementation not yet started

**Status:** Documentation phase — `00-Overview.md` and `01-Wallet-Auth-Escrow.md` created and locked.
