# Games Index

Master status table for every game in the hub, and the numbering scheme every game file follows. **This file assigns game numbers** — nothing else does. Update it whenever a game is added or a game's status changes.

**Before adding a game, read `10-Game-Common-Rules.md`.** Its four rules — platform fee, payout split, betting mode, and match discovery — apply to every game automatically. A game file documents only what is specific to that game (its odds table, its win condition, its board state, its own timers); it never restates a fee, a payout split, or a lobby flow.

## Naming & Numbering

Every game gets a number, assigned here, in the order it is added. The number never changes and is never reused, even if a game is dropped.

| Thing | Format | Example |
|---|---|---|
| Doc file | `Games/GNN-<Game-Name>.md` | `Games/G01-Coin-Flip.md` |
| Game No. | two digits, zero-padded | `01` |
| Game ID | kebab-case, used in code and URLs | `coin-flip` |
| Backend folder | `backend/src/games/<game-id>/` | `backend/src/games/coin-flip/` |
| Frontend folder | `frontend/src/games/<game-id>/` | `frontend/src/games/coin-flip/` |

The `G` prefix keeps game numbers from being confused with the root doc numbers (`01-Auth-Wallet-Connect.md` is a foundation doc; `G01-Coin-Flip.md` is a game). `Games/G00-Template.md` is the blank template — copy it, never edit it in place.

## Master Table

| No. | Game | Game ID | Fee Mode (Pooled / Solo-vs-House) | Players (1v1 / Multiplayer) | Status | % Done | Contract Status | Doc | Last Updated |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Coin Flip | `coin-flip` | Pooled | 1v1 | Planning | 0% | Off-chain only | `Games/G01-Coin-Flip.md` | 2026-08-19 |

**Game 01 is fully specified.** Its own open questions are all closed; what remains is inherited — Rule 4 needs a schema and a reserved-balance field before it can be built. See its *Inherited* section.

**Next free number: 02.**

**Status values:** `Not Started` → `Planning` → `In Progress` → `Testing` → `Complete`

**Contract Status values:** `Off-chain only` → `Contract Planned` → `Contract In Progress` → `Contract Integrated`

**Fee Mode** decides how the platform fee is taken (Rule 1). **Players** decides how the pot is split (Rule 2) — `1v1` is winner-take-all, `Multiplayer` pays the top 2 at 70/30. Both are fixed properties of the game, chosen at design time and locked in at match start; neither changes with how many people actually join. Solo-vs-house games leave the Players column blank — Rule 2 does not apply to them.

Note that **Rule 4 (Random Play / Friends Play) currently covers 1v1 games only.** A `Multiplayer` game added to this table has no specified discovery flow yet.

## Adding a Game — Checklist

```
[ ] Take the next free number from this file, and update "Next free number"
[ ] Copy Games/G00-Template.md → Games/GNN-<Game-Name>.md and fill it in
[ ] Add a row to the master table above
[ ] Create backend/src/games/<game-id>/ exporting a GameModule
[ ] Add one line to backend/src/games/registry.ts
[ ] Create frontend/src/games/<game-id>/
[ ] Log the addition in 05-Progress-Log.md
```

> **Foundation is ready for games (2026-08-15).** The shared layer is built and
> tested, so adding a game is now purely game logic — no money-handling code.
> See `backend/src/games/README.md`. Both fee modes are already implemented —
> `pooled` and `solo_vs_house`, per Rule 1 in `10-Game-Common-Rules.md`.

## Related Docs
- `10-Game-Common-Rules.md` — the fee, payout, betting-mode and discovery rules every game here inherits
- `03-Escrow.md` — the functions a game module calls instead of touching balances
- `Games/G00-Template.md` — the blank game doc every new game starts from
- `00-Overview.md` — project overview and reading order

## Last Updated
2026-08-19 — Game 01 spec completed: every game-owned open question closed. Three amendments pushed up into `10-Game-Common-Rules.md` along the way — Rematch as a third Rule 4 discovery path, a minimum stake for Free Bet 1v1 under Rule 3, and stake reservation before the escrow lock.
2026-08-19 — Numbering scheme introduced (`Games/GNN-<Game-Name>.md`); Coin Flip registered as Game 01; template and add-a-game checklist added.
