# Games Index

Master status table for every game in the hub. Update this whenever a game's status changes. Each game also has its own detailed file in `Games/Game-X.md`.

**Before adding a game, read `10-Game-Common-Rules.md`.** Its three rules — platform fee, payout split, and betting mode — apply to every game automatically. A game file documents only what is specific to that game (its odds table, win condition, board state); it never restates a fee or a payout split.

| Game | Fee Mode (Pooled / Solo-vs-House) | Players (1v1 / Multiplayer) | Status | % Done | Contract Status | Last Updated |
|---|---|---|---|---|---|---|
| _(none yet)_ | | | Not Started | 0% | Off-chain only | |

**Status values:** `Not Started` → `Planning` → `In Progress` → `Testing` → `Complete`

**Fee Mode** decides how the platform fee is taken (Rule 1). **Players** decides how the pot is split (Rule 2) — `1v1` is winner-take-all, `Multiplayer` pays the top 2 at 70/30. Both are fixed properties of the game, chosen at design time and locked in at match start; neither changes with how many people actually join. Solo-vs-house games leave the Players column blank — Rule 2 does not apply to them.

> **Foundation is ready for games (2026-08-15).** The shared layer is built and
> tested, so adding a game is now purely game logic — no money-handling code.
> A new game needs: `backend/src/games/<id>/` exporting a `GameModule`, one line
> in `backend/src/games/registry.ts`, and UI in `frontend/src/games/<id>/`.
> See `backend/src/games/README.md`. Both fee modes are already implemented —
> `pooled` and `solo_vs_house`, per Rule 1 in `10-Game-Common-Rules.md`.

**Contract Status values:** `Off-chain only` → `Contract Planned` → `Contract In Progress` → `Contract Integrated`

## Related Docs
- `10-Game-Common-Rules.md` — the fee, payout, and betting-mode rules every game here inherits
- `03-Escrow.md` — the functions a game module calls instead of touching balances
- `00-Overview.md` — project overview and reading order
