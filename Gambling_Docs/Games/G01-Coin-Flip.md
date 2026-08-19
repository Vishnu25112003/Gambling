# Game 01: Coin Flip

## Identity
| Field | Value |
|---|---|
| **Game No.** | `01` |
| **Game ID** | `coin-flip` |
| **Doc file** | `Games/G01-Coin-Flip.md` |
| **Fee Mode** | `Pooled` — two players bet against each other into one pot (Rule 1) |
| **Players** | `1v1` — winner-take-all, never the multiplayer 70/30 split (Rule 2) |
| **Discovery** | `Random + Friends + Rematch` — all three Rule 4 modes, unmodified |

## One-Line Summary
A 1v1 coin-flip prediction game — one player spins, the other calls Head or Tail under a countdown, across multiple rounds, with the round-winner spinning next.

## Overview
Two players face off over a set number of rounds. Each round, one player spins a coin while the other tries to correctly call which side it lands on. Get it right, you win the round. The player who wins more rounds overall wins the match — and if the scheduled rounds end level, one **sudden-death round** decides it, so a match never ends without a winner.

The only decision a player makes is Head or Tail under a 10-second clock; everything else — who spins first, what the coin lands on — is decided by a commitment the server publishes before either player can act, and by the previous round's result. **Nothing random in this game is unverifiable**, the Round 1 seat draw included. Bet amount and round count are set once at match creation, not per round.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 0% — designed, not yet coded
- **Contract Status:** Off-chain only — no smart contract, uses the shared escrow layer
- **Inherits:** Rules 1–4 of `../10-Game-Common-Rules.md` — this file redefines none of them

## How It Works (Flow)

### Match Setup

Coin Flip adds exactly two settings of its own — round count and the coin itself. Everything else in setup is inherited:

| Step | Setting | Owned by |
|---|---|---|
| 1 | Host opens Coin Flip | this game |
| 2 | **Random Play** or **Friends Play** | Rule 4 |
| 3 | **Number of rounds** — odd only, picked from 3 / 5 / 7 / 9 / 11 / 13 / 15 | **this game** |
| 4 | **Fixed Bet** or **Free Bet** mode | Rule 3 |
| 5 | **Bet amount** — set once for the whole match, never per round | Rule 3 |
| 6 | **Minimum stake** — Free Bet only; the floor a joiner must meet | Rule 3 |

Then the match is created, and how it starts depends on the Rule 4 mode the host picked:

- **Random Play** — the match is listed publicly. The first player to join takes the seat instantly; there is no host approval and no ready-up. Both stakes lock via `lockBalance()` on join, and Round 1 begins.
- **Friends Play** — a room code is generated and the match is not listed. The friend enters the code, then **both players confirm** before anything locks. Only after both confirmations do the stakes lock and Round 1 begin.
- **Rematch** — started from a finished match's result screen, carrying its settings over unchanged. Both players confirm, then stakes lock and a new match begins. Not offered when the opponent has already gone (a `forfeitPlayer()` ending).

In all three modes the stake is **reserved** from the moment the match is created or the rematch offered, and converts to an escrow lock when both sides confirm — so the lock cannot fail for want of balance. Reserving, releasing and converting are Rule 4's job, not this game's.

Nothing below this point differs between the two modes — see Rule 4's "This rule governs only how two players find each other."

### Each Round
1. **Round 1 only:** the seats are assigned by a **committed draw** — before the match starts the server commits to `hash(seed ‖ seats)` and sends it to both clients, then reveals the seed and the assignment. Verified with the same check as a coin result, so no draw in this game is taken on trust.
2. **Round 2 onward:** the **winner of the previous round becomes the spinner**; the loser becomes the caller
3. **Provably-fair commit:** the server generates this round's result and commits to it (hashed) before the spinner even acts — proof the result cannot be changed later. This happens invisibly in the background.
4. Spinner has **10 seconds** to initiate the spin
   - No spin within 10 sec → **round auto-forfeited to the opponent (caller)**
5. Once the spin starts, the coin animation plays continuously on both screens
6. Caller has **10 seconds** to call **Head or Tail**
   - No call within 10 sec → **round auto-forfeited to the spinner**
