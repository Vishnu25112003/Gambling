# Game NN: <Game Name>

> **Template.** Copy this file to `GNN-<Game-Name>.md`, take the next free
> number from `../04-Games-Index.md`, fill every section, delete this block and
> any section that genuinely does not apply. Keep the section order — every game
> file reads the same way so a reader can jump straight to the part they need.

## Identity
| Field | Value |
|---|---|
| **Game No.** | `NN` |
| **Game ID** | `<kebab-case-id>` — the folder name under `backend/src/games/` and `frontend/src/games/`, and the `id` in the game manifest |
| **Doc file** | `Games/GNN-<Game-Name>.md` |
| **Fee Mode** | `Pooled` or `Solo-vs-House` (Rule 1) |
| **Players** | `1v1` or `Multiplayer` — blank for solo-vs-house (Rule 2) |
| **Discovery** | `Random + Friends + Rematch` (Rule 4, 1v1 only) or `n/a` |

## One-Line Summary
One sentence a stranger can read and understand what the game is.

## Overview
A short paragraph: the loop of the game, what a player is actually deciding, and
what "winning" means here.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 0% — designed, not yet coded
- **Contract Status:** Off-chain only
- **Inherits:** Rules 1–4 of `../10-Game-Common-Rules.md` — this file redefines none of them

## How It Works (Flow)

### Match Setup
Only the parts this game adds on top of Rule 3 (bet mode) and Rule 4
(discovery). Do not restate the room-code or ready-up flow — link to Rule 4.

### Gameplay
The round/turn loop, step by step, including every timer and what happens when
one expires.

### Match End
The win condition, the tie condition, and the exact `settleMatch` call this
game makes. Payout *policy* is Rule 1 + Rule 2 — name the rule, never the
percentage.

### Record & Result
What the game persists per round or per turn, and what the end-of-match screen
shows. If the game makes any provably-fair claim, say where the commitment and
seed are stored and how a player checks one afterwards — a claim with no
retained record is not verifiable. Do not write "leaderboard" unless the game
actually ranks more than two players.

## Where This Lives
```
backend/src/games/<game-id>/
├── index.ts        # default-exports the GameModule
├── manifest.ts     # id, name, mode, player counts, status
├── engine.ts       # pure game rules — no I/O, unit-testable
└── socket.ts       # realtime handlers (optional)
frontend/src/games/<game-id>/
└── ...             # setup screen, board, result screen
```
Registered with one line in `backend/src/games/registry.ts`.
See `backend/src/games/README.md` for the hard rule: a game gets money
behaviour **only** from the escrow adapter.

## Implementation Plan (TODO)
```
[ ] ...
```

## Reference

**Game-specific timers**
| Timer | Duration | On Timeout |
|---|---|---|

**Escrow / Rules tie-in**
- Which of `lockBalance()`, `settleMatch()`, `refundMatch()`, `forfeitPlayer()`
  this game calls, and when.
- Note that **`forfeitPlayer()` does not end a match** — it moves a
  disconnected player's stake into the pot. Every match is still ended and
  paid by `settleMatch()`. Say explicitly where your game calls it.
- Which rules apply, by number — never by value.

## Open Questions
Only questions *this game* owns. A question about a shared rule belongs in
`../10-Game-Common-Rules.md`; link to it instead of duplicating it here.

## Related Docs
- `../04-Games-Index.md` — master game list and status
- `../10-Game-Common-Rules.md` — Rules 1–4, inherited by this game
- `../03-Escrow.md` — the functions this game calls instead of touching balances

## Last Updated
YYYY-MM-DD — what changed.

<!-- Template changelog (delete when copying):
     2026-08-19 — Added Record & Result section, the forfeitPlayer warning, and
     Rematch to the Discovery row, from the Game 01 spec pass. -->
