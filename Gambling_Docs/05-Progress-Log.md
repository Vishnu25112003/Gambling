# Progress Log

Dated changelog of decisions and milestones. Newest entry on top.

---

## 2026-08-17 — Invite & Earn (Referral Program) Implemented

The Affiliates section had a sidebar entry, a route, and a disabled "Invite Now"
button since the design handoff, with no backend at all. It is now real. New doc:
`09-Referral-Program.md`.

**Done:**
- `Referral` model + `User.referralCode` + `LedgerType.referral`, migration
  `20260817090000_add_referral_program`.
- Attribution: `?ref=CODE` → localStorage → applied at first sign-in via
  `POST /api/auth/verify`, plus a manual code box for anyone who missed the link.
- Payout: `awardReferralOnWin` called from `settleMatch` inside its transaction.
- `/api/referrals/{me,claim,code/:code}`, the Invite & Earn page, a landing-page
  "X invited you" banner, and the sidebar card enabled.
- 19 new tests (63 total, up from 44), all against real PostgreSQL. Verified
  end-to-end with two real wallets and real signatures.

**Decided during the build:**
- **The design's copy could not ship as written.** "Earn 5% of every bet your
  invited friends make" is 100% of the platform's own 5% pooled rake — it would
  have left the house at exactly zero on every pooled game a referred player
  touched. The live rule is **5% of net profit, once, on the friend's first
  winning match**. Copy fixed in `nav.ts` and the sidebar `InviteCard`.
- **First WIN, not first game.** Resolving on the literal first match pays nothing
  whenever the friend loses, which is most of the time, so the referrer's reward
  would turn on a coin flip they had no part in. Holding it `pending` until the
  friend first profits costs the house the same 5% and is *less* code — no need
  to track which match was the first.
- **House-funded, and `feeCollected` is left alone.** The commission is credited
  from treasury rather than skimmed off the pot, so the pot, the winner's payout
  and the fee row are all bit-identical to a match with no referral in it. Net
  revenue is `sum(fee) − sum(referral)`, both in the ledger. Reducing
  `feeCollected` was rejected: that column sits under
  `CHECK (feeCollected <= pot)`, an invariant that exists to protect player
  funds, and marketing policy does not belong inside it.
- **Payout lives in escrow, not in a game.** The games registry is still empty;
  hooking `settleMatch` means the commission works the day the first game ships,
  with no per-game code and no way for a game author to forget it. Principle #2
  holds — no game touches a balance.
- **`referralCode` is nullable-unique**, the same trick `LedgerEntry.txSignature`
  uses: Postgres treats NULLs as distinct, so pre-existing accounts needed no
  backfill. New accounts are minted with a code; older ones get one lazily.
- **Self-referral is blocked by a database CHECK**, not only in the route — same
  reasoning that put `availableBalance >= 0` in the init migration.
- Codes are Crockford base32 (no I/L/O/U) so they survive being read aloud.

**Notes for the docs:**
- `06-Landing-Dashboard-Structure.md` still describes only five dashboard
  sections; the shipped sidebar has ten. Worth reconciling.

**Pending:**
- **Sybil resistance is weak and is the one thing blocking real money here.** Two
  wallets owned by the same person can farm a commission off their own first win.
  Needs a minimum deposit or minimum wager gate before real-money mode.
- A referral can stay `pending` indefinitely if the friend never wins.
- Games list still undecided — Phase 2 remains the blocker.

**Status:** Referral program complete on devnet. Still no games.

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