7. Once the caller calls (or the 10 sec expires), the server **reveals** the committed result — the reveal can be checked against the earlier commitment to prove it was not changed
8. The coin animation gradually slows and stops on the revealed result, shown on both screens
9. **Round winner:**
   - Caller's call matches the result → **caller wins the round**
   - Caller's call does not match → **spinner wins the round**
10. **Check whether the match is already decided** (below). If it is, go straight to Match End. Otherwise move to the next round, with this round's winner now spinning. Under the odd-only round rule a winner is always found before the rounds run out.

### Round Count

The host picks the round count from a **fixed set of odd values: 3, 5, 7, 9, 11, 13, 15.** It is a preset picker, not a free number field.

- **Odd only.** Round wins across an odd number of rounds sum to an odd number, so the two players can never finish level. Every match produces an outright winner from the scheduled rounds alone.
- **Minimum 3.** A 1-round match is a single flip with no comeback, which is a coin toss rather than a game.
- **Maximum 15.** The clinch rule keeps even the longest match short in practice — a 15-round match is decided by round 8 at the earliest and rarely runs long.

### Winning Early (best-of-N)

**The match ends the moment the score becomes unreachable** — it does not play out rounds that cannot change the result. A 5-round match won 3–0 stops at round 3; rounds 4 and 5 are never played.

- **Clinch threshold:** `floor(rounds / 2) + 1` round wins. The first player to reach it wins the match immediately.
- Checked after every round, including forfeited ones — a round won on a timeout counts toward the threshold like any other.
- **Someone always clinches.** Because the round count is odd, one player always reaches the threshold — a match cannot exhaust its scheduled rounds without a winner.

| Rounds | Clinch at | Shortest possible match | Can end level? |
|---|---|---|---|
| 3 | 2 wins | 2 rounds | No |
| 5 | 3 wins | 3 rounds | No |
| 7 | 4 wins | 4 rounds | No |
| 9 | 5 wins | 5 rounds | No |
| 11 | 6 wins | 6 rounds | No |
| 13 | 7 wins | 7 rounds | No |
| 15 | 8 wins | 8 rounds | No |

The round count the host picked is still shown throughout; a match that ends early is displayed as won at its clinching round, not as an incomplete match.

### Sudden Death

> **⚠ Unreachable under the current round rule.** Odd round counts cannot end level, so this never fires today. It is retained as the specified behaviour should even round counts ever be allowed — do not build it until they are, and do not delete it if the round rule is revisited.

**A level score would not end the match — it would trigger one sudden-death round.**

1. If all scheduled rounds are played and neither player reached the clinch threshold — a level score, only possible on an even round count — the match continues into a **sudden-death round**
2. It is played exactly like any other round — same commit-reveal, same two 10-second timers, same forfeit-on-timeout behaviour
3. **Spinner:** the winner of the last scheduled round spins, following the normal "winner of the previous round spins" rule with no exception
4. Whoever wins the sudden-death round **wins the match**
5. **One sudden-death round is always enough.** Every Coin Flip round produces a winner — the caller either matches the result or does not, and a timeout forfeits the round to the opponent. There is no drawn round, so sudden death can never itself end level and never needs repeating.
6. The pot does not change. No additional stake is locked for sudden death — it is an extra round of the same match, not a new one.

Both players are shown that the match has gone to sudden death before the spin timer starts.

### Disconnects During a Round

**Action timers never pause.** A disconnect does not stop the 10-second spin timer or the 10-second call timer — they run to completion and resolve the round exactly as they would for a connected player who simply did not act. The two clocks run **in parallel**, and they answer different questions:

| Clock | Owned by | Decides |
|---|---|---|
| 10-sec spin / 10-sec call | this game | who wins the **current round** |
| 15-sec reconnect grace | `../03-Escrow.md` | whether the **match** is forfeited |

