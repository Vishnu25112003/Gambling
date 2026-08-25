# Game Common Rules

## One-Line Summary
The fee, payout, betting-mode and match-discovery rules that apply to **every** game in the hub — the single source of truth for "who gets paid what" and "how two players find each other", which `03-Escrow.md` executes and no individual game redefines.

## Overview
`03-Escrow.md` owns the *mechanism* of moving money (lock, settle, refund, forfeit). This file owns the *policy* those mechanisms enforce: how big the platform's cut is, how a settled pot is divided between finishers, and how a match's bet amount is decided. The split matters — escrow is code, this is policy, and policy changes far more often than code does. Whenever a number here changes (the fee rate, the 70/30 split), only this file and the escrow constants that mirror it need touching; no game module does.

Rule 4 is the one rule here that sits *before* escrow rather than inside it. It governs how two players are matched together — the lobby, not the money — and stops every game inventing its own lobby. Once a match actually starts, Rule 4 has nothing further to say and Rules 1-3 take over unchanged.

Every game inherits all four rules automatically. A game's own `Games/GNN-<Game-Name>.md` file only documents what is *specific* to that game (its odds table, its win condition, its board state) — never a fee or payout rule, which would create a second source of truth.

## Status
- **Phase:** Devnet/testnet
- **Rules 1–2:** Locked, but **Rule 2 amended 2026-08-24** by Ludo's spec pass — a documented per-game exception path now exists for the fixed top-2/70-30 split (see Rule 2's Exceptions). Rule 1 remains unchanged since it was written.
- **Rules 3–4:** Locked, but **amended 2026-08-19** by the first 1v1 game's spec pass — Rule 3 gained a minimum stake for Free Bet 1v1; Rule 4 gained a third discovery path (Rematch) and stake reservation before the lock. **Rule 4 amended again 2026-08-24** by Ludo's spec pass — gained a multiplayer lobby-fill extension. Locked means no game may redefine them outside a documented exception like the ones above, not that they are finished.
- **Enforced by:** `03-Escrow.md` (`settleMatch` for Rules 1–2, `lockBalance` for Rule 3). Rule 4 runs *before* escrow and has no enforcement point yet — see Open Questions.
- **Depends on:** `03-Escrow.md` (the functions that apply these rules)

---

## Rule 1: Platform Fee Structure

**Fee:** 5% of the pot/winnings, taken by the platform on every settled match.

**How it's applied — two calculation modes:**

- **Pooled/multiplayer games** (players bet against each other, one pot): 5% is deducted from the **total pot** before payout, and the remainder is distributed to the winners by weight (per Rule 2).
  - Example: 2 players × 1 SOL = 2 SOL pot → 0.1 SOL to house → winner gets 1.9 SOL

- **Solo-vs-house games** (player bets against the platform — dice, slots, roulette): the 5% is **baked into the payout odds table** rather than deducted as a separate line. `settleMatch` charges no fee here and simply pays out according to that game's odds — charging again would take the same 5% cut twice off the same player. That game's odds table lives in its own `Games/GNN-<Game-Name>.md` file.

**No fee is ever taken on a refund.** If a match is cancelled or the server crashes, `refundMatch` returns every stake in full — a crash is the platform's fault, not the player's.

---

## Rule 2: Payout Distribution by Player Count

**Scope:** Applies only to pooled/multiplayer **player-vs-player** games. Solo-vs-house games (dice, slots, roulette) are not covered by this rule — they stay under Rule 1's odds-table model, since there's no "2nd place" in a player-vs-house game.

**Game type determines the payout mode — not how many people actually join.** Whether a game is "1v1" or "multiplayer" is a fixed property of that game, decided at game design time, and locked in at match start. A forfeit that shrinks the lobby mid-match does **not** change which payout rule applies.

**1v1 games** (games designed for exactly 2 players):
- Winner takes the **entire pot**, after the 5% platform fee from Rule 1 is deducted

**Multiplayer games** (games designed for 3+ players):
- Only the **top 2 finishers** get paid — split **70/30**: 1st place gets 70% of the pot, 2nd place gets 30% (after the 5% platform fee is deducted)
- Players finishing 3rd place or lower get nothing back
- This 70/30 split stays **fixed regardless of lobby size** — a 10-player match still only pays the top 2, same as a 3-player match. It does not scale to top 3+ for larger lobbies.
- If a mid-match forfeit reduces the lobby down to 2 remaining players, the match **still pays out under the multiplayer 70/30 rule** — it does not switch to the 1v1 winner-take-all rule, since the payout mode was already locked in at match start based on the game's type.

