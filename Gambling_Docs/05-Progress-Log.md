# Progress Log

Dated changelog of decisions and milestones. Newest entry on top.

---

## 2026-08-28 — Trumpcard (Game 04) implemented end-to-end

Backend (`backend/src/games/trumpcard/{index,manifest,engine,socket,types}.ts`)
and frontend (`frontend/src/games/trumpcard/*`) built and registered — the game
is playable at `/dashboard/play/trumpcard`. Built directly against
`Games/G04-Trumpcard.md`'s existing spec, reusing Ludo's lobby-fill-gate and
seat-count-scaled-payout patterns and Mine Catcher's combined-lives-system
shape (with one deliberate deviation from Mine Catcher's disconnect handling —
see below).

**Done:**
- Full game engine: fixed 52-card deck (deterministic stats, not
  re-randomized per match), shuffle/deal respecting the 26/17/13
  cards-per-player caps, round resolution with the tie-pool mechanic,
  0-card and 0-life elimination, match-end detection (timer or last player
  standing), final ranking, and the Ludo/Trumpcard payout-split table ported
  verbatim.
- Realtime socket flow: lobby-fill-gated create/join (mirroring Ludo), leader
  stat-choice timer, staged round reveal, lives/elimination broadcasts, and
  settlement.
- **Deliberate fix versus copying Mine Catcher's disconnect pattern
  verbatim:** `escrow.forfeitPlayer()` is never called on a raw disconnect —
  only at the exact moment a life loss (skip or disconnect-timeout) brings a
  player to 0 lives. Copying Mine Catcher's literal pattern would have
  started a real stake-forfeit countdown on the *first* disconnect regardless
  of remaining lives, contradicting the game doc's own statement that the
  lives system decides only *when* `forfeitPlayer()` fires.
