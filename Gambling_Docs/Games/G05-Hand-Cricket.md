# Game 05: Hand Cricket

## Identity
| Field | Value |
|---|---|
| **Game No.** | `05` |
| **Game ID** | `hand-cricket` |
| **Doc file** | `Games/G05-Hand-Cricket.md` |
| **Fee Mode** | `Pooled` — two players bet against each other into one pot (Rule 1) |
| **Players** | `1v1` — winner-take-all, except a dual-unreachable edge case (Reference) where the platform keeps the pot instead |
| **Discovery** | `Random + Friends + Rematch` — all three Rule 4 modes, unmodified |

## One-Line Summary
A strictly 1v1 hand cricket game — simultaneous 1-6 number picks decide runs or outs across two innings, most total runs wins, ties settled by a Super Over.

## Overview
Classic hand cricket. Two players each get one innings at bat. Each ball, both the batter and bowler simultaneously pick a number 1-6 — if the numbers match, the batter is out and their innings ends immediately; otherwise, the batter's number is added to their score as runs. After both innings are complete, whoever scored more runs wins the match. A tied score is settled with a 6-ball Super Over.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 100% — implemented, pending manual end-to-end playtest (see Implementation Plan)
- **Contract Status:** Off-chain only — uses the shared escrow layer
- **Inherits:** Rules 1, 3 and 4 of `../10-Game-Common-Rules.md` unchanged — including the Free Bet 1v1 minimum-stake floor, which is exactly what this game needs given its strictly winner-take-all payout. **Overrides the generic disconnect rule** with its own 3-lives anti-stall system (see below) — the only redefinition this file makes.

## How It Works (Flow)

### Match Setup
Setup follows Rule 4's Random Play / Friends Play shapes exactly — only the parts specific to Hand Cricket are below:

1. Player enters Hand Cricket → sees already-hosted open lobbies, plus a **"Create New Game"** option.
2. Create → host chooses **Random Play** or **Friends Play** (Rule 4).
3. Host chooses **number of rounds** — this sets **balls per innings**: each player bats for that many balls (or until out, whichever comes first), then they swap.
4. Host chooses **Fixed Bet** or **Free Bet** mode (Rule 3) and sets the amount.
5. **Random Play:** hosted publicly, instant first-come-first-served join. **Friends Play:** room code generated + share option, both players ready-up.
6. Match starts → both players' bet amounts lock via `lockBalance()`.

