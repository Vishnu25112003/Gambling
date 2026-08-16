# Gambling Hub

A hub of gambling games on Solana, built on one shared wallet / auth / escrow
layer that every game plugs into.

The design lives in [`Gambling_Docs/`](./Gambling_Docs) (an Obsidian vault) and
is the source of truth. This README covers running the code.

**Status: foundation complete, no games yet.** Docs 01 (auth), 02
(deposit/withdraw), 03 (escrow) and 06 (landing + dashboard) are built and
working. `Gambling_Docs/04-Games-Index.md` is still empty — games are a
separate pass.

> **Devnet only.** Test SOL, no real money. See the compliance note in
> `00-Overview.md` before even thinking about a real-money switch.

---

## Quick start

```bash
# 1. configure the backend
cp backend/.env.example backend/.env
openssl rand -hex 48          # paste into JWT_SECRET

# 2. install, start Postgres in Docker, apply migrations
npm run setup

# 3. run both apps
npm run dev
```

Frontend on http://localhost:5173, API on http://localhost:4000.

### The database

Postgres 16 runs in Docker on **host port 5433** (doc 07 — deliberately not
5432, which is already taken on this machine).

```bash
npm run db:up        # start   (docker compose, or plain docker as a fallback)
npm run db:down      # stop, KEEPING data
npm run db:reset     # stop and DELETE the data volume (asks to confirm)
npm run db:psql      # psql shell
npm run db:status    # is it running?
npm run prisma:studio  # browse the data in a GUI
```

`docker-compose.yml` at the project root is the source of truth. Docker Compose
is **not installed on this machine**, so `npm run db:up` falls back to a plain
`docker run` that produces an identical container — same image, name, port,
credentials and named volume. To use Compose properly instead:

```bash
sudo pacman -S docker-compose      # Arch
```

Either path is interchangeable; the fallback exists so nothing is blocked.

After changing `backend/prisma/schema.prisma`:

```bash
npm run prisma:migrate   # create + apply a migration, regenerate the client
```

The frontend works with **no treasury configured** — you can browse the landing
page, enter the dashboard, connect a wallet and sign in. Only deposits and
withdrawals need the treasury.

### Enabling deposits and withdrawals

```bash
npm run treasury:new     # prints a fresh devnet keypair
# paste the secret into TREASURY_SECRET_KEY in backend/.env

solana airdrop 2 <the printed public address> --url devnet
```

Restart the backend. It will log `watching treasury … for deposits`.

---

## Layout

```
Gambling/
├── Gambling_Docs/         Obsidian vault — the design source of truth
├── docker-compose.yml     Postgres 16 on host port 5433 (doc 07)
├── scripts/db.sh          db up/down/reset, with a no-Compose fallback
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma  User, AuthNonce, LedgerEntry, Match, MatchParticipant
│   │   └── migrations/    init + hand-added CHECK constraints
│   ├── prisma.config.ts   Prisma 7 CLI config (datasource URL lives here)
│   ├── scripts/           treasury keypair generator
│   ├── src/
│   │   ├── generated/     Prisma client (generated, not hand-edited)
│   │   ├── config/        env validation, prisma client, solana connection
│   │   ├── auth/          doc 01 — SIWS challenge, verify, JWT, middleware
│   │   ├── wallet/        doc 02 — treasury, deposit listener, withdrawals
│   │   ├── escrow/        doc 03 — THE ADAPTER (see below)
│   │   ├── games/         plugin registry — empty, ready for games
│   │   ├── leaderboard/   public rankings
│   │   ├── sockets/       socket.io + authenticated handshake
│   │   └── lib/           logger, errors, money
│   └── tests/             escrow money math (34 tests)
└── frontend/src/
    ├── pages/
    │   ├── Landing.tsx    public landing page
    │   └── dashboard/     one file per sidebar section
    ├── components/
    │   ├── dashboard/     shell (sidebar/drawer/topbar), tiles, tables
    │   └── shared/        ui primitives, icon set, SceneCanvas
    ├── three/             the WebGL scenes behind the hero and cards
    ├── providers/         wallet adapter, auth context, theme
    ├── hooks/             useAuth, useSocket, useGames, useLeaderboard, useTheme
    └── games/             per-game UI — empty, ready for games
```