1. A player who disconnects mid-timer **loses that round on the timeout**, like any other non-action
2. The match continues into the next round while they are gone, and they lose those rounds too — an absent player never acts
3. If they reconnect inside the 15-second grace period, they resume the match **with those round losses standing**. Rounds lost while disconnected are not replayed or refunded.
4. If the grace period expires with them still gone, escrow's `forfeitPlayer()` confiscates their locked stake **into the pot** — it does not end the match or pay anyone. This game must then still call `settleMatch(matchId, [present player], [1])` to name the winner and release the pot. A forfeit is two steps, not one.

**The opponent never waits.** That is the point of this choice: a stalled or vanished player cannot freeze the board, and the connected player keeps playing at full speed.

**On reconnect, the client is given the full state plus what it missed.** A returning player is dropped straight back into the live match — not held at a boundary — and is told explicitly what happened while they were away:

| Sent on rejoin | Contents |
|---|---|
| Live board | Score, round number out of total, whose seat is whose, and the **remaining time** on any timer currently running |
| Missed-round log | Every round resolved during the absence, in order, each with its result and *why* it went that way (no spin, no call, wrong call) |
| Match-over state | If the match settled while they were gone, the result screen instead of the board |

The player therefore never sees the score jump without explanation. Two consequences are accepted rather than designed around:

- **A rejoin can land mid-timer with very little left.** If 1.2 seconds remain on the call timer, that is what they get — the timer is not extended or restarted for a returning player, since that would hand a disconnect a real advantage.
- **This is served by the per-round record** described below under *The Round Record* — one write per round covers reconnect catch-up, match history and fairness verification alike.

**Which clock fires first depends on how close the match is.** A round takes up to 20 seconds against a 15-second grace period, so an absent player usually loses **one round, sometimes two**, before the grace expires and `forfeitPlayer()` ends the match. The exception is a match already on the brink: in a 3-round match at 0–1, the disconnecting player loses round 2 on the spin timer at t≈10s, the opponent clinches at 2 wins, and `settleMatch()` fires at t≈10s — five seconds before the grace period would have. The player reconnects to a match already settled and lost.

So both endings are live, and which one applies is a property of the score, not of the disconnect:

| Situation | Ends via | When |
|---|---|---|
| Opponent is one round from clinching | `settleMatch()` — normal loss | as soon as that round resolves, ≤ 20s |
| Anything else | `forfeitPlayer()` confiscates the stake, then this game calls `settleMatch()` | at the 15-second grace expiry |

### Match End
1. The match ends as soon as one player reaches the clinch threshold. Under the odd-only round rule that always happens within the scheduled rounds, so whoever won **more rounds total** wins the match
2. **There is no tied match outcome.** Sudden death removes it in normal play, so Coin Flip always settles with exactly one winner
3. **Payout:** Rule 1's fee applies to the pot first, then Rule 2's 1v1 winner-take-all rule. This game supplies only the finishing order:

| Outcome | Call |
|---|---|
| Outright winner | `settleMatch(matchId, [winner], [1])` |
| Sudden-death winner | `settleMatch(matchId, [winner], [1])` — identical. Unreachable today; listed because sudden death would change who wins, never how the pot is split. |
| Tie | Not reachable — twice over: odd round counts cannot end level, and sudden death would resolve it if they could. Rule 2's tie-split (`[a, b], [1, 1]`) stays available in escrow but Coin Flip never calls it. |

4. **A forfeit ending still settles normally.** `forfeitPlayer()` only moves the absent player's stake into the pot; the game then calls `settleMatch(matchId, [present player], [1])` exactly as for any other win. Rule 1's 5% still applies to the pot — including the forfeited stake — so the result screen's payout breakdown is the same shape as a played-out win. It never falls back to a tie-split.
5. **Result screen** — the match, not a leaderboard. A 1v1 match has no standings to rank, so it shows:
   - Who won, the final score, and the payout broken down (stake, pot, 5% fee, net)
   - **Every round listed** in order: which seat the player held, what was called, what the coin was, and how the round resolved — including rounds lost to a timeout or to a disconnect
   - A verify affordance on each round, opening that round's entry in the round record
   - A **rematch** offer to both players — Rule 4's third discovery path, not a Coin Flip feature: same settings, both confirm, fresh locks, new match id. Suppressed if the match ended by forfeit, since the opponent is gone.
   - It is the per-round record rendered, so it costs no extra storage or bookkeeping
