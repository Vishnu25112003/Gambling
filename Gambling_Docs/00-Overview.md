# Infinit Respawn — Project Overview

## One-Line Summary
A standalone hub of gambling-style games — separate project from Trumpcard Hub — with a shared wallet, auth, and escrow layer underneath every game, all governed by one common set of game rules.

## Overview
This project hosts multiple gambling games (list TBD) inside one hub. Instead of each game handling its own login, money, and betting logic, there's one shared layer that every game plugs into. This keeps every game simple, consistent, and easy to add without rewriting money-handling code each time. The shared layer is built and tested; the games list is what's still open.

## Tech Stack
*(This is the only file in the vault with a Tech Stack section — every other file assumes this stack.)*
- **Frontend:** React 19 + Vite + Tailwind
- **Backend:** Node / Express 5 + Socket.IO
- **Database:** PostgreSQL / Prisma (Docker container — see `07-Local-Dev-Environment.md`)
- **Blockchain:** Solana (Devnet for the current dev phase)
- **Wallet:** Wallet-connect only (Phantom / Solflare via Sign-In With Solana)

## Architecture Principles (Non-Negotiable)
1. **Every game is a separate, self-contained module** — same plugin pattern as Trumpcard Hub. No shared game logic between games.
2. **Adapter/interface pattern for money logic.** Games never touch the database or treasury wallet directly — they only call shared functions (`lockBalance`, `settleMatch`, `refundMatch`, `forfeitPlayer`). This means the deposit/withdraw method can be upgraded later (treasury model → real on-chain program) by changing one implementation, not every game.
3. **Chain is touched rarely.** Betting, escrow, and settlement all happen off-chain in PostgreSQL/Socket.IO for speed. The blockchain is only touched at deposit and withdrawal.
4. **Reusable frontend components** — shared UI (wallet balance display, bet slip, leaderboard row, etc.) built once, reused across every game's page.
5. **One source of truth per rule.** Fees, payout splits, betting modes and match discovery are defined once in `10-Game-Common-Rules.md` and applied by the escrow layer (discovery by the hub lobby, which runs before escrow). No game — and no other doc — restates a rate or a split; it links to doc 10 instead.

## Status
- **Phase:** Foundation built (auth, wallet, escrow, referral, profiles, dashboard) on PostgreSQL. Blocked on Phase 2 — picking the games.
- **Real money:** Not yet. Devnet/testnet SOL only for now.
- **Games decided:** None yet — `04-Games-Index.md` is still empty, and this is the one thing holding up the next phase
- **Common rules:** Rules 1–2 locked; Rules 3–4 amended 2026-08-19 — see `10-Game-Common-Rules.md` (fee, payout split, betting modes, match discovery)

## High-Level Roadmap
```
[x] Phase 1: Foundation planning — auth, wallet, escrow, fee model decided
[ ] Phase 2: Games selection — decide which games go in the hub  ← CURRENT BLOCKER
[x] Phase 3: Backend build — Auth/Wallet-Connect, Deposit/Withdraw, Escrow
[x] Phase 4: Frontend build — Landing page + Dashboard
[ ] Phase 5: First game module — build + test
[ ] Phase 6: Remaining games — build + test
[ ] Phase 7: Real-money legal review
[ ] Phase 8: Production launch
```

## Compliance Note
Online real-money gambling (games of chance for stakes) is currently restricted under Tamil Nadu state law and a central law (PROGA), upheld by the Supreme Court (May 2026). This project is being built and tested entirely on **Devnet/testnet SOL** for now. Before any switch to real-money mode, this needs a proper legal review (jurisdiction, licensing, geo-restriction) — not a decision made from architecture alone.

## Related Docs
**Foundation — applies to every game, read these first**
- `01-Auth-Wallet-Connect.md` — login/identity via wallet-connect
- `02-Deposit-Withdraw.md` — treasury model, deposit detection, withdrawal flow
- `03-Escrow.md` — bet locking, settlement, disconnect/crash rules — the *mechanism* that moves money
- `10-Game-Common-Rules.md` — the *policy* escrow enforces: platform fee, payout splits, betting modes, and (Rule 4) how two players find each other. Single source of truth for every rate and split in the project.

**Games**
- `04-Games-Index.md` — master list and status of all games
- `Games/GNN-<Game-Name>.md` — one self-contained file per game, numbered by `04-Games-Index.md` (`G01-Coin-Flip.md` is the first)
- `Games/G00-Template.md` — the blank template every new game file is copied from

**Product & features**
- `06-Landing-Dashboard-Structure.md` — landing page + dashboard layout, sections, and gating rules
- `09-Referral-Program.md` — Invite & Earn: invite links, attribution, and the first-win commission
- `11-User-Profiles.md` — profile pages, usernames, avatars, loyalty tiers, and player statistics. Single source of truth for the tier thresholds.

**Environment & history**
- `07-Local-Dev-Environment.md` — Docker setup for the local PostgreSQL container
- `08-Solana-Setup-Guide.md` — clusters, wallets, devnet SOL, treasury setup, and how browser/backend/chain communicate
- `05-Progress-Log.md` — dated changelog of decisions

## How to Use This Vault (for teammates / any AI picking this up)
Read this file first for the big picture. Then read `01`, `02`, `03`, and `10` — those four never change per-game and apply to every game automatically. `03` and `10` are a pair: `03` is how money moves, `10` is the rules that decide how much moves and to whom.

After that: `06` covers the landing/dashboard UI structure and can be worked on independently of the backend files, and `07` covers local environment setup. Then open only the specific `Games/GNN-<Game-Name>.md` file for the game you're working on; it's self-contained and doesn't require reading other game files.

**If you are adding a game:** read `04-Games-Index.md` and `10-Game-Common-Rules.md`, then write only game-specific logic. Never put a fee, a payout split, or a balance update inside a game — call escrow and let doc 10's rules apply themselves.

## Last Updated
2026-08-19 — Rule 4 (match discovery) propagated into the principles, status and doc list; three places still described doc 10 as covering only fee, payout and betting mode. Common-rules status is no longer a flat "Locked" — Rules 3 and 4 were amended by the Coin Flip spec pass.
2026-08-18 — Added `11-User-Profiles.md` (profile pages, usernames, avatars, loyalty tiers, statistics). Two pre-existing forfeit double-counting bugs in the escrow layer were found and fixed during that work — see `05-Progress-Log.md`.
2026-08-18 — Added `10-Game-Common-Rules.md` and linked it into the reading order; fee/payout policy moved there out of `03-Escrow.md`. Status, roadmap, and the stale MongoDB reference corrected.
2026-08-17 — Added `09-Referral-Program.md` (Invite & Earn), built on top of the escrow layer.