### The UI

The frontend is built from a Claude Design handoff (`GamblingHub.dc.html`).
Its two palettes live as CSS custom properties in `src/index.css` — dark by
default, light under `html[data-theme="light"]` — and Tailwind's theme tokens
are declared `@theme inline` so a theme switch repaints without regenerating
any CSS. No component hard-codes a colour; they all read `var(--…)`.

The dice, coins and chips behind the hero and the dashboard welcome card are
three.js scenes in `src/three/siteScenes.ts`, mounted through `<SceneCanvas>`.
That module is imported dynamically, so three.js lands in its own ~140 kB gzip
chunk and never blocks first paint; if it fails to load the pages render
normally without it. Scenes stop rendering while offscreen and dispose their
WebGL context on unmount.

---

## The one rule that matters

`00-Overview.md` principle #2: games never touch money directly. Every balance
change goes through **`backend/src/escrow/index.ts`**:

```ts
import { escrow } from '../../escrow/index.js';

const matchId = await escrow.createMatch({ gameId: 'coin-flip', mode: 'solo_vs_house' });
await escrow.lockBalance(userId, stakeLamports, matchId);
await escrow.settleMatch(matchId, [userId], [payoutLamports]);
```

A game module must **never** import `User`, `LedgerEntry`, `Match` or
`treasury`. That restriction is the entire reason the treasury model can later
be swapped for an on-chain program without rewriting a single game.

See `backend/src/games/README.md` for how to add one.

---

## Money never becomes a JavaScript number

Every amount is a Postgres `NUMERIC(20, 9)` — exact decimal, denominated in SOL.
Nine decimal places is exactly SOL's precision (1 lamport = 0.000000001 SOL).

`Number` is IEEE-754 binary floating point and cannot represent 0.1 exactly
(`0.1 + 0.2 === 0.30000000000000004`). In a system that repeatedly credits and
debits balances, that error accumulates into real money appearing or vanishing,
unrecoverably. So:

- **Database:** `NUMERIC(20,9)`, exact by definition.
- **Backend:** Prisma returns `Decimal` (decimal.js). Arithmetic uses Decimal or
  runs in SQL. Splitting a pot is done in whole lamports as `BigInt`, where
  conservation is exact by construction.
- **API:** amounts cross the wire as exact decimal **strings** (`"1.900000000"`),
  never JSON numbers.
- **Frontend:** strings are formatted for display only. No client-side money math.

`Number(someBalance)` in backend code is a bug. See `backend/src/lib/money.ts`.

### The database enforces it too

The init migration adds CHECK constraints, so even a buggy query cannot corrupt
a balance — the transaction aborts instead:

```sql
CHECK ("availableBalance" >= 0)
CHECK ("lockedBalance"    >= 0)
CHECK ("feeCollected" <= "pot")   -- the house can never take more than the pot
```

This is the main reason Postgres suits this system better than MongoDB did.

---

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Install, start Postgres, apply migrations |
| `npm run dev` | Backend + frontend together |
| `npm run dev:backend` | API only, with watch |
| `npm run dev:frontend` | Vite only |
| `npm test` | Escrow + money tests (real Postgres, throwaway database) |
| `npm run typecheck` | `tsc --noEmit` on both workspaces |
| `npm run build` | Compile backend, bundle frontend |
| `npm run treasury:new` | Generate a devnet treasury keypair |
| `npm run db:up` / `db:down` / `db:reset` | Manage the Postgres container |
| `npm run prisma:migrate` | Create and apply a migration |
| `npm run prisma:studio` | Browse the database in a GUI |

