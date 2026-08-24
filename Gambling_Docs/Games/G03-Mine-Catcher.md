# Game 03: Mine Catcher

## Identity
| Field | Value |
|---|---|
| **Game No.** | `03` |
| **Game ID** | `mine-catcher` |
| **Doc file** | `Games/G03-Mine-Catcher.md` |
| **Fee Mode** | `Pooled` — two players bet against each other into one pot (Rule 1) |
| **Players** | `1v1` — winner-take-all, except the dual-unreachable edge case (Reference) where the platform keeps the pot instead |
| **Discovery** | `Random + Friends + Rematch` — all three Rule 4 modes, unmodified |

## One-Line Summary
A 1v1 Battleship-style mine-hunting race — each player hides 10 mines on their own board, then takes turns attacking the opponent's board; first to find all 10 wins instantly.

## Overview
Two players each secretly place 10 mines on their own grid. Once both are ready, they take turns clicking boxes on each other's board — an empty box is a "break" (miss), a mine is a "blast" (hit). It's a pure race: the moment either player finds all 10 of their opponent's mines, the match ends immediately in their favor, regardless of how far along the other player was. A 3-lives system, specific to this game, overrides the hub's generic disconnect rule.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 0% — designed, not yet coded
- **Contract Status:** Off-chain only — uses the shared escrow layer
- **Inherits:** Rules 1, 3 and 4 of `../10-Game-Common-Rules.md` unchanged — including the Free Bet 1v1 minimum-stake floor, adopted upstream 2026-08-19, which is exactly what this game originally needed. **Overrides the generic disconnect rule** with its own 3-lives system (see Reference) — the only redefinition this file makes.

## How It Works (Flow)

### Match Setup
Mine Catcher adds two settings of its own — board size and the fixed mine count — on top of the inherited Rule 3/Rule 4 flow:

| Step | Setting | Owned by |
|---|---|---|
| 1 | Host opens Mine Catcher | this game |
| 2 | **Random Play** or **Friends Play** | Rule 4 |
| 3 | **Board size** — exact square grids only: 25 (5×5), 49 (7×7), 81 (9×9), or 100 (10×10) | **this game** |
| 4 | **Mines** — fixed at 10, regardless of board size | **this game** |
| 5 | **Fixed Bet** or **Free Bet** mode | Rule 3 |
| 6 | **Bet amount**, and **minimum stake** in Free Bet mode | Rule 3 |

Then the match is created, and how it starts follows Rule 4 exactly as written: Random Play lists it publicly for an instant first-come-first-served join; Friends Play generates a room code and waits on both players to separately ready up; Rematch carries a finished match's settings over and waits on both confirmations. In all three, the stake is reserved from creation and converts to an escrow lock via `lockBalance()` once both sides are in — this game triggers no lock itself.

### Mine Placement Phase
1. Each player sees their own empty board, sized per the setup step above.
2. Player secretly places their 10 mines on any 10 boxes of their own board — no placement restrictions.
3. **30-second timer** to finish placing all mines and hit Ready.
4. Timeout before finishing → any remaining unplaced mines are **auto-randomly placed** by the system, and that player is force-readied.

### Attack Phase
1. Once both players are ready, the system **randomly picks who goes first**.
2. Each player is shown their **opponent's** board to attack — their own board is hidden from them during this phase.
3. **15-second turn timer** to click a box on the opponent's board.
4. Clicking an empty box → **"break"** (miss).
5. Clicking a mine → **"blast"** (hit) — that player's found-mine count increases by 1.
6. Turns **alternate** after every click.
7. **Race ends instantly** the moment either player finds all 10 of the opponent's mines — the match ends right there; the other player's progress no longer matters.

### Lives & Disconnects (overrides Rule 4's generic disconnect behavior, for this game only)
- Each player starts the match with **3 lives**.
- A life is lost when **either**:
  - **Turn-timeout:** connected, but doesn't click within the 15-second turn timer, or
  - **Disconnect-timeout:** disconnects and fails to reconnect within the standard 15-second escrow grace period.