**Ties:** If two or more players tie for a paid place (1st or 2nd), that place's prize share is **split evenly** among the tied players.

**How this reaches escrow.** A game module expresses its finishing order through `settleMatch(matchId, winners[], weights[])` — the game supplies the ranking, and this rule supplies the weights:

| Game type | Call |
|---|---|
| 1v1 | `settleMatch(id, [winner], [1])` — one winner, whole post-fee pot |
| Multiplayer | `settleMatch(id, [first, second], [70, 30])` |
| Multiplayer, tie for 1st | `settleMatch(id, [a, b], [35, 35])` — the 70 share split evenly, 2nd place unpaid |

Weights are **relative** for pooled games (escrow normalises them against the post-fee pot). For solo-vs-house games they are **absolute SOL payouts** straight from the odds table — see Rule 1.

### Exceptions

The fixed top-2/70-30 split above is the default for every multiplayer game. A game may override it **only** via a documented exception listed here — never silently in its own doc — so this file stays the one place a reader checks to know how any game actually pays out.

**Exception — Ludo, Trumpcard:** Unlike other multiplayer games, these games' number of paid places scales with actual seated player count instead of staying fixed at top 2:

| Seated players | Paid places | Split |
|---|---|---|
| 2 | 1 (winner only) | 100% |
| 3 | 2 | 70% / 30% |
| 4 | 3 | 50% / 30% / 20% |

This is a documented per-game override of Rule 2's fixed-top-2 rule, added because both games' seat count is chosen by the host per match (2, 3, or 4) rather than fixed at design time like other multiplayer games — see `Games/G02-Ludo.md` (which first surfaced it) and `Games/G04-Trumpcard.md` (which reuses the identical table, added 2026-08-25).

---

## Rule 3: Betting Mode — Fixed Bet vs Free Bet

**Chosen by:** The host, per match, at the time the match is created. Available for any game — 1v1 or multiplayer.

**Fixed Bet Mode:** Host sets one bet amount when creating the match. Every player who joins must bet exactly that amount — no variation allowed.

**Free Bet Mode:** Each player picks their own bet amount when joining, independent of everyone else. Still capped by their own `availableBalance` (per the escrow max-bet rule — no separate cap for this mode).

**Minimum stake — Free Bet, 1v1 only.** A 1v1 Free Bet match is created with a **minimum stake** that any joining player must meet or exceed. Without it, Rule 2's winner-take-all makes the smaller staker strictly better off: staking `a` against an opponent's `b` is profitable as soon as `b > ~1.11a`, the 5% fee being the only thing holding the threshold above parity. The floor is what stops a 10 SOL host being taken on for 0.1 SOL.

- Set by the host at match creation, alongside the bet amount
- Shown on the Random Play listing, and to a Friends Play joiner before they confirm
- Enforced in `lockBalance()` — a stake below the floor is rejected and the join fails
- Applies to 1v1 only. Multiplayer Free Bet matches pay the top 2 by rank out of a pot many players fed, so no single opponent's stake sets another player's exposure.

**This is deliberately partial protection.** Two holes stay open and are tracked below: the asymmetry between the floor and the host's own stake still favours the lower staker, and the floor does nothing about a *joiner* who stakes far more than the host — the same exploit pointed the other way. A floor bounds the damage; it does not make Free Bet 1v1 symmetric.

**Payout is unaffected by bet mode.** In both modes, payout still follows Rule 2 exactly — rank decides the payout share (winner-take-all for 1v1, 70/30 for multiplayer), regardless of who staked what. A player who bet less can still walk away with the full winning share if they finish 1st or 2nd — Free Bet Mode does not introduce stake-proportional payouts.

---

## Rule 4: Match Discovery — Random Play vs Friends Play

**Scope:** 1v1 games, plus the multiplayer lobby-fill extension below for 3+ player games using Random Play or Friends Play. Everything else in this rule — reserved stakes, the confirm step, Rematch — is written for two players and does not yet describe a waiting room, a partial-lobby display, or a minimum-player rule for 3+ seats beyond "all chosen slots must fill." See *Multiplayer Extension* for exactly how far the coverage goes, and Open Questions for what it still leaves unanswered.