- Frontend: a page-state-machine board (lobby/create/waiting/live/result,
  same shape as `LudoBoard.tsx`), a generic stylized suit+rank stat card (no
  per-card art pipeline exists in this repo), a staged round-reveal overlay
  (interaction pattern referenced from the user's own "Gaming_Hub" demo
  project, reimplemented in this repo's own stack — no code shared), and a
  result screen with no rematch button (Rule 4's Rematch path doesn't cover
  3+ seats).
- **Shared `GameSetupWizard` generalized** from a single `extraStep` to an
  ordered `extraSteps[]` array, since this game needs three game-specific
  setup fields (seat count, cards-per-player depending on seat count, match
  duration) where the existing wizard only ever needed one. Every existing
  game's setup config (`coin-flip`, `ludo`, `mine-catcher`) was migrated to
  the new shape with no behavior change.
- Two open questions resolved with the user directly: card visuals (generic
  stat card, not character art) and the 3+ player tie-pool scope (every
  active player's compared card pools on a tie, not just the tied ones).
- 20 new unit tests (`backend/tests/trumpcard-engine.test.ts`) covering deck
  determinism, dealing/discard limits, round resolution (including the
  two-round tie-then-claim sequence), lives/elimination, leader succession,
  ranking, and payout weights. Backend and frontend both typecheck and build
  clean.

See `Games/G04-Trumpcard.md`'s Last Updated for the full breakdown and
`04-Games-Index.md` for the updated master table.

---

## 2026-08-25 — Trumpcard and Hand Cricket restructured onto the game doc template

`game_ideas/Game-Trumpcard.md` and `game_ideas/Game-HandCricket.md` were early,
unstructured drafts — no Identity table, no numbering, ad hoc section order.
Rewritten onto `Games/G00-Template.md` and filed as `Games/G04-Trumpcard.md`
and `Games/G05-Hand-Cricket.md`, registered in `04-Games-Index.md`. The
original draft files are removed; their content lives on in the two doc
files.

**Done:**
- **Trumpcard (Game 04)** needed the same two things Ludo's spec pass already
  won upstream — a Rule 2 exception for seat-count-scaled payout, and Rule 4's
  multiplayer lobby-fill extension. Both already existed with the identical
  split table, so no new shared-rule text was needed; `10-Game-Common-Rules.md`'s
  Rule 2 Exceptions entry was extended to name Trumpcard alongside Ludo.
  Trumpcard's own lives system (stat-choice skip + disconnect, combined,
  matching Mine Catcher's pattern) is documented as a per-game override, same
  as Mine Catcher's.
- **Hand Cricket (Game 05)** is strictly 1v1 and needed nothing new upstream —
  it reuses Rule 3's Free Bet 1v1 minimum stake and overrides disconnect
  handling with its own 3-lives anti-stall system, the same override pattern
  Mine Catcher established. Its dual-unreachable edge case reuses Mine
  Catcher's still-undecided settlement mechanism rather than inventing a
  second one.
- No game logic changed — this was a documentation pass. Neither game is
  registered in `backend/src/games/registry.ts`; both stay at 0%, designed
  only, matching the other three games' status before they were coded.

See `04-Games-Index.md` for the updated master table and
`10-Game-Common-Rules.md`'s Rule 2 Exceptions for the extended entry.

---

## 2026-08-24 — Ludo's Rule 2 and Rule 4 amendments applied to the shared rules

`Games/G02-Ludo.md` proposed two amendments to `10-Game-Common-Rules.md` as paste-ready text; both are now applied for real.

**Done:**
- **Rule 2 gained an Exceptions subsection** — a documented per-game override path for the fixed top-2/70-30 split. Ludo is its first and only entry: 2 players = winner-take-all, 3 = 70/30, 4 = 50/30/20. Added a "Rules Locked" bullet making clear this is the only sanctioned way to deviate from Rule 2 — no game may carve out its own split silently.
- **Rule 4 gained a Multiplayer Extension subsection** — Random Play and Friends Play now require every chosen seat filled before a 3+ player match can start, on top of the existing 1v1 behavior. Written game-agnostically (not Ludo-specific) since any future multiplayer game hits the same gap; Rule 4's Scope line updated to match.
- Updated in step: the Status block, the "Rules at a glance" reference table, and the changelog at the bottom of `10-Game-Common-Rules.md`.
- **New open question added:** the multiplayer extension says nothing about a partially-filled lobby's own state (what a listing shows mid-fill, whether a seated player can leave before it's full) — tracked there, not resolved by this amendment.
- `Games/G02-Ludo.md` and `04-Games-Index.md` updated to link to the live rules instead of quoting proposed text; Game 02 is now fully specified except for schema debt inherited from Rule 4 having no lobby model yet.

---

## 2026-08-24 — Ludo and Mine Catcher restructured onto the game doc template

`game_ideas/Game-Ludo.md` and `game_ideas/Game-MineCatcher.md` were early,
unstructured drafts — no Identity table, no numbering, ad hoc section order.
Rewritten onto `Games/G00-Template.md` and filed as `Games/G02-Ludo.md` and
`Games/G03-Mine-Catcher.md`, registered in `04-Games-Index.md`. The original
draft files are removed; their content lives on in the two doc files.

**Done:**
- **Mine Catcher (Game 03)** needed one thing from the shared rules — a Free
  Bet 1v1 minimum stake — and that landed in Rule 3 back on 2026-08-19. Its doc
  is now fully specified, same as Coin Flip; its remaining open questions (the
  dual-unreachable settlement mechanism, whether it makes a provably-fair
  claim) are game-owned, not inherited.
- **Ludo (Game 02)** still needs two things Rule 2 and Rule 4 don't provide
  yet: an override letting paid places scale with seat count, and a
  multiplayer discovery flow (Rule 4 is 1v1-only today). Both are written as
  paste-ready text in the doc's Reference section, not yet applied upstream.
  Until Rule 4 gains that extension, the doc specifies Ludo's own lobby-fill
  flow as a stopgap.
- No game logic changed — this was a documentation pass. Neither game is
  registered in `backend/src/games/registry.ts`; both stay at 0%, designed
  only, matching Coin Flip's status before it was coded.

See `04-Games-Index.md` for the updated master table and
`10-Game-Common-Rules.md`'s Open Questions for where the two Ludo amendments
are tracked.

---

## 2026-08-22 — `displayName` and `username` merged into a single name field

Profile settings showed two separate editable fields — `username` (the unique,
URL-safe handle) and `displayName` (a free-form, non-unique label) — with a
`displayName ?? username ?? shortAddress(wallet)` fallback repeated ad hoc
across the leaderboard, account menu, referral flows and coin-flip in-game
labels. Confusing to edit and easy to let drift.

**Done:**
- **`User.displayName` column dropped** (migration
  `20260822120000_drop_display_name`). `username` is now the one name field:
  still unique, lowercase, 3–20 of `[a-z0-9_]`, still the `:handle` in
  `/dashboard/u/:handle` — it now also carries what `displayName` used to.
- **`PATCH /api/auth/me`** takes `{ username: string | null }` only, no longer
  two independently-optional fields.
- **`backend/src/lib/user.ts`** — `userLabel()`, `publicUser()` and
  `publicProfile()` simplified to the one field; every call site that had its
  own `displayName ?? username ?? shortAddress(...)` fallback (leaderboard,
  `AccountMenu`, `DashboardShell`, referral routes, coin-flip socket handlers)
  collapsed to `username ?? shortAddress(...)`.
- **`IdentityForm`** (settings) now renders one "Name" input instead of two.
- No backfill needed: the one dev row with a `displayName` already had a
  matching `username` set.

See `01-Auth-Wallet-Connect.md` and `11-User-Profiles.md` for the updated
schema and endpoint contract.

---

## 2026-08-19 — Game docs given a numbering scheme; Coin Flip realigned to Rule 4

The `Games/` folder had one file, `Game-CoinFlip.md`, written before Rule 4
existed and linking to a doc that does not exist (`010-Game-Common-Rules.md`,
three times). With more games coming, the folder needed a scheme before it
needed more files.

**Done:**
- **Numbering scheme.** Game docs are now `Games/GNN-<Game-Name>.md`. Numbers
  are assigned in `04-Games-Index.md` and nowhere else, never change, and are
  never reused. The `G` prefix keeps them clear of the root doc numbers — `01`
  is Auth, `G01` is Coin Flip.
- **`Games/G00-Template.md`** — blank game doc with the fixed section order
  (Identity → Summary → Overview → Status → Flow → Where This Lives → TODO →
  Reference → Open Questions → Related Docs). Every new game is a copy of it.
- **`Games/G01-Coin-Flip.md`** — renamed from `Game-CoinFlip.md` and rewritten
  onto the template. The three broken rule links fixed. Match setup rewritten
  against Rule 4: the "Random Play vs Friends Play mechanics unconfirmed" open
  question is **closed**, replaced with the actual flows (public listing +
  instant join, or room code + both players confirm) and an explicit note that
  the game builds no lobby of its own. `Where This Lives` now matches the real
  `backend/src/games/<id>/` convention instead of an invented one, and the two
  exact `settleMatch` calls (outright win, tie) are spelled out.
- **`04-Games-Index.md`** — Coin Flip registered as Game 01, master table given
  No./Game ID/Doc columns, plus the naming scheme, a "next free number" marker,
  and an add-a-game checklist.
- Cross-references updated in `00-Overview.md`, `10-Game-Common-Rules.md`,
  `backend/src/games/registry.ts` and `backend/src/games/README.md` — the last
  two still claimed the index had no entries.

**A verification pass afterwards caught one error and two knock-on gaps.**

- **`forfeitPlayer()` does not end a match** — it confiscates the disconnected
  player's stake into the pot and nothing more. The game must still call
  `settleMatch([present player], [1])` to name the winner and release the pot.
  Four places in `Games/G01-Coin-Flip.md` said or implied the forfeit was the
  ending; a game following that text would have stranded the pot. Corrected,
  and stated explicitly in the escrow tie-in so the next game does not repeat it.
- **The reserved-stake decision broke two other docs.** `03-Escrow.md` opens by
  describing the model as "two balance fields"; a reserve is a third, and
  `lockBalance()`'s `amount <= availableBalance` check is wrong once reserves
  exist. `02-Deposit-Withdraw.md` validates withdrawals against
  `availableBalance` alone, so a player could withdraw the funds their own
  pending match is holding — reintroducing exactly the failure the reserve was
  added to prevent. Both docs now carry the requirement; `02` had said "no open
  questions — this layer is locked", which is no longer true.

**Then the audit's questions were worked through one at a time, and every
game-owned one is now closed.** In order:

| Question | Decision |
|---|---|
| Dead-rubber rounds | Match ends at the clinch threshold, `floor(N/2)+1`. A 5-round match won 3–0 stops at round 3. |
| Disconnect mid-timer | Both clocks run. Action timers never pause; rounds are lost in real time and stand on reconnect. |
| Reconnect state | Full live board **plus** a log of the rounds missed and why. Timers are never extended for a returning player. |
| Round count | Odd only, preset 3–15. Odd counts cannot end level. |
| Sudden death | Kept, flagged **DO NOT BUILD** — odd counts make it unreachable. Retained as spec if even counts ever return. |
| Round 1 seat draw | Committed and revealed like a coin result. Nothing random in the game is unverifiable now. |
| Seat symmetry | Spin timer 5s → **10s**. The old 5/10 split quietly penalised the previous round's winner. |
| Fairness record | Permanent per-round record (commit, seed, result, call, cause, seats) + an in-app verifier. Seed written only at reveal. |
| Result screen | Round-by-round breakdown with per-round verify links, not a "leaderboard" — a 1v1 match has nothing to rank. |

**Three of the answers turned out not to belong to Coin Flip, and amended
`10-Game-Common-Rules.md` instead:**

- **Rule 4 gained a third discovery path: Rematch.** The result screen's rematch
  button had nowhere to go — a rematch is a new match needing new locks, and
  Rule 4 knew only "publish a listing" and "send a code to someone not here".
  Rematch carries the settings over, both players confirm, new match id, and is
  offered regardless of how the original match started (gating it on discovery
  mode would be exactly the downstream branch Rule 4 forbids).
- **Rule 3 gained a minimum stake for Free Bet 1v1.** Winner-take-all plus
  free stakes means the *smaller* staker is +EV once the opponent stakes more
  than ~1.11× theirs. A host-set floor bounds it. Recorded honestly as partial:
  the asymmetry between floor and host stake survives, and an over-staking
  joiner is still exposed with no protection at all.
- **Rule 4 now reserves the stake at match creation.** Deferring the lock to the
  confirm step created a failure mode — spend the balance meanwhile and
  `lockBalance()` fails at the worst moment. Stakes are now fenced off
  (unspendable, but not in escrow) from creation and convert to a lock on
  confirmation. This needs a **third balance field** beside `availableBalance`
  and `lockedBalance`, and makes confirm-step expiry mandatory: a reserve that
  never expires is a fund leak.

Coin Flip now has **no open questions of its own**. What blocks it is inherited:
Rule 4 still has no schema, no lifecycle, and now no reserved-balance field.

**Open Questions re-audited — the file briefly claimed "nothing is open here",
which was wrong.** Eight game-level gaps are now recorded in
`Games/G01-Coin-Flip.md`: whether dead-rubber rounds are played out once the
score is unreachable; what happens when a player disconnects while a 5-sec or
10-sec action timer is already running (two clocks, no stated winner); what the
client is sent on reconnect; round count being unbounded; Round 1's spinner
being the one uncommitted random draw in a provably-fair game; the 5-sec spinner
vs 10-sec caller asymmetry always landing on the previous round's winner;
where commit/reveal records are persisted for after-the-fact verification; and
what a "match leaderboard" means for two players.

**Two of them were not Coin Flip's, and moved to doc 10.** Free Bet Mode is
exploitable in any 1v1 game — Rule 2 pays the winner the whole post-fee pot
regardless of stake, so the smaller staker is +EV once the opponent stakes more
than ~1.11× theirs, and Rule 4's instant no-approval join makes it reachable.
And a Friends Play room code that sits unredeemed can have its host's balance
spent underneath it, failing `lockBalance()` at the confirm step. Coin Flip is
the first 1v1 game, which is why both surfaced now.

**Sudden death, decided the same day.** Round counts stay unrestricted, and an
even count that ends level now plays **one sudden-death round** instead of
splitting the pot. It reuses the round engine untouched — same commit-reveal,
same 5-sec and 10-sec timers, same forfeit-on-timeout — with the winner of the
last scheduled round spinning, per the normal rule. No extra stake is locked;
it is an extra round of the same match.

One round is always enough: a Coin Flip round cannot be drawn (the caller
matches or does not, and a timeout forfeits the round), so sudden death cannot
itself end level. Coin Flip therefore has **no tied match outcome** and never
calls Rule 2's tie-split — a tie used to cost both players the 5% fee for no
result. If sudden death cannot be played because a player is gone past the
escrow 15-second grace period, `forfeitPlayer()` decides it, not a split.

## 2026-08-19 — Wallet connect was down: an unapplied migration, and a silent UI

Connecting a wallet did not sign anyone in. The cause was not in the wallet
layer at all: migration `20260818120000_add_user_profiles` (doc 11) existed on
disk but had never been applied to the dev database. The generated Prisma client
selects every column in `schema.prisma`, so `findOrCreateUser` — and therefore
`POST /api/auth/verify` — returned a 500 reading
`The column users.gamesWon does not exist in the current database`.
`GET /api/leaderboard` was failing the same way.

One missing migration therefore broke all three of the identity features at
once: sign-in, profile restore on a later reconnect, and username uniqueness.
None of them needed building — doc 11 had shipped them all.

**Why it presented as "the wallet won't connect".** `isAuthenticated` is
`Boolean(user)`, and `user` comes from our API, not from the adapter. A wallet
that connected and signed perfectly still left every button reading "Connect
Wallet". `AuthState.error` was populated and rendered by **nothing** — all 18
`useAuth()` call sites were checked — so a 500 was indistinguishable from a dead
click. The wallet modal itself was verified working the whole time.

**Done:**
- Applied the migration. Sign-in, leaderboard, profiles and username claims all
  recovered with no code change.
- **`connectDb()` now refuses to boot** when migrations on disk are missing from
  `_prisma_migrations`, naming them and pointing at `npm run prisma:migrate`. A
  backend that will 500 every auth request should not report itself as up. This
  is the actual fix — the migration was a one-off, the silence was the bug.
- **`AuthErrorBanner`**, mounted once above the routes. A sign-in can start from
  four places (landing CTA, topbar, drawer footer, gated placeholder) and only
  one has room for a message beside the button. It does not auto-dismiss.
- **`onError` on `<WalletProvider>`.** The default handler `window.open`s the
  wallet's download page on `WalletNotReadyError`, which popup blockers eat — so
  a wallet that is not installed also looked like a dead button.
- **`UsernamePrompt`** — asked once after a first sign-in, skippable, keyed on
  `user.username` being null rather than on `isNewUser`, so accounts that
  predate it are asked too. The availability lookup was extracted out of
  `IdentityForm` into `useUsernameCheck` so the two cannot drift on debounce
  timing or on what counts as blocked.
- **Session length 7d → 30d.** Reconnecting resolves to the same UUID either
  way; this only saves a returning player a signature prompt.
- **Dropped `@solana/wallet-adapter-wallets`** for the two adapters actually
  used. The barrel is 36 `export *` lines and Vite pre-bundled all of it — 1.8 MB
  across ~300 files — dragging in the Keystone chain that hoisted **react-dom@16**
  into the repo root beside react@19. `npm ls react-dom` reported it invalid;
  it was masked only because `@vitejs/plugin-react` injects its own dedupe.
  `resolve.dedupe` is now declared explicitly and root `overrides` pin
  react/react-dom to 19.
- `signOut` awaits `disconnect()`; `frontend/.env` created (the public devnet RPC
  was being used unpinned).

**Verified:** 100 tests pass; both workspaces typecheck and build. Sign-in was
driven end-to-end with a real ed25519 keypair (same wallet twice → same UUID,
`isNewUser` false the second time), and the username prompt, availability hints,
409-on-taken and the error banner were all exercised in a real browser.

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