- Losing all **3 lives** → the opponent wins the match by default, standard payout applies.
- **Dual-unreachable edge case:** if, at the exact moment a forfeit would be declared, the opponent is *also* unreachable, the match does **not** default to the opponent (their presence can't be confirmed) and does **not** refund like a normal crash. Instead, **the platform keeps the pot.**

### Match End
1. Winner = first player to find all 10 of the opponent's mines, via normal play or via the opponent running out of lives.
2. **No tie is possible** through normal play — turns strictly alternate, so only one player can ever reach 10 first.
3. **Payout:** Rule 1 (5% fee) + Rule 2 (1v1 winner-take-all) — except the dual-unreachable edge case, where the platform keeps the pot instead of paying anyone:

| Outcome | Call |
|---|---|
| Race won normally | `settleMatch(matchId, [winner], [1])` |
| Opponent out of lives | `settleMatch(matchId, [winner], [1])` — identical; the lives system only decides who counts as the winner |
| Dual-unreachable at forfeit time | No `settleMatch()` winner call — platform retains the pot. Exact mechanism (a house-credit settlement path vs. a new escrow function) is undecided, see Open Questions |

### Record & Result
- **Result screen** — a 1v1 match, so no leaderboard: winner, final found-mine counts for both players, payout breakdown (stake, pot, 5% fee, net), and each player's personal break-count shown as a stat only, never a deciding factor.
- A **rematch** offer to both players — Rule 4's third discovery path: same settings, both confirm, fresh locks, new match id. Suppressed on a forfeit or dual-unreachable ending, since at least one opponent is gone.
- Both players' profiles updated: win/loss/earnings history, plus the break-count stat.
- No provably-fair commitment scheme is specified for mine placement or turn order — unlike Coin Flip, nothing here is currently claimed as independently verifiable. If that's intended, it's an open question, not an assumption.

## Where This Lives
```
backend/src/games/mine-catcher/
├── index.ts        # default-exports the GameModule
├── manifest.ts     # id: 'mine-catcher', mode: 'pooled', 2 players, status
├── engine.ts       # pure rules — placement, break/blast resolution, lives, race-end (no I/O)
└── socket.ts       # realtime: placement timer, turn timer, break/blast broadcast
frontend/src/games/mine-catcher/
├── MineCatcherSetup.tsx     # host setup — board size, bet mode, amount
├── MinePlacementBoard.tsx   # mine-hiding grid + ready button + 30-sec timer
├── MineAttackBoard.tsx      # opponent's grid, break/blast animations, turn timer
└── MineCatcherResult.tsx    # result screen: outcome, payout, break-count stat
```
Registered with one line in `backend/src/games/registry.ts`.
See `backend/src/games/README.md` for the hard rule: a game gets money
behaviour **only** from the escrow adapter.

## Implementation Plan (TODO)
```
[ ] Build match setup flow
    - Board size selector (25/49/81/100), mines always fixed at 10
    - Bet mode selector (Rule 3) -- Fixed: exact amount input; Free: minimum
      stake input, reusing the shared Rule 3 component
    - Discovery is NOT built here -- Random/Friends/Rematch is hub-level
      (Rule 4). This game only consumes whatever match the lobby hands it.

[ ] Build mine placement phase
    - Render player's own board, let them tap to place/unplace up to 10 mines
    - 30-second countdown, Ready button
    - On timeout: auto-randomly place any remaining unplaced mines, force-ready
      that player

[ ] Build attack phase turn engine
    - Randomly select starting player once both are ready
    - Render opponent's board (hide own board during this phase)
    - 15-second turn timer per click
    - Resolve click: empty = break, mine = blast + increment found-mine count
    - Alternate turn to the other player after each resolution

[ ] Build lives system
    - Track 3 lives per player for the match
    - Turn-timeout OR failed disconnect-reconnect (15 sec) -> decrement 1 life
    - 0 lives remaining -> trigger match forfeit to opponent
    - Before finalizing forfeit: check if the opponent is also currently
      unreachable
        - If yes: do NOT award a win or refund -- mark the match as
          platform-retained (see Open Questions for the settlement mechanism)
        - If no: proceed with normal forfeit resolution, settleMatch() pays
          the opponent

[ ] Build race-end detection
    - After every successful blast, check if that player has now found all 10
      opponent mines
    - If yes: end match immediately, declare that player the winner, ignore
      remaining state

[ ] Build match settlement
    - Call settleMatch() with the winner, or route to the platform-retained
      path for the dual-unreachable case
    - Update both players' win/loss/earnings history and break-count stat

[ ] Build the result screen
    - Winner, found-mine counts, payout breakdown (stake, pot, 5% fee, net)
    - Break-count shown as a stat only -- never a deciding factor
    - No "leaderboard" -- a 1v1 match has nothing to rank
    - Rematch button wires to the hub's Rule 4 rematch handshake; suppressed on
      a forfeit or dual-unreachable ending
```

## Reference

**Game-specific timers**
| Timer | Duration | On Timeout |
|---|---|---|
| Mine placement | 30 seconds | Remaining mines auto-randomly placed |
| Attack turn | 15 seconds | Counts as 1 lost life (see Lives System) |
| Disconnect reconnect | 15 seconds (standard escrow duration, reused) | Failed reconnect also counts as 1 lost life |

**Board size options**
| Boxes | Grid | Mines |
|---|---|---|
| 25 | 5×5 | 10 |
| 49 | 7×7 | 10 |
| 81 | 9×9 | 10 |
| 100 | 10×10 | 10 |

**Escrow / Rules tie-in**
- Uses `lockBalance()` and `settleMatch()` from `../03-Escrow.md` — but **overrides** the generic `forfeitPlayer()` disconnect behavior with this game's own 3-lives system instead.
- **`forfeitPlayer()` is still not an ending** in the normal single-unreachable case — it confiscates the disconnected player's stake into the pot, and this game must still call `settleMatch(matchId, [present player], [1])` to actually pay the opponent, exactly as any other game does.
- Payout follows **Rule 1** + **Rule 2** (1v1 winner-take-all), except the dual-unreachable edge case, which is unique to this game and settles to the platform instead.
- **Rule 3's Free Bet 1v1 minimum stake, adopted upstream 2026-08-19, is exactly what this game needed** — the original spec's "required update" is already live in `../10-Game-Common-Rules.md`; this game simply uses it as-is via the shared bet-mode component.
- **Rule 4** — Random / Friends / Rematch discovery, all hub-owned; this game builds no lobby and no rematch handshake of its own.

## Open Questions

### Owned by this game
- **The dual-unreachable settlement mechanism is unspecified.** "The platform keeps the pot" names an outcome, not a call. `../03-Escrow.md` currently exposes `lockBalance`, `settleMatch`, `refundMatch`, and `forfeitPlayer` — none of which represent "no winner, house retains everything." Whether this needs a new escrow function, or is expressed as `settleMatch` with the house as an implicit winner, is undecided and blocks this game's forfeit path from being built.
- **No provably-fair claim is made for mine placement or turn order.** Coin Flip commits and reveals every random value it produces; Mine Catcher's starting-player pick and the fairness of "no placement restrictions" are currently just asserted. Whether this game intends the same commit-reveal treatment, or is deliberately out of scope for it, needs a decision before a result screen can claim fairness either way.

### Inherited — waiting on the shared rules
- **None.** The one shared-rule gap this game originally depended on — a Free Bet 1v1 minimum stake — was resolved upstream on 2026-08-19 and is already usable as-is.

## Related Docs
- `../04-Games-Index.md` — master game list and status
- `../10-Game-Common-Rules.md` — Rules 1–4, inherited by this game
- `../03-Escrow.md` — the functions this game calls instead of touching balances

## Last Updated
2026-08-24 — Restructured onto the standard game template and numbered as Game 03, from the original unstructured `game_ideas/Game-MineCatcher.md`. Noted that the Rule 3 minimum-stake dependency this game originally needed was already adopted upstream on 2026-08-19, closing that inherited gap. No content changes to the designed flow itself.