**Chosen by:** The host, per match, at the moment the match is created. Every 1v1 match is created in exactly one of these **three** modes, and there is no way to convert one into another after creation. Random Play and Friends Play are the two ways to start from nothing; **Rematch** is the third, and it is the only one that does not need a host, because both players are already present.

**This rule governs only how two players find each other.** It says nothing about what happens once they have. Escrow locking, the game itself, settlement, forfeits and refunds are identical in both modes — the two paths converge completely the moment the match starts, and everything past that point is Rules 1-3 and `03-Escrow.md`.

### Random Play

1. The host fills in the normal game settings — rounds, bet mode and bet amount per Rule 3, and whatever else that game defines.
2. The match is listed **publicly**, visible to any player browsing that game.
3. Any player can join **instantly**: first-come-first-served, with **no host approval step**. The host does not get to see, vet or reject who takes the open seat.
4. On join, both players' amounts are locked via escrow and the match starts.

There is no ready-up in Random Play. Joining *is* the confirmation — the joining player already saw the settings on the listing before clicking, and the host already committed to them by publishing it.

### Friends Play

Two screens, **Create** and **Join**.

**Create:**
1. The host fills in the same normal game settings as Random Play — nothing about the settings differs between the two modes.
2. The system generates a **room code** for the match.
3. The match is **not listed publicly**. The code is the only way in.

**Join:**
1. A friend enters the room code to find the match.
2. **Both players must then separately confirm — ready up — before anything locks.** Entering the code does not start the match, and it does not commit either player's funds.
3. Once *both* have confirmed, both players' amounts are locked via escrow and the match starts.

**Why Friends Play has a ready-up and Random Play does not.** In Random Play the settings are public before anyone joins, so a joiner has already agreed to them by joining. A room code carries no settings with it — it is passed around in a chat message — so the friend arrives without having seen the stake. The confirm step is where they actually see what they are agreeing to. The host confirms too, rather than being auto-committed at creation, because a code may sit unused for a while and the host must still be present and willing when it is finally redeemed.

### Reserving the Stake Before the Lock

All three modes have a gap between committing to a match and locking funds for it — a published listing waiting for a joiner, an unredeemed room code, an unanswered rematch offer. **Across that gap the stake is reserved, not locked.**

1. When a player creates a match, publishes a listing, or offers/accepts a rematch, their stake is **reserved** immediately.
2. A reserved stake is **not spendable** — not by another match, not by a withdrawal — but it is **not in escrow** either. No match holds it, and no `settleMatch` or `refundMatch` can touch it.
3. When both sides confirm, the reserve converts to a real escrow lock via `lockBalance()`. **Because the funds were already fenced off, this step cannot fail for insufficient balance.**
4. If the match is cancelled, the code expires, or the rematch is declined, the reserve is **released** in full. No fee, no ledger entry — nothing economic happened.

**Why a third state rather than locking early.** Locking at creation would put funds into escrow for a match that may never exist, which is exactly what Rule 4 defers in order to avoid. Reserving keeps that promise — the player is not staked and cannot lose the money — while removing the failure mode the deferral created.

**This requires a third balance field.** `03-Escrow.md` currently models exactly two: `availableBalance` and `lockedBalance`. A reserved stake belongs to neither — unspendable, but not at risk — so it needs its own field, and `lockBalance`'s validation must count reserved funds as unavailable. Tracked in Open Questions; not yet built.

### Rematch

The third path, and the only one that starts from a *finished* match rather than an empty one. Two players who have just played are already together — a public listing has nobody to attract and a room code has nobody to send to — so neither existing mode fits.

1. When a match settles, **both players are offered a rematch** on the result screen.
2. The new match **carries the previous match's settings over unchanged** — same game, same round count, same bet mode, same bet amount. Nothing is editable; changing any setting means creating a new match the normal way.
3. **Both players must confirm**, exactly as in Friends Play. Offering is not accepting, and nothing locks on one player's tap.
4. Once both have confirmed, both stakes are locked via escrow and a **new match** begins with a new match id. The finished match is not reopened or extended.
5. There is no listing and no room code. A rematch is not discoverable by anyone else.

