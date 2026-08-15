# Games Index

Master status table for every game in the hub. Update this whenever a game's status changes. Each game also has its own detailed file in `Games/Game-X.md`.

| Game | Type (Pooled / Solo-vs-House) | Status | % Done | Contract Status | Last Updated |
|---|---|---|---|---|---|
| _(none yet)_ | | Not Started | 0% | Off-chain only | |

**Status values:** `Not Started` → `Planning` → `In Progress` → `Testing` → `Complete`

> **Foundation is ready for games (2026-08-15).** The shared layer is built and
> tested, so adding a game is now purely game logic — no money-handling code.
> A new game needs: `backend/src/games/<id>/` exporting a `GameModule`, one line
> in `backend/src/games/registry.ts`, and UI in `frontend/src/games/<id>/`.
> See `backend/src/games/README.md`. Both fee modes are already implemented:
> `pooled` (5% off the pot) and `solo_vs_house` (edge baked into your odds).

**Contract Status values:** `Off-chain only` → `Contract Planned` → `Contract In Progress` → `Contract Integrated`
