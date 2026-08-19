# Progress Log

Dated changelog of decisions and milestones. Newest entry on top.

---

## 2026-08-18 — User Profiles: Identity, Tier Badges & Deep Statistics

New doc: `11-User-Profiles.md`. Every player now has a profile page — username,
uploaded picture, loyalty tier, and their full playing record — plus a read-only
public version at `/dashboard/u/:handle` reachable from the leaderboard. First
feature work since doc 09; the dashboard previously had no profile at all, and
`/dashboard/profile` just redirected to Settings.

**Done:**
- **Schema:** `User.username` (nullable-unique, lowercase, CHECK-constrained to
  `^[a-z0-9_]{3,20}$` because it is a URL segment), `User.avatarUrl`,
  `User.gamesWon`, and `MatchParticipant.stakeTotal`. Migration
  `20260818120000_add_user_profiles`, with hand-added CHECKs and a backfill,
  following the convention set by the init migration.
- **`backend/src/profile/`** — tiers, usernames, avatar storage, statistics,
  match history and routes. Read-only aggregation, so it queries Prisma directly;
  the only WRITES it needs live in escrow, where a game module can't forget them.
- **Avatar upload** on local disk: multer memory storage, real magic-byte
  sniffing, `sharp` to a 256px WebP, filename derived only from the session id.
- **Frontend:** two pages, nine profile components, a shared `Avatar`, a
  hand-rolled SVG `Sparkline`, two hooks, and five tier colours as CSS custom
  properties in both palettes.
- **Tests:** `backend/tests/profile.test.ts`, 37 cases against real PostgreSQL.
  Suite is now 100 tests, up from 63. A further 96 end-to-end HTTP checks were run
  against a live API during the build (sign-in, profiles, uploads, populated
  stats driven through real escrow calls).

**Two pre-existing escrow bugs found and fixed:**
- **A forfeited player was counted twice.** `forfeitPlayer` debits `netProfit` and
  increments `gamesPlayed` when the reconnect window closes; `settleMatch` then
  looped over *every* participant and did both again. One 1 SOL forfeit recorded
  two games played and a 2 SOL loss.
- **A forfeit followed by a crash-refund never unwound.** `refundMatch` returned
  the stake and decremented `totalWagered` but left the forfeit's `netProfit`
  debit and `gamesPlayed` increment in place permanently.

Both were found by tracing the counters while designing the win/loss split, and
both would have made the profile visibly self-contradictory —
`gamesWon + gamesLost` would not have equalled `gamesPlayed`. Each has a
regression test, and each test was confirmed to FAIL against the old code before
the fix was kept.

**Decided during the build:**
- **A tier is derived on every read, never stored.** Deliberately the opposite of
  doc 09's `commissionBps`, and the contrast is the reasoning: a commission is a
  *promise* fixed at bind time, so re-pricing it later would break it; a tier is a
  *current standing*. Storing it would mean a threshold change applied to new
  players but not old ones, and needed a backfill to correct.
- **`MatchParticipant.stakeTotal` had to exist.** `settleMatch` sets
  `lockedAmount` to 0, so after a match the participant row cannot answer "what
  did they stake" — and without that there is no win, loss or net for any history
  row. The stake did survive inside a ledger entry's `meta` JSON, but parsing
  money back out of a JSON blob is exactly what doc 03's money discipline exists
  to avoid.
- **Streaks are a SQL window function, not stored counters.** Counters would need
  maintaining in three separate escrow files and would be silently wrong forever
  after any drift — which the two bugs above show is not hypothetical.
- **The profile handle is a username, falling back to the internal UUID — never
  the wallet address.** The leaderboard already refuses to publish full addresses,
  and a URL is more public than a table cell: it lands in browser history, referer
  headers and shared links. The UUID fallback means every player is linkable
  immediately and the URL simply gets prettier once they claim a name.
- **A public profile is a separate projection, not a filtered `publicUser()`.**
  `publicUser` returns balances and the full address; filtering it would mean every
  field added there later leaks by default. As a separate function the omission is
  structural.
- **Built against real queries with no games in existence.** Every figure is zero
  today and every section renders the empty state, but the queries are real — so
  the page is correct from the first match ever settled rather than needing a
  second pass when doc 04 fills in.
- **Statistics moved OUT of Settings.** Settings kept three stat tiles duplicating
  the same numbers; two places showing one figure is how they eventually disagree.
  Settings now keeps the wallet address and the recovery note and links across.