**Available from any match, regardless of how it started.** A Random Play opponent can be rematched just like a friend. Making rematch conditional on the original discovery mode would be exactly the downstream branch this rule forbids — see *Rules Locked* below.

**Not offered when the opponent is gone.** A match that ended through `forfeitPlayer()` has a player who is no longer connected; there is nobody to confirm, so no rematch is offered.

**Why both confirm, rather than the loser challenging.** The same reason Friends Play has a ready-up: nothing locks until both players have agreed to stake again. A player who is finished should be able to walk away without their funds being touched, and one tap from an opponent must never be able to commit them.

### Multiplayer Extension

**For multiplayer games (3+ players), both Random Play and Friends Play require ALL chosen player slots to be filled before the match can start — no early start with a partial lobby.** This applies in addition to the 1v1 behavior described above; it does not replace it.

1. The host still picks Random Play or Friends Play, and still sets the seat count (however that game defines it — e.g. Ludo's 2/3/4) at creation, same as any other setting.
2. A Random Play lobby is listed publicly the same way, but stays open and unstarted until every chosen seat is filled — there is no "start anyway" option for the host.
3. A Friends Play room code works the same way, except the match does not begin once two people confirm — it waits for every seat to be confirmed.
4. Locking still follows the reservation model above: each seated player's stake is reserved on joining and converts to an escrow lock via `lockBalance()` only once the lobby is full and the match actually starts.

**Why a full-lobby gate instead of starting with whoever showed up.** A multiplayer game's payout math (Rule 2's 70/30, or a documented exception like Ludo's) is defined for a specific seat count. Starting short would either strand an empty seat mid-match or force a live renegotiation of the payout split — the gate avoids both by deciding the seat count once, at creation, and holding the match until it's met.

**Added by Ludo's spec pass, generalised beyond it.** The extension is written game-agnostically because any future 3+ seat game hits the same gap; it is not Ludo-specific the way Rule 2's Exceptions entry is. See `Games/G02-Ludo.md` for the game that surfaced it.

---

## Reference

**Rules at a glance**
| Rule | Setting | Value | Enforced in |
|---|---|---|---|
| 1 | Platform fee (pooled) | 5% off the total pot | `settleMatch` |
| 1 | Platform fee (solo-vs-house) | 5% baked into the odds table, no separate deduction | that game's odds table |
| 1 | Fee on refund | None, ever | `refundMatch` |
| 2 | 1v1 payout | Winner takes the whole post-fee pot | `settleMatch` weights |
| 2 | Multiplayer payout | Top 2 only — 70/30, fixed at any lobby size | `settleMatch` weights |
| 2 | Tie for a paid place | That place's share split evenly | `settleMatch` weights |
| 2 | Payout mode | Locked at match start by game type, never by live lobby size | game module |
| 2 | Exceptions | Documented per-game overrides only — e.g. Ludo/Trumpcard's seat-count-scaled split | Rule 2's Exceptions |
| 3 | Bet mode | Fixed or Free, host's choice per match | `lockBalance` validation |
| 3 | Max bet | The player's own `availableBalance`, both modes | `lockBalance` |
| 3 | Min bet | Free Bet 1v1 only — host-set floor every joiner must meet | `lockBalance` |
| 4 | Discovery mode | Random, Friends or Rematch — host's choice per match | not yet enforced |
| 4 | Stake before lock | Reserved (unspendable, not in escrow) until both confirm | not yet enforced |
| 4 | Scope | 1v1 games, plus the multiplayer full-lobby gate below | — |
| 4 | Multiplayer extension | Random/Friends Play require every chosen seat filled before start | not yet enforced |
| 4 | Random Play join | Public listing, instant, first-come-first-served, no host approval | not yet enforced |
| 4 | Friends Play join | Room code, then **both** players confirm before anything locks | not yet enforced |
| 4 | Rematch | Same two players, settings carried over, **both** confirm; new match id | not yet enforced |
| 4 | After the match starts | Identical in both modes — Rules 1-3 apply unchanged | `03-Escrow.md` |

**Rules Locked**
- Fee rate is defined **here and only here**. `03-Escrow.md` describes how the fee is applied, not what it is.
- A game module never implements a fee or a payout split — it reports a finishing order and lets `settleMatch` apply these rules, **unless** it has a documented exception in Rule 2's Exceptions subsection. An exception still lives here, never as a second source of truth in the game's own doc — the game doc links to it instead of restating the numbers.
- **Rule 2 permits documented exceptions; no other rule does yet.** Ludo's scaling payout is the only one on record. A future game proposing its own split must be added to Rule 2's Exceptions the same way, not carved out silently.
- **Discovery mode never affects money.** Random Play, Friends Play and Rematch produce the same match: same fee, same payout split, same bet mode, same escrow calls. Nothing downstream of match start may branch on how the two players found each other, and no game may offer a discount, a different fee or a different split for one of them.
- **Rematch is offered on every match, however it started.** Gating it on the original discovery mode would make the game branch on how two players met, which is the one thing this rule forbids downstream of match start.
- **A game module never implements its own lobby.** Random Play's listing, Friends Play's room codes and the rematch handshake belong to the hub, for the same reason the fee does — one source of truth, and a player learns one way of starting a match rather than one per game.

## Open Questions
- **The Free Bet 1v1 minimum stake is only half a fix.** The host-set floor now blocks the worst case, but three things about it are undecided. **(a) Is it mandatory?** A host who leaves it at zero is exactly as exposed as before, so an optional floor protects only the careful. **(b) What is the default?** Anything below the host's own stake leaves a live asymmetry — a floor of 8 against a host stake of 10 still pays the joiner to stake 8. **(c) Nothing caps the other direction.** A joiner who stakes *more* than the host is the one being exploited, and a floor cannot help them; only a band around the host's stake, or matching the lower stake, closes both sides. Surfaced by `Games/G01-Coin-Flip.md`, the first 1v1 game.
- **The reserved-stake state has no schema and no lifecycle.** The rule above closes the confirm-time lock failure, but nothing implements it. A third balance field is needed alongside `availableBalance` and `lockedBalance` in `03-Escrow.md`; `lockBalance()` must treat reserved funds as unavailable; withdrawals in `02-Deposit-Withdraw.md` must respect it; and — the sharp edge — **a reserve with no expiry is a fund leak**. A room code that is never redeemed, or a rematch offer nobody answers, would fence a player's money off indefinitely, which is a worse outcome than the failure it prevents. Reserve expiry is therefore the same question as the confirm-step timeout below, and neither can ship without the other. What the UI shows for reserved funds is also unspecified.
- **Rule 3 has no schema behind it yet.** The shipped `Match` model has no `betMode` or `fixedBetAmount` column, so Fixed vs Free is currently unenforceable at the database level — every match behaves as Free Bet. Both fields need adding to `Match` (and the fixed amount validated inside `lockBalance`) before the first multiplayer game with a lobby ships. Tracked in `03-Escrow.md`'s implementation plan.
- **Rule 2 has no schema behind it yet either.** Nothing on `Match` records whether a game is 1v1 or multiplayer, so "locked in at match start" is currently a convention the game module upholds rather than something the database enforces. Ludo's exception makes this sharper: nothing on `Match` records seat count either, so the scaled split (1/2/3 paid places for 2/3/4 seats) is also convention, not something `settleMatch` can validate against.
- **The multiplayer lobby-fill extension says nothing about a partially-filled lobby's state.** What a Random Play listing shows while only 2 of 4 Ludo seats are taken, whether a seated player can leave before the lobby fills, and whether that early seat's reservation needs the same expiry treatment as the confirm-step and reserved-stake questions above, are all unanswered. The extension only says the match cannot *start* until full — it does not describe the waiting period itself.
- **Rematch's schema is unresolved along with the rest of Rule 4.** A rematch links two matches — the finished one and its successor — and nothing on `Match` records that relationship, so a rematch chain cannot currently be reconstructed or displayed.
- **Rule 4 has no schema and no lifecycle behind it at all.** The shipped `Match` model has no discovery mode, no room code, no host, and no record of who has confirmed; `MatchStatus` is only `open | settled | refunded`, with no state for "published and waiting for an opponent" or "code redeemed, awaiting both confirmations". A room code also needs a unique index, and — like `username` and `referralCode` — the nullable-unique trick, since a Random Play match has no code. All of this needs adding before the first 1v1 game ships.
- **A waiting lobby collides with doc 03's crash rule.** `recoverOpenMatches()` refunds *any* match still `open` at boot, on the reasoning that it belonged to a process that died holding player funds. A Random Play listing or an unredeemed room code would be `open` too, so every backend restart would silently destroy every waiting lobby. Harmless for money — nothing is locked until both players are in, which is exactly why Rule 4 defers locking — but the lobby states must be distinguishable from `open` before that recovery pass can stay correct.
- **Nothing about room codes is decided.** Length, alphabet, whether they are case-insensitive, whether they expire, and whether a code is freed for reuse once its match settles are all open. The `referralCode` generator in `backend/src/referral/referralCode.ts` is the nearest existing precedent and is probably where this should start rather than a second scheme.
- **Neither confirm step has a timeout — Friends Play's or Rematch's.** *(Now load-bearing: with stakes reserved at creation, a confirm step that never times out fences money off indefinitely — see the reserved-stake question above.)* If one player readies up and the other never does, the match sits there forever holding a room code and a seat; a rematch offer left hanging does the same without even a code to expire. Whether that expires on a timer, on the host cancelling, or not at all is undecided — and it is the only place in either flow where a player can be left waiting on someone else's action.
- **Nothing decides what a public listing shows.** Random Play makes a match "visible to any player browsing that game", but which fields appear on that listing — and specifically whether the host is identified, and by what — is unspecified. Doc 11 already locked that a full wallet address is never a public handle, so the answer has to come from `userHandle()`, not from the address.
- **Rate limiting is unaddressed.** Nothing stops one account publishing hundreds of Random Play listings, or brute-forcing room codes. The code alphabet and length chosen above directly determine how bad the second one is.

## Related Docs
- `03-Escrow.md` — the four functions that execute these rules
- `04-Games-Index.md` — which games exist and which payout mode each uses
- `06-Landing-Dashboard-Structure.md` — where a Random Play listing and the Create/Join screens would live in the dashboard
- `09-Referral-Program.md` — the referral commission, funded by the house *on top of* Rule 1's fee, never skimmed from it
- `00-Overview.md` — project overview and reading order

## Last Updated
2026-08-25 — **Rule 2's Ludo exception extended to also name Trumpcard.** Trumpcard's spec pass (`Games/G04-Trumpcard.md`) reuses the identical seat-count-scaled split Ludo already documented, so the Exceptions entry now covers both games instead of a second entry duplicating the same table. No new shared-rule text was needed — Rule 4's multiplayer extension already generalised past Ludo and covers Trumpcard's lobby-fill gate as-is.
2026-08-24 — **Rule 2 gained a documented exception path**, with Ludo's seat-count-scaled payout (1/2/3 paid places for 2/3/4 seats) as its first and only entry. A game may now override the fixed top-2/70-30 split only by being listed here — never silently in its own doc.
2026-08-24 — **Rule 4 gained a multiplayer extension**: Random Play and Friends Play now require every chosen seat filled before a 3+ player match can start, in addition to the existing 1v1 behavior. Generalised beyond the game that surfaced it (Ludo), since any future multiplayer game hits the same gap. Left open: what a partially-filled lobby looks like while it waits.
2026-08-19 — **Rule 4 amended: stakes are reserved at match creation**, not left free until confirm — so the confirm-time lock can no longer fail. Needs a third balance state in `03-Escrow.md`, and makes confirm-step expiry mandatory rather than optional.
2026-08-19 — **Rule 3 amended: minimum stake for Free Bet 1v1 matches**, host-set and enforced in `lockBalance`. Partial by design — it bounds the lowball exploit without making Free Bet 1v1 symmetric; the residual holes are tracked in Open Questions.
2026-08-19 — **Rule 4 amended: Rematch added as a third discovery path.** Same two players, settings carried over, both confirm, new match id — offered from any match regardless of how it started. Surfaced by the Coin Flip result screen, which had nowhere to send a rematch button.
2026-08-19 — Two open questions added from the first 1v1 game's review: Free Bet Mode's stake asymmetry under Rule 2's winner-take-all, and a Friends Play lock failing at confirm time.
2026-08-19 — Rule 4 added: match discovery, Random Play vs Friends Play, 1v1 only. The first rule in this file that governs the lobby rather than the money.
2026-08-18 — Initial version. Rules 1–3 written; Rule 1's fee definition moved here from `03-Escrow.md` so there is one source of truth.