---

## API

Public — no wallet needed (doc 06's ungated set):

| Method | Route | |
|---|---|---|
| GET | `/api/health` | liveness + cluster |
| GET | `/api/games` | registered game manifests |
| GET | `/api/leaderboard` | rankings by net profit |
| GET | `/api/wallet/info` | treasury address, cluster, min withdrawal |

Auth (doc 01):

| Method | Route | |
|---|---|---|
| POST | `/api/auth/challenge` | issue a one-time message to sign |
| POST | `/api/auth/verify` | redeem nonce + signature → JWT |
| GET | `/api/auth/me` | restore session |
| PATCH | `/api/auth/me` | set display name |

Gated — require a session (doc 02):

| Method | Route | |
|---|---|---|
| GET | `/api/wallet/balance` | available / locked |
| POST | `/api/wallet/withdraw` | treasury → your wallet |
| POST | `/api/wallet/deposits/claim` | manually credit a signature |
| GET | `/api/wallet/history` | paginated ledger |

---

## Design decisions worth knowing

**Nonce strategy** (doc 01's open question, now answered). 32 random bytes,
bound to one wallet, single-use, 5-minute TTL index, with the full message
stored server-side and compared byte-for-byte. A nonce is burned even by a
*failed* verify, so a captured challenge can't be ground against.

**Withdrawals reserve before sending.** Doc 02 says "on success, debit". Done
literally, the balance stays spendable while the transfer is in flight — you
could bet money already flying to your wallet. So the debit happens first and
is reversed if the transfer fails. Same end state, no window.

**Concurrency is handled by conditional UPDATEs, not read-then-write.** Doc 03
requires the balance check to live in the same statement as the debit:

```sql
UPDATE users SET "availableBalance" = "availableBalance" - $amount
WHERE id = $user AND "availableBalance" >= $amount
```

Postgres row-locks for the duration and re-evaluates the WHERE against the
current row, so concurrent bets serialise instead of both passing a stale read.
`count === 0` means the funds weren't there. A test fires ten simultaneous 1-SOL
bets at a 5-SOL balance and asserts exactly five succeed.

**Sign-in nonces are swept, not TTL-expired.** MongoDB expired them with a TTL
index; Postgres has no equivalent, so `auth/nonceSweeper.ts` deletes expired
rows on a timer. That's housekeeping only — `consumeChallenge` already refuses
any expired nonce, so a challenge is dead the moment it expires either way.

**Forfeited stakes stay in the pot.** `forfeitPlayer` unlocks the stake from
the player but leaves it in `match.pot` for whoever is left, tracked separately
as `forfeitedAmount` so settlement can't debit the same lamports twice.

**Crash recovery runs at boot.** Any match still `open` at startup belonged to a
process that died holding player funds, so `recoverOpenMatches()` refunds it in
full — doc 03's crash rule, applied automatically.

**Pooled vs solo-vs-house fee handling.** `settleMatch`'s `weights` parameter
means different things per mode: relative shares of the pot for `pooled` (5%
taken off the top), absolute lamport payouts for `solo_vs_house` (no fee, since
the edge is already in the odds). This is the one genuinely subtle part of the
escrow API — it's documented at the top of `settleMatch.ts`.

---

## Known limits of this phase

- **Single process only.** Forfeit timers and the withdrawal queue are
  in-memory. Multiple backend instances need Redis for both. (The atomic DB
  guards still prevent overdraw across processes — the worst case is a rejected
  request, not lost funds.)
- **Treasury key in an env var.** Fine for devnet, must move to a secrets
  manager before real money. Only `wallet/treasury.ts` would change.
- **The Postgres container uses the default `gamblinghub:gamblinghub`
  credentials** from doc 07. Fine for a local dev container that only listens on
  localhost; must not be reused for anything deployed.
- **Deposits credit at `confirmed`, not `finalized`** — doc 02's deliberate
  choice, with a small accepted reorg risk.