- **The avatar was consolidated from three implementations into one.** A local
  component in `AccountMenu`, a rival five-gradient palette in `LeaderboardTable`,
  and `lib/avatar.ts`. One wallet is now one colour everywhere.

**Notes for the docs:**
- `01-Auth-Wallet-Connect.md`'s `User` table was six columns behind the shipped
  schema — the gap flagged in the 2026-08-15 entry below. Now corrected in full.
- `06-Landing-Dashboard-Structure.md`'s proposed `ProfilePanel.jsx` is not what
  shipped (the profile is a page, not a panel); flagged in place. Its five-section
  description is still stale against the ten in the shipped sidebar.
- Doc 11 uses `[[wikilinks]]`, matching `09`. The vault's mixed link style is
  still unresolved.

**Pending:**
- The tier ladder is **cosmetic** — a badge and nothing else. A real benefit
  (rakeback, a fee discount) is what the unbacked **Rewards** section has been
  promising since the design handoff, and any fee discount would have to be
  specified in `10-Game-Common-Rules.md` Rule 1, not in doc 11.
- Tier thresholds (1 / 10 / 50 / 250 SOL) are guesses, uncalibrated against real
  volume.
- No achievement badges, no image moderation, and username changes leave no
  redirect — an old profile link can silently resolve to a different person.
- Avatars on local disk do not survive a second backend instance. Same shape as
  the treasury-key and Redis notes: fine for devnet, must move before launch.
- Games list still not decided — Phase 2 remains the blocker.

**Status:** Profiles built, tested and verified end-to-end. 100 backend tests
passing. Still no games.

---

## 2026-08-18 — Game Common Rules Split Out; Docs Restructured

New doc: `10-Game-Common-Rules.md`. Rules 1–3 (platform fee, payout
distribution, betting mode) now live in one file instead of being scattered
across escrow and the game index. No code changed — this is a documentation
restructure only.

**Done:**
- `10-Game-Common-Rules.md` created, linked from `00`, `03`, `04`, and `09`, and
  written in the vault's standard section format.
- **Fee policy removed from `03-Escrow.md` without losing any of it.** Every
  sentence that defined a *rate* moved to doc 10 Rule 1; escrow keeps the
  *mechanism* and links out for the number.
- `04-Games-Index.md` gained a **Players (1v1 / Multiplayer)** column, so Rule 2's
  payout mode is actually recorded per game rather than being implicit.
- Stale content corrected: `00`'s "no code written yet" status, its roadmap
  checkboxes (Phases 3 and 4 shipped on 2026-08-15), and the MongoDB reference
  flagged in the 2026-08-15 entry's Notes. `03`'s "0% complete", its proposed
  `/backend/escrow/*.js` layout (actually `backend/src/escrow/*.ts`), and a
  leftover "same pattern as Raja Rani" reference from Trumpcard Hub.

**Decided during the restructure:**
- **Policy and mechanism are separate files.** `03` is *how* money moves, `10` is
  *what* the rules are. A rate changes far more often than escrow code does, and
  with it stated in one place a change is one edit, not a hunt through the vault.
  Locked as Architecture Principle #5 in `00`.
- **The file is `10-`, not `010-`.** Alphabetical sort put `010-` between
  `00-Overview.md` and `01-Auth-Wallet-Connect.md`, so the vault sidebar listed
  the newest, highest-numbered doc second. Two-digit prefixes throughout.
- **Rules 2 and 3 are documented but not enforceable.** Nothing on `Match`
  records 1v1-vs-multiplayer or fixed-vs-free bet, so both are conventions a game
  module upholds rather than database facts. Logged as an open question in both
  `03` and `10` rather than quietly assumed to work.

**Pending:**
- **`betMode` + `fixedBetAmount` on `Match`** — Rule 3 does nothing until these
  exist and `lockBalance` validates against them. Every match is Free Bet today.
  Needed before the first game with a host-created lobby.
- Link style is mixed across the vault: `09` uses Obsidian wikilinks
  (`[[03-Escrow]]`), every other doc uses backticks. Worth picking one.
- `06-Landing-Dashboard-Structure.md` still describes five dashboard sections;
  the shipped sidebar has ten. Carried over from the 2026-08-17 entry, still open.
- Games list still undecided — Phase 2 remains the blocker.

**Status:** Docs restructured and cross-linked. No code written. Still no games.

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
*(`01-Wallet-Auth-Escrow.md` was later split into `01-Auth-Wallet-Connect.md`, `02-Deposit-Withdraw.md`, and `03-Escrow.md`. Kept as written — this is a historical entry.)*
