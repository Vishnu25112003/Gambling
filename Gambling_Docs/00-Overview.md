# Gambling Hub — Project Overview

## One-Line Summary
A standalone hub of gambling-style games — separate project from Trumpcard Hub — with a shared wallet, auth, and escrow layer underneath every game.

## Overview
This project hosts multiple gambling games (list TBD) inside one hub. Instead of each game handling its own login, money, and betting logic, there's one shared layer that every game plugs into. This keeps every game simple, consistent, and easy to add without rewriting money-handling code each time. Currently in the planning/documentation phase — no code has been written yet.

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
3. **Chain is touched rarely.** Betting, escrow, and settlement all happen off-chain in MongoDB/Socket.IO for speed. The blockchain is only touched at deposit and withdrawal.
4. **Reusable frontend components** — shared UI (wallet balance display, bet slip, leaderboard row, etc.) built once, reused across every game's page.

## Status
- **Phase:** Planning / documentation — no code written yet
- **Real money:** Not yet. Devnet/testnet SOL only for now.
- **Games decided:** None yet — foundation layer is being documented first

## High-Level Roadmap
```
[x] Phase 1: Foundation planning — auth, wallet, escrow, fee model decided
[ ] Phase 2: Games selection — decide which games go in the hub
[ ] Phase 3: Backend build — Auth/Wallet-Connect, Deposit/Withdraw, Escrow
[ ] Phase 4: Frontend build — Landing page + Dashboard
[ ] Phase 5: First game module — build + test
[ ] Phase 6: Remaining games — build + test
[ ] Phase 7: Real-money legal review
[ ] Phase 8: Production launch
```

## Compliance Note
Online real-money gambling (games of chance for stakes) is currently restricted under Tamil Nadu state law and a central law (PROGA), upheld by the Supreme Court (May 2026). This project is being built and tested entirely on **Devnet/testnet SOL** for now. Before any switch to real-money mode, this needs a proper legal review (jurisdiction, licensing, geo-restriction) — not a decision made from architecture alone.

## Related Docs
- `01-Auth-Wallet-Connect.md` — login/identity via wallet-connect
- `02-Deposit-Withdraw.md` — treasury model, deposit detection, withdrawal flow
- `03-Escrow.md` — bet locking, settlement, disconnect/crash rules, fee model
- `04-Games-Index.md` — master list and status of all games
- `Games/Game-*.md` — one self-contained file per game
- `05-Progress-Log.md` — dated changelog of decisions
- `06-Landing-Dashboard-Structure.md` — landing page + dashboard layout, sections, and gating rules
- `08-Solana-Setup-Guide.md` — clusters, wallets, devnet SOL, treasury setup, and how browser/backend/chain communicate
- `07-Local-Dev-Environment.md` — Docker setup for the local PostgreSQL container
- `09-Referral-Program.md` — Invite & Earn: invite links, attribution, and the 5%-of-first-win commission

## How to Use This Vault (for teammates / any AI picking this up)
Read this file first for the big picture. Then read `01`, `02`, and `03` — those three never change per-game and apply to every game automatically. `06` covers the landing/dashboard UI structure and can be worked on independently of the backend files. `07` covers local environment setup. Then open only the specific `Games/Game-X.md` file for the game you're working on; it's self-contained and doesn't require reading other game files.

## Last Updated
2026-08-17 — Added `09-Referral-Program.md` (Invite & Earn), built on top of the escrow layer.