6. Both players' profiles updated: win history, loss history, earnings history

### The Round Record (provable fairness)

Every round writes a permanent server-side record. It is the single source behind three things: the reconnect catch-up log, the result screen's history, and after-the-fact verification.

| Field | Purpose |
|---|---|
| `commitHash` | The `hash(seed ‖ value)` published **before** the round's action |
| `seed` | Revealed after the action completes — written only at reveal time |
| `result` | Heads or tails (or, for the match's opening record, the seat assignment) |
| `call` | What the caller called, or null on a timeout |
| `cause` | How the round resolved: correct call, wrong call, no spin, no call |
| `seats` | Who spun and who called |

- **Kept indefinitely.** A player can open any past match and check any round.
- **A verify view recomputes the hash in front of the player** — it shows the commitment, the revealed seed, and the recomputed hash side by side rather than asserting a checkmark.
- **The seed is written only at reveal.** It must never be readable, through any endpoint or log, while the round is still live — a leaked seed is a solved round.
- The Round 1 seat draw gets a record of the same shape, since it is committed and revealed the same way.

## Where This Lives
```
backend/src/games/coin-flip/
├── index.ts        # default-exports the GameModule
├── manifest.ts     # id: 'coin-flip', mode: 'pooled', 2 players, status
├── engine.ts       # pure rules — commit/reveal, round winner, match tally (no I/O)
└── socket.ts       # realtime: spin timer, call timer, reveal broadcast
frontend/src/games/coin-flip/
├── CoinFlipSetup.tsx    # host setup — rounds, bet mode, amount
├── CoinFlipBoard.tsx    # spin animation, countdown timers, Head/Tail picker
└── CoinFlipResult.tsx   # result screen: score, payout, round-by-round + verify
```
Registered with one line in `backend/src/games/registry.ts`.
See `backend/src/games/README.md` for the hard rule: a game gets money behaviour **only** from the escrow adapter — it never imports `User`, `LedgerEntry`, `Match` or `treasury`.

## Implementation Plan (TODO)

```
[ ] Build match setup flow
    - Round count picker — odd values only: 3, 5, 7, 9, 11, 13, 15
      (reject anything else server-side; it is not a free number field)
    - Bet mode selector (reuses the shared Rule 3 component)
    - Bet amount input, validated against availableBalance
    - Minimum-stake field in Free Bet mode (Rule 3) — reuses the shared
      component; this game neither defines nor enforces the floor
    - Discovery is NOT built here — Random/Friends Play is hub-level (Rule 4).
      This game only consumes whatever match the lobby hands it.
    - Locking is triggered by the lobby: on join (Random) or on the second
      confirmation (Friends/Rematch). Stakes are reserved before that point
      (Rule 4), so the lock cannot fail for insufficient balance — this game
      neither reserves, releases nor locks anything itself.

[ ] Build provably-fair commit-reveal
    - Covers TWO draws: the Round 1 seat assignment, and every coin result
    - Round 1 seats: commit hash(seed ‖ seats) before the match starts, reveal
      the seed and assignment as the match opens — same verification path as a
      coin result, so no draw is server-asserted
    - Coin result: server generates result + random seed, hashes it, sends the
      hash to both clients BEFORE the spin starts
    - After the round's action completes (call made or timeout), server reveals
      the seed
    - A shared verification util confirms hash(seed ‖ value) matches the
      commitment — used by the client live AND by the after-the-fact verifier

[ ] Build the round record + verifier
    - Persist commitHash, seed, result, call, cause and seats per round,
      indefinitely — same record the reconnect catch-up log reads from
    - Write the seed ONLY at reveal time; it must not be reachable through any
      endpoint or log while the round is live
    - Verify view recomputes the hash in front of the player and shows the
      inputs, rather than just asserting a pass
    - The Round 1 seat draw gets a record of the same shape

[ ] Build spin-initiation timer (10 sec)
    - Starts the moment a player is assigned as spinner
    - No spin action within 10 sec → auto-forfeit round to the caller
    - Same duration as the call timer, deliberately — the two seats must stay
      symmetric (see Reference)
    - Never pauses, not even on disconnect — a disconnected spinner loses the
      round on this timer exactly like a connected one who does not act
    - Runs in parallel with escrow's 15-sec grace period, which is checked
      independently and decides only whether the match is forfeited

[ ] Build call timer (10 sec)
    - Starts once the spin animation begins
    - No Head/Tail call within 10 sec → auto-forfeit round to the spinner

[ ] Build reconnect handling
    - On rejoin, send the full live board: score, round n of N, seats, and the
      REMAINING time on any running timer (never restarted, never extended)
    - Send the missed-round log: every round resolved during the absence, in
      order, with result and cause (no spin / no call / wrong call)
    - If the match settled while they were away, send the result screen instead
    - UI shows a catch-up notice before returning control to the player
    - Reads the per-round record (see "Build the round record + verifier") —
      one record serves both reconnect catch-up and fairness verification

[ ] Handle disconnects without pausing the match
    - Action timers keep running through a disconnect; rounds resolve on
      timeout and the match advances while the player is absent
    - Round losses incurred while disconnected stand on reconnect — never
      replayed, never refunded
    - Check the clinch threshold as normal: a match may settle via
      settleMatch() before the 15-sec grace period expires, in which case
      forfeitPlayer() never fires
    - If the grace period expires with the match still live: call
      forfeitPlayer() to confiscate the absent player's stake into the pot,
      THEN settleMatch([present player], [1]) to actually end and pay it.
      forfeitPlayer alone ends nothing — a match left there never settles.

[ ] Build round resolution logic
    - Compare the caller's call to the revealed result
    - Match → caller wins the round; no match → spinner wins the round
    - Record the round result, increment that player's round-win count
    - Next round's spinner = this round's winner

[ ] Build match resolution logic
    - Clinch threshold = floor(rounds / 2) + 1
    - Check after EVERY round, forfeited rounds included: a player who reaches
      the threshold wins immediately and the remaining rounds are not played
    - With odd round counts a player always reaches the threshold; treat
      "all rounds played, nobody clinched" as an invariant violation, not as
      a path to sudden death (see the DO NOT BUILD item below)
    - Call settleMatch() with the finishing order only — the payout maths lives
      in escrow under Rules 1 and 2

[ ] DO NOT BUILD — sudden-death round
    - Unreachable under the odd-only round rule: no match can end level.
      Kept as spec only, in case even round counts are ever allowed. If they
      are, this becomes a real task; until then it must not be implemented.
    - Triggered only when the scheduled rounds end level
    - Reuses the round engine unchanged: same commit-reveal, same two 10-sec
      timers, same forfeit-on-timeout rules
    - Spinner = winner of the last scheduled round (normal rule, no exception)
    - Locks no additional stake — same match, same pot
    - Terminates in exactly one round; assert this rather than looping, since a
      Coin Flip round cannot be drawn
    - UI announces sudden death to both players before the spin timer starts

[ ] Build the result screen
    - Winner, final score, payout broken down (stake, pot, 5% fee, net)
    - Round-by-round list from the round record: seat, call, coin, cause
    - Per-round verify link into the fairness verifier
    - No "leaderboard" — a 1v1 match has nothing to rank
    - Rematch button wires to the hub's Rule 4 rematch handshake; this game
      does not implement the handshake, the settings carry-over or the locks

[ ] Build profile history + hub leaderboard update
    - After settleMatch(), update both players' win/loss/earnings history
    - Update the relevant hub-wide leaderboard entries (doc 11 owns these)
```

## Reference

**Game-specific timers**
| Timer | Duration | On Timeout |
|---|---|---|
| Spin initiation | 10 seconds | Auto-forfeit round to caller |
| Head/Tail call | 10 seconds | Auto-forfeit round to spinner |

**The two seats are deliberately symmetric.** Both clocks are 10 seconds, both forfeit the round on timeout, and both sides win on a 50/50 draw — so the spinner seat carries no advantage or penalty, and being handed it for winning the previous round costs a player nothing. This was not always true: the spin timer was 5 seconds against the caller's 10, which quietly punished the round winner by moving them into the tighter clock. Any future change to one timer must change the other.

A full round therefore runs up to **20 seconds** (10 to spin, 10 to call). Both timers apply unchanged in the sudden-death round, where stalling loses the match rather than a round.

**Escrow / Rules tie-in**
- Uses the standard `lockBalance()`, `settleMatch()`, `refundMatch()`, `forfeitPlayer()` from `../03-Escrow.md` — no custom money logic in this game
- **`forfeitPlayer()` is not an ending.** It confiscates a disconnected player's stake into the pot and nothing more; every match, forfeit or not, is ended and paid by `settleMatch()`. A game that calls only `forfeitPlayer()` leaves the match unsettled and the pot stranded.
- **Rule 1** — 5% pooled fee, taken off the pot by `settleMatch`. This game never computes it.
- **Rule 2** — 1v1 winner-take-all. The tie-split branch is never used: odd round counts guarantee a single winner.
- **Rule 3** — Fixed vs Free bet mode, host's choice, one amount for the whole match. In Free Bet the host also sets a minimum stake, enforced by `lockBalance()`, not by this game.
- **Rule 4** — Random / Friends / Rematch discovery, all hub-owned; this game builds no lobby and no rematch handshake of its own
- The escrow-level 15-second grace period and this game's two 10-second action timers **run in parallel and are never reconciled** — see *Disconnects During a Round*. The action timers decide rounds and never pause for a disconnect; the grace period decides only whether the match itself is forfeited — and it usually fires first, since a round can take 20 seconds against a 15-second grace.

## Open Questions

Twelve questions are **closed**: the confirm-time lock failure (stakes are reserved at creation under Rule 4), rematch (added to Rule 4 as a third discovery path, hub-owned), the result screen (round-by-round breakdown, not a leaderboard), the fairness audit trail (a permanent per-round record plus an in-app verifier), seat symmetry (both timers are now 10 seconds), the Round 1 seat draw (committed and revealed like any coin result), the round count (odd only, 3–15 from a preset picker), the even-round-count tie (odd-only counts remove it at the source, with sudden death retained as unreachable spec), dead-rubber rounds (the match ends early at the clinch threshold), the mid-timer disconnect (both clocks run, the action timer never pauses), reconnect state (full board plus a missed-round log), and "Random Play vs Friends Play mechanics unconfirmed" (Rule 4 specifies both in full). What follows is genuinely undecided and needs answering before this game is coded.

### Owned by this game

**None from the original audit** — all nine were answered and written into the sections above. Two small ones opened up *because* of those answers and are listed under Inherited below, since both need a decision made elsewhere first.

### Inherited — waiting on the shared rules

Coin Flip is the first 1v1 game, so gaps in `../10-Game-Common-Rules.md` surface here first. These are logged in that file's Open Questions and fixed there, not here — but they gate this game, because it cannot ship until the rules it inherits are enforceable.

- **Rule 4 has no schema, no lifecycle, and now no reserved-balance field.** Everything this game's setup depends on — discovery mode, room codes, host, confirmations, and the newly-added stake reservation — is convention rather than something the database enforces. Doc 10 tracks it; nothing here works until it exists.
- **Neither confirm step has an expiry.** With stakes now reserved at creation, an unanswered rematch offer or an unredeemed room code fences a player's funds off indefinitely. This game surfaces rematch offers, so it is directly exposed.
- **Can a rematch be offered to a player who cannot cover the stake?** Rule 4 reserves the stake when a rematch is offered, but a player who just lost may no longer have it — and that is exactly when rematch is most likely to be tapped. Whether the button is hidden, shown-and-refused, or offered with a top-up prompt is unspecified. Doc 10 owns the reserve; this game owns the button.
- **How the round record is reached from Game History.** The surface exists — `06-Landing-Dashboard-Structure.md` already specifies a Transaction/Game History dashboard section — but it was written before any game had per-round records or a fairness verifier, so it has no notion of drilling from a match row into its rounds. What that navigation looks like is undecided; the place to put it is not.
- **Free Bet 1v1 is now bounded, not fixed.** Rule 3 gained a host-set minimum stake, which blocks the worst lowball — but a coin toss is exactly the game where the residual asymmetry pays: anything between the floor and the host's stake still favours the lower staker, and a joiner who overstakes is exploited in the other direction with no protection at all. Tracked in doc 10; Coin Flip inherits whatever lands.

## Related Docs
- `../04-Games-Index.md` — master game list and status
- `../10-Game-Common-Rules.md` — Rules 1–4, inherited by this game
- `../03-Escrow.md` — the functions this game calls instead of touching balances

## Last Updated
2026-08-19 — **Corrected: `forfeitPlayer()` does not end a match.** It confiscates the absent player's stake into the pot; `settleMatch()` still has to be called to name the winner and pay. Four places in this file said or implied otherwise.
2026-08-19 — **Stake reservation added upstream** (Rule 4): stakes are fenced off at match creation, so the confirm-step lock can no longer fail. Nothing changes in this game beyond who triggers the lock.
2026-08-19 — **Free Bet minimum stake added upstream** (Rule 3), with a min-stake field in this game's setup. Bounds the 1v1 lowball exploit without closing it.
2026-08-19 — **Rematch resolved upstream.** Rule 4 gained a third discovery path (same players, settings carried over, both confirm, new match id); this game only wires a button to it.
2026-08-19 — **Result screen specified** — score, payout breakdown and a round-by-round list with per-round verify links, replacing the meaningless "match leaderboard". Surfaced a new open question: rematch has no Rule 4 path.
2026-08-19 — **Round record specified.** Commit, seed, result, call, cause and seats are persisted per round, indefinitely, with an in-app verifier that recomputes the hash. One record now serves reconnect catch-up, match history and fairness proof; the seed is written only at reveal.
2026-08-19 — **Spin timer raised 5s → 10s.** The seats are now symmetric; the old 5/10 split penalised the previous round's winner by moving them into the tighter clock. A round now runs up to 20s, so the disconnect analysis was redone — `forfeitPlayer()` is now the usual ending, with `settleMatch()` beating it only when the opponent is one round from clinching.
2026-08-19 — **Round 1 seat draw is now committed** — `hash(seed ‖ seats)` published before the match, revealed at the start. No random value in the game is unverifiable any more.
2026-08-19 — **Sudden Death retained as unreachable spec**, flagged DO NOT BUILD, in case even round counts are ever allowed.
2026-08-19 — **Round count bounded to odd values 3–15**, from a preset picker. A side effect: an odd count can never end level, so Sudden Death is now unreachable — its fate is pending.
2026-08-19 — **Reconnect behaviour decided.** A returning player gets the full live board plus a log of the rounds lost while they were away; timers are never extended for them. Implies a per-round server log, which the commit/reveal audit trail can share.
2026-08-19 — **Disconnect policy decided.** Action timers never pause; they and escrow's 15-sec grace period run in parallel. A disconnected player loses rounds in real time and keeps those losses on reconnect, and a short match can settle before the grace period expires.
2026-08-19 — **Best-of-N decided.** The match now ends the moment a player reaches `floor(rounds / 2) + 1` wins; dead-rubber rounds are never played. Sudden Death is now reachable only on an even round count where neither player clinched.
2026-08-19 — Open Questions re-audited. The previous "nothing is open here" was wrong: eight real gaps recorded — dead-rubber rounds, disconnect-during-timer, reconnect state, round-count bounds, the uncommitted Round 1 draw, seat asymmetry, commit/reveal persistence, and the undefined match leaderboard — plus two shared-rule gaps pushed to doc 10.
2026-08-19 — **Sudden death added.** A level score after the scheduled rounds now plays one extra round instead of splitting the pot; the tie outcome is gone and the even-round-count open question is closed with it.
2026-08-19 — Restructured onto the standard game template and numbered as Game 01. Match setup rewritten against Rule 4 (Random/Friends Play now specified, not an open question); broken `010-Game-Common-Rules.md` links fixed; file layout aligned with the real `backend/src/games/<id>/` convention; exact `settleMatch` calls added.
2026-08-15 — Initial version, written after the full Coin Flip flow discussion.