### Gameplay
1. System **randomly picks who bats first**.
2. Each ball: **both players simultaneously pick a number 1-6** — batter and bowler both choose.
   - **Numbers match** → batter is **out**, their innings ends immediately (score locked at whatever they'd accumulated).
   - **Numbers don't match** → the batter's chosen number is added to their score as runs.
3. This repeats until either the batter is out, or the host-chosen number of balls (rounds) for that innings is used up.
4. **Roles swap** — the second player now bats for the same number of balls (or until out).
5. After both innings are complete, **total runs are compared**.

### Anti-Stall & Disconnects (overrides Rule 4's generic disconnect behavior, for this game only)
Separate from the cricket "out" mechanic — this is a stall/disconnect safeguard, not a scoring rule:
- Each player has **3 lives** for the whole match.
- Each ball, both players have **10 seconds** to pick their number.
- No pick within 10 seconds → counts as a **stall**, that player loses 1 life.
- **Disconnect-timeout:** disconnects and fails to reconnect within the standard 15-second escrow grace period also counts as 1 lost life — the same combined pattern as Mine Catcher and Trumpcard, so a single disconnect doesn't end the match outright.
- Losing all **3 lives** → the opponent wins the match by default, standard payout applies. `forfeitPlayer()` is called at this point, same as any other forfeit — the lives system only decides *when* that call fires.
- **Dual-unreachable edge case:** if the opponent is also unreachable at the moment a lives-based forfeit would trigger, the match does not default to the opponent (their presence can't be confirmed) and does not refund like a normal crash — **the platform keeps the pot instead**, the same edge case Mine Catcher documents and the same unresolved settlement mechanism (see Open Questions).

### Super Over (Tie-Breaker)
- If both innings end in an exact score tie, the match goes to a **Super Over** instead of splitting the pot.
- Each player bats for **6 balls** (1 full over), same rules as the main match: simultaneous 1-6 picks, matching numbers = out (innings ends early), otherwise runs added.
- Whoever scores more in the Super Over wins the match outright.
- **If the Super Over itself ties too** → pot is split evenly at that point (no further Super Overs).
- The same 3-lives anti-stall system and 10-second pick timer apply during the Super Over.

### Match End
1. Winner = whoever scored more total runs across both innings, or via the Super Over, or via the opponent running out of lives.
2. **Tie after both innings** → triggers a Super Over (see above).
3. **Payout:** Rule 1 (5% platform fee) + Rule 2's 1v1 winner-take-all branch — except the Super-Over-tie case (even split) and the dual-unreachable case (platform keeps the pot):

   | Outcome | Call |
   |---|---|
   | Higher total runs, or Super Over decides it | `settleMatch(matchId, [winner], [1])` |
   | Opponent out of lives | `settleMatch(matchId, [winner], [1])` — identical; the lives system only decides who counts as the winner |
   | Super Over also ties | Pot split evenly between both players — no further Super Overs |
   | Dual-unreachable at forfeit time | No `settleMatch()` winner call — platform retains the pot. Exact mechanism undecided, see Open Questions |

### Record & Result
- **Result screen** — a 1v1 match, so no leaderboard: winner, final run totals for both innings (and the Super Over, if played), payout breakdown (stake, pot, 5% fee, net).
- A **rematch** offer to both players — Rule 4's third discovery path: same settings, both confirm, fresh locks, new match id. Suppressed on a forfeit or dual-unreachable ending, since at least one opponent is gone.
- Both players' profiles updated: win/loss/earnings history.
- No provably-fair commitment scheme is specified for the bat-first pick or the simultaneous-number reveal — unlike Coin Flip, nothing here is currently claimed as independently verifiable. See Open Questions.

## Where This Lives
```
backend/src/games/hand-cricket/
├── index.ts        # default-exports the GameModule
├── manifest.ts     # id: 'hand-cricket', mode: 'pooled', 2 players, status
├── types.ts        # HandCricketState, InningsRecord, HC_EVENTS
├── engine.ts       # pure rules — ball resolution, innings swap, Super Over, lives (no I/O)
└── socket.ts       # realtime: simultaneous-pick timer, ball reveal, forfeit updates
frontend/src/games/hand-cricket/
├── handCricketSetupConfig.ts  # feeds the shared GameSetupWizard (balls per innings)
├── HandCricketBoard.tsx       # page-state-machine: lobby/create/waiting/live/result
├── HandCricketPickBoard.tsx   # number-pick UI, ball-by-ball reveal, score display, timer
└── HandCricketResult.tsx      # result screen: outcome, payout breakdown
```
As-built note: there is no separate `HandCricketSetup.tsx` — by the time this
game was built, Trumpcard's spec pass had already generalized the shared
`GameSetupWizard` to take a small per-game config object instead, and every
game (including this one) folds setup/lobby/live/result into one
page-state-machine `*Board.tsx`. See `Games/G04-Trumpcard.md`.

Registered with one line in `backend/src/games/registry.ts`.
See `backend/src/games/README.md` for the hard rule: a game gets money
behaviour **only** from the escrow adapter.

## Implementation Plan (TODO)
```
[x] Build lobby browser + create flow
    - List already-hosted open lobbies for this game
    - Create New Game -> Random/Friends Play selector (Rule 4)
    - Rounds (balls per innings) input, bet mode selector (Rule 3) + amount
    -> Built via the shared GameSetupWizard off handCricketSetupConfig.ts,
       the same config-driven pattern Mine Catcher/Trumpcard use — no
       bespoke HandCricketSetup.tsx screen (that split was superseded
       before this game was built; see frontend/src/games/hand-cricket/).

[x] Build opponent join flow
    - Random Play: instant join, first-come-first-served
    - Friends Play: room code entry + both players ready-up
    - On match start: call lockBalance() for both players
    -> backend/src/games/hand-cricket/socket.ts: CREATE_MATCH/JOIN_MATCH,
       mirrors Mine Catcher's public-listing + room-code handlers.

[x] Build innings engine
    - Randomly select who bats first
    - Each ball: both players submit a 1-6 pick within 10 sec
    - Compare picks: match = out (end innings), no match = add batter's
      number to their score
    - Track balls used vs. host-chosen round count; end innings early on
      "out" or when balls run out
    - After first innings ends, swap roles and run the second innings
      identically
    -> backend/src/games/hand-cricket/engine.ts (pure functions) +
       socket.ts's per-ball timer/pipeline; unit tests in
       backend/tests/hand-cricket-engine.test.ts.

[x] Build lives system
    - Track 3 lives per player
    - No pick within 10 sec -> decrement 1 life (stall)
    - Disconnect + failed reconnect (15 sec) -> decrement 1 life
    - 0 lives -> call forfeitPlayer(), trigger match forfeit to opponent
    - Before finalizing forfeit: check if opponent is also unreachable
        - If yes: platform keeps the pot (settlement mechanism undecided,
          see Open Questions)
        - If no: standard forfeit resolution, settleMatch() pays the opponent
    -> decrementLife/markDisconnected/markReconnected ported from Mine
       Catcher's engine.ts verbatim, including the dual-unreachable check.

[x] Build match resolution
    - After both innings complete, compare total runs
    - Equal scores -> trigger Super Over: 6 balls per side, same out/runs
      rules, higher score wins
    - If Super Over also ties -> split pot evenly, no further Super Overs
    - Call settleMatch() with the result
    -> checkMatchEnd()'s 4-branch decision + socket.ts's settleMatch(),
       generalized to accept multiple winners so the even-split case calls
       settleMatch(match, [p1,p2], [1,1]).

[x] Build the result screen
    - Winner, run totals per innings, payout breakdown (stake, pot, 5% fee, net)
    - No leaderboard -- a 1v1 match has nothing to rank
    - Rematch button wires to the hub's Rule 4 rematch handshake; suppressed
      on a forfeit or dual-unreachable ending
    -> frontend/src/games/hand-cricket/HandCricketResult.tsx.

[x] Build leaderboard + profile history update
    - After settlement, update both players' win/loss/earnings history
    -> No game-specific code needed: backend/src/profile/history.ts derives
       win/loss/earnings generically from Match/MatchParticipant rows for
       any gameType, so this comes for free from calling settleMatch()
       correctly — same as every other game.
```

## Reference

**Game-specific timers**
| Timer | Duration | On Timeout |
|---|---|---|
| Number pick (per ball) | 10 seconds | Counts as 1 lost life (stall) |
| Disconnect reconnect | 15 seconds (standard escrow, reused) | Counts as 1 lost life |

**Escrow / Rules tie-in**
- Uses `lockBalance()` and `settleMatch()` from `../03-Escrow.md`, but **overrides** the generic disconnect/forfeit behavior with this game's own 3-lives system — the same override pattern as Mine Catcher and Trumpcard.
- **`forfeitPlayer()` is still not an ending** in the normal single-unreachable case — it confiscates the disconnected player's stake into the pot, and this game must still call `settleMatch(matchId, [present player], [1])` to actually pay the opponent, exactly as any other game does.
- Payout follows **Rule 1** + **Rule 2** (1v1 winner-take-all), except the Super Over even-split case and the dual-unreachable edge case, which settles to the platform instead — the same undecided settlement mechanism Mine Catcher flags.
- **Rule 3's Free Bet 1v1 minimum stake is exactly what this game needs** — already live in `../10-Game-Common-Rules.md`, used as-is via the shared bet-mode component.
- **Rule 4** — Random / Friends / Rematch discovery, all hub-owned; this game builds no lobby and no rematch handshake of its own.

## Open Questions

### Owned by this game
- **Disconnect handling:** does a disconnect/failed-reconnect draw from the same 3-life pool as stalling, or use the standard standalone escrow disconnect rule instead? Assumed merged for now, matching Mine Catcher and Trumpcard.
- **Dual-unreachable edge case:** if the opponent is also unreachable at the moment of a lives-based forfeit, does the platform keep the pot (same as Mine Catcher), or something else? Assumed yes for now.
- **The dual-unreachable settlement mechanism is unspecified**, same open item as Mine Catcher's: `../03-Escrow.md` currently exposes `lockBalance`, `settleMatch`, `refundMatch`, and `forfeitPlayer` — none of which represent "no winner, house retains everything." This is one mechanism to decide once, shared by both games, not two separate ones — see `Games/G03-Mine-Catcher.md`.
- **No provably-fair claim is made for the bat-first pick or the simultaneous-number reveal.** Whether this game intends the same commit-reveal treatment Coin Flip uses, or is deliberately out of scope for it, is undecided.

## Related Docs
- `../04-Games-Index.md` — master game list and status
- `../10-Game-Common-Rules.md` — Rules 1–4, inherited by this game unchanged
- `../03-Escrow.md` — the functions this game calls instead of touching balances
- `Games/G03-Mine-Catcher.md` — the game that first established the combined lives-system override and the dual-unreachable open question this game reuses

## Last Updated
2026-08-31 — **Implemented end-to-end.** Backend: `backend/src/games/hand-cricket/{types,engine,socket,manifest,index}.ts` — pure engine functions for simultaneous ball-pick resolution, innings swap, Super Over, and a 3-lives/dual-unreachable system ported from Mine Catcher's engine.ts almost verbatim; registered in `backend/src/games/registry.ts`. Unit tests in `backend/tests/hand-cricket-engine.test.ts`. Frontend: `frontend/src/games/hand-cricket/{handCricketSetupConfig.ts,HandCricketBoard.tsx,HandCricketPickBoard.tsx,HandCricketResult.tsx}` — setup uses the shared `GameSetupWizard` off a small config object rather than the bespoke `HandCricketSetup.tsx` this doc's file tree above still shows (that split was superseded by Trumpcard's generalization of the wizard before this game was built); routed at `/dashboard/play/hand-cricket` in `frontend/src/App.tsx`. The previously-unwired `frontend/public/games/Handcricket.png` art is now wired into the dashboard tile via `frontend/src/lib/gameVisuals.ts`. Both flagged assumptions (disconnect merging into the lives pool, dual-unreachable platform-keeps-the-pot) were carried into the implementation as-is, matching Mine Catcher, rather than resolved. Status moved to In Progress / 100%, pending a manual end-to-end playtest (two browser sessions) since no live dev environment was available in this session to run one.
