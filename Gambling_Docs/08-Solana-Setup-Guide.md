---
tags:
  - solana
  - setup
  - devnet
  - wallet
  - onboarding
created: 2026-08-17
status: reference
---

# Solana Setup & Workflow Guide

## One-Line Summary
Everything needed to go from a clean machine to a working devnet money loop — clusters, wallets, free test SOL, the treasury keypair, and how the browser, the backend, and the chain actually talk to each other.

## Overview
This is the practical companion to [[01-Auth-Wallet-Connect]] and [[02-Deposit-Withdraw]]. Those docs specify *what* the system does; this one explains *how Solana works underneath it* and gives the exact commands to get a local devnet loop running.

Read this once before touching the wallet code. The concepts here — clusters, lamports, the split between `Connection` and `WalletProvider`, and rent exemption — explain most of the "why is my balance zero" confusion during first setup.

## Status
- **Phase:** Reference doc, written 2026-08-17
- **Cluster:** Devnet only. No real money anywhere in this project yet — see the compliance note in [[00-Overview]].
- **Depends on:** [[07-Local-Dev-Environment]] for the Postgres container.

---

## Core Vocabulary

| Term | Meaning |
|---|---|
| **Cluster** | A Solana network. Three exist: `mainnet-beta`, `devnet`, `testnet`. |
| **Lamport** | Smallest unit of SOL. `1 SOL = 1_000_000_000 lamports` (`LAMPORTS_PER_SOL`). |
| **Public key** | A 32-byte ed25519 key, base58-encoded — e.g. `9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM`. This is a wallet address. Case-sensitive, no prefix. |
| **Keypair** | 64 bytes: 32 secret + 32 public. Base58-encoded when exported. |
| **Signature** | A 64-byte ed25519 signature. Also the name of a transaction's ID (its first signature). |
| **Commitment** | How settled a transaction is: `processed` → `confirmed` → `finalized`. |
| **RPC** | The HTTP endpoint used to read from and write to the chain. |
| **System Program** | Solana's built-in program that handles plain SOL transfers. This project uses only this — no custom on-chain program yet. |
| **Rent exemption** | The minimum balance an account must hold (~0.00089 SOL) to avoid being garbage-collected. |

---

## Part 1 — Choosing the Cluster

| Cluster | Purpose | Use here? |
|---|---|---|
| `mainnet-beta` | Real money, real SOL | Later, after legal review |
| `devnet` | **Application development.** Free airdrops, stable, resets occasionally. | ✅ **This project** |
| `testnet` | Solana core-team validator stress testing | ❌ Never |

> [!warning] `testnet` is not the development network
> On Solana, `testnet` is where the core team beats up unreleased validator builds. Faucets are unreliable there and state is wiped often. **`devnet` is the development network.** If you pick `testnet` because the name sounds right, nothing will work and the errors won't tell you why.

Current config in `backend/.env`:

```env
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com
SOLANA_COMMITMENT=confirmed
```

### What each URL is for

- **`SOLANA_RPC_URL`** (HTTPS) — request/response. "What's this balance?" "Send this transaction." "Give me this transaction's details."
- **`SOLANA_WS_URL`** (WSS) — same server, push protocol. The RPC notifies us the instant something touches the treasury. This is what makes deposit detection instant instead of polled. See `backend/src/wallet/depositListener.ts:57`.

The WSS URL is always the RPC URL with `https` swapped for `wss`. Both are free, public, and need no signup.

> [!tip] Commitment choice
> `confirmed` credits a deposit roughly one second after the block, accepting a tiny reorg risk. `finalized` takes ~13 seconds and is irreversible. [[02-Deposit-Withdraw]] locks this to `confirmed` — correct for devnet play money, but worth revisiting before real money.

---

## Part 2 — The Two Wallets

Keeping these straight prevents most setup confusion.

| | **Player wallet** | **Treasury wallet** |
|---|---|---|
| Lives in | Phantom / Solflare browser extension | `TREASURY_SECRET_KEY` in `backend/.env` |
| Who holds the key | The user | The server |
| Signs | Login messages, deposits | Withdrawals |
| Role | A user of the hub | The house / pooled float |

The treasury is the pooled-custody model described in [[02-Deposit-Withdraw]] and commented at `backend/src/wallet/treasury.ts:11`. Every user's deposit lands in this single wallet; their individual balance is a row in Postgres.

---

## Part 3 — Player Wallet (Phantom)

### Install

1. Go to https://phantom.app and add the extension to Chrome/Brave.
2. **Create a new wallet** → save the 12-word seed phrase.
3. Set a password.

> [!danger] Use a throwaway wallet for development
> Never use a wallet holding real mainnet funds for local testing. Create a separate dev wallet and keep it dev-only.

### Switch to devnet — do not skip this

```
Settings (⚙) → Developer Settings → Testnet Mode: ON → Network: Solana Devnet
```

> [!warning] The most common first-run mistake
> If Phantom is still on mainnet while the app talks to devnet, Phantom shows a balance of 0 SOL, deposits fail with no useful error, and everything looks broken. Check this first whenever something doesn't work.

### Copy the address

Click the address at the top of Phantom to copy it. That's your public key — safe to share, safe to paste into faucets.

---

## Part 4 — Getting Free Devnet SOL

No third-party provider, no API key, no signup. Three options.

### Option A — Web faucet (start here)

1. Open https://faucet.solana.com
2. Paste your Phantom address
3. Select **devnet**
4. Request

Signing in with GitHub raises the rate limit.

### Option B — Inside Phantom

With Testnet Mode on, Phantom shows a **"Get test SOL"** button on the devnet balance screen. One click.

### Option C — Solana CLI (needed for the treasury anyway)

Install:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

Add to `~/.zshrc` (the installer prints the exact line):

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Use:

```bash
solana config set --url devnet
solana airdrop 2 <ADDRESS>
solana balance <ADDRESS>
```

> [!note] Airdrop limits
> Roughly 2 SOL per request, rate-limited per IP and per address. A `429` means the faucet is busy — wait a minute and retry, or use another option. Devnet SOL has zero monetary value; it's throttled, not scarce.

---

## Part 5 — Creating and Funding the Treasury

### Generate

```bash
cd backend
npm run treasury:new
```

Runs `backend/scripts/newTreasury.ts` and prints:

```
Public address : Fh7x…      ← where users send SOL; safe to expose
Secret (base58): 4NpQ8k…    ← paste into .env; never share, never commit
```

Nothing is written to disk on purpose — a secret key in a file is a secret key that gets committed by accident.

### Configure

```env
TREASURY_SECRET_KEY=4NpQ8k…
```

### Fund

The treasury pays the network fee on **every withdrawal**, so it needs its own SOL:

```bash
solana airdrop 2 <TREASURY_PUBLIC_ADDRESS> --url devnet
```

### Accepted key formats

`parseSecretKey` at `backend/src/wallet/treasury.ts:22` accepts both:

- **Base58** — `4NpQ8k…`, what Phantom and Solflare export
- **JSON byte array** — `[174,47,15,…]`, what `solana-keygen` writes to a file

> [!danger] Rent exemption — never drain the treasury to zero
> Solana garbage-collects accounts that fall below the rent-exempt minimum (~0.00089 SOL), wiping them. Always leave a buffer — at least 0.01 SOL parked in the treasury.

> [!danger] This env var is devnet-only
> A plaintext private key in `.env` is acceptable for play money and nothing else. Before any real-money phase it must move to a secrets manager (KMS / Vault). Per the note at `treasury.ts:15`, `loadTreasuryKeypair` is the only function that would need to change.

### Skipping the treasury

To work on frontend/UI without deposits:

```env
ENABLE_DEPOSIT_LISTENER=false
```

The API boots normally and deposit/withdraw endpoints return `503` instead of crashing.

---

## Part 6 — How the Browser Talks to the Wallet

### The layer stack

```
Your React component
        ↓  useWallet() / useConnection()
@solana/wallet-adapter-react            ← React hooks
        ↓
PhantomWalletAdapter / SolflareWalletAdapter   ← per-wallet shims
        ↓
window.solana  /  Wallet Standard registry     ← what the extension injects
        ↓
Phantom extension  (holds the private key, sandboxed from the page)
```

You never call `window.solana` directly. `frontend/src/providers/SolanaProvider.tsx:26` wires the providers:

```tsx
<ConnectionProvider endpoint={endpoint}>          {/* the chain    */}
  <WalletProvider wallets={wallets} autoConnect>  {/* the extension */}
    <WalletModalProvider>{children}</WalletModalProvider>  {/* picker UI */}
  </WalletProvider>
</ConnectionProvider>
```

### Two separate channels — the key insight

> [!important] `ConnectionProvider` and `WalletProvider` are unrelated
> - **`ConnectionProvider`** → HTTPS to `api.devnet.solana.com`. Reads balances, submits transactions. Knows nothing about the user.
> - **`WalletProvider`** → in-browser messaging to the extension. Signs things. Never touches the network.
>
> This is why `sendTransaction(tx, connection)` takes the connection as an **argument** (`frontend/src/pages/dashboard/Escrow.tsx:82`): the wallet signs, then hands the transaction back to be broadcast over a channel it does not own.

### The consumer hooks

```tsx
const { connection } = useConnection();
const { publicKey, connected, signMessage, sendTransaction, disconnect } = useWallet();
```

| Member | Notes |
|---|---|
| `publicKey` | `PublicKey \| null` — null until connected |
| `connected` | Boolean, true after the user approves the site |
| `signMessage(bytes)` | Signs arbitrary text. **Free. No transaction. No chain.** Used for login. |
| `sendTransaction(tx, connection)` | Signs *and* broadcasts. Costs a fee. |
| `disconnect()` | Drops the site's authorization |

`autoConnect` means: if the user already approved this site, reconnect silently on reload with no popup.

---

## Part 7 — Sign-In Flow (Sign-In With Solana)

No passwords exist in this system. A user proves wallet ownership by signing a server-issued challenge. It costs nothing and touches no chain. Full spec in [[01-Auth-Wallet-Connect]].

```
BROWSER                          BACKEND                        DB
   │
   │ 1. user clicks "Connect"
   │    setVisible(true) → wallet picker modal
   │
   │ 2. picks Phantom → extension popup "Connect?"
   │    user approves → publicKey is now set
   │
   │ 3. POST /auth/challenge { address }
   │──────────────────────────────►
   │                          createChallenge()
   │                          nonce = 32 random bytes → base58
   │                          builds readable message ─────────► authNonce row
   │                                                             (5 min TTL)
   │ 4. ◄────────────────────── { nonce, message }
   │
   │ 5. signMessage(encode(message))
   │    ┌──────────────────────────────────────┐
   │    │  PHANTOM POPUP shows the text:       │
   │    │  "localhost:5173 wants you to sign   │
   │    │   in with your Solana account: 9WzD… │
   │    │   Sign this message to prove you own │
   │    │   this wallet. This is free and will │
   │    │   not create a transaction or move   │
   │    │   any funds.                         │
   │    │   Nonce: 3xK9…"                      │
   │    │         [Cancel]   [Sign]            │
   │    └──────────────────────────────────────┘
   │    → returns a 64-byte ed25519 signature
   │
   │ 6. POST /auth/verify { address, nonce, signature }
   │──────────────────────────────►
   │                          consumeChallenge()  ← conditional UPDATE,
   │                                                single-use, replay-proof
   │                          verifySignature()   ← nacl.sign.detached.verify
   │                          findOrCreateUser() ─────────────► users row
   │ 7. ◄────────────────────── { token: JWT, user }
   │
   │ 8. tokenStore.set(token) → every later request sends Bearer <jwt>
```

**Code map**

| Step | Location |
|---|---|
| Frontend orchestration | `frontend/src/providers/AuthProvider.tsx:91` (`runSignIn`) |
| Message text | `backend/src/auth/walletAuth.ts:43` (`buildMessage`) |
| Signature check | `backend/src/auth/walletAuth.ts:78` (`verifySignature`) |
| Nonce redemption | `backend/src/auth/walletAuth.ts:101` (`consumeChallenge`) |

### Why it's built this way

**Why a nonce?** Without one, a captured signature would be a permanent password. The nonce is 32 random bytes, bound to a single wallet address, single-use, and expires in five minutes — so an intercepted signature is worthless.

**Why store the message server-side?** If the client supplied both the message *and* the signature, it could sign text of its own choosing and pass verification. The backend compares against the exact text it issued, byte for byte.

**Why is the message human-readable?** The user sees it in the Phantom popup. They should be able to read it and understand they're approving a login, not a transfer.

---

## Part 8 — Deposit Flow

```
BROWSER                        SOLANA DEVNET              BACKEND              DB
   │
   │ 1. GET /wallet/info → { treasuryAddress: "Fh7x…" }
   │
   │ 2. user types 0.1, clicks Deposit
   │    build Transaction:
   │      SystemProgram.transfer({
   │        fromPubkey: publicKey,        ← the player
   │        toPubkey:   treasuryAddress,  ← the house
   │        lamports:   0.1 * 1e9
   │      })
   │
   │ 3. sendTransaction(tx, connection)
   │    ┌────────────────────────────────┐
   │    │  PHANTOM POPUP:                │
   │    │  Send 0.1 SOL to Fh7x…         │
   │    │  Network fee 0.000005 SOL      │
   │    │      [Reject]   [Confirm]      │
   │    └────────────────────────────────┘
   │    adapter signs → broadcasts ──────►
   │    ◄──── signature "5xR2…"
   │
   │ 4. confirmTransaction(...)          tx lands
   │                                     ('confirmed')
   │                                        │
   │                                        │ 5. WEBSOCKET PUSH
   │                                        │    onLogs(treasury)
   │                                        ├───────────────────►
   │                                        │              handleLogs()
   │                                        │              processSignature()
   │                                        │                 │
   │                                        │  getParsedTransaction
   │                                        │◄────────────────┤
   │                                        ├────────────────►│
   │                                        │              netLamportsReceived()
   │                                        │                 = post - pre
   │                                        │              findSender()
   │                                        │              lookup user by wallet
   │                                        │                 │
   │                                        │      ┌──────────┴──────────┐
   │                                        │      │ PRISMA TRANSACTION  │
   │                                        │      │ insert ledgerEntry  │──► ledger
   │                                        │      │   (txSignature UQ)  │
   │                                        │      │ increment balance   │──► users
   │                                        │      └──────────┬──────────┘
   │ 6. ◄─── socket.io "deposit credited" ─────────────────────┤
   │    UI updates instantly
   │
   │ 7. also POST /wallet/claim-deposit { signature }  ← belt and braces,
   │    idempotent, in case the websocket message dropped
```

### Why it's built this way

**WebSocket, not polling.** `connection.onLogs(treasury, …)` at `depositListener.ts:57` receives a push for every transaction mentioning the treasury the moment it confirms. Polling would add several seconds of latency and hammer the RPC.

**Balance deltas, not instruction parsing.** `netLamportsReceived` at `depositListener.ts:216` computes `postBalance - preBalance` for the treasury's account index. A transaction can carry many instructions, or move SOL in unanticipated ways; the balance delta is ground truth and cannot be gamed.

**Double-credit protection.** `txSignature` carries a unique constraint, and the ledger insert runs inside the *same* Prisma transaction as the balance increment (`depositListener.ts:154`). If the websocket handler and the manual claim race, one hits `P2002` and the entire transaction rolls back — the balance is never touched twice.

**Manual claim as a safety net.** `processSignature` is exported (`depositListener.ts:94`) so the same logic backs a recovery endpoint. A dropped websocket message must never mean lost funds.

> [!warning] Deposit from the wallet you signed in with
> `depositListener.ts:135` matches the depositor by **sender wallet address**. Sign in with wallet A and deposit from wallet B, and the funds are **not credited** — they get a `failed` ledger row marked `NEEDS MANUAL REVIEW` (`depositListener.ts:254`). Nothing is lost, but nothing is credited either. This trips up testing constantly.

---

## Part 9 — Gameplay Is Off-Chain

Once SOL is deposited, the blockchain is out of the picture entirely. Bets, wins, losses, and escrow only move numbers in Postgres — `availableBalance` and `lockedBalance`.

**Why:** an on-chain bet would cost a fee and take about a second per action. A gambling hub needs moves that are instant and free. The chain is touched only at the two edges: money in, money out. This is architecture principle 3 in [[00-Overview]].

**The trade-off:** users must trust the server. That's the explicit cost of the pooled-custody model, and the reason [[03-Escrow]] keeps all money logic behind adapter functions — swapping in a real on-chain escrow program later should change one implementation, not every game.

---

## Part 10 — Withdrawal Flow

The mirror of a deposit, but the **backend signs** — there is no popup, because the treasury key lives on the server.

```
1. POST /wallet/withdraw { amount: 0.05 }      (JWT identifies the user)

2. serialize(userId, …)              ← per-user queue, one request at a time
                                       (withdraw.ts:44)

3. estimateFee()  → ~5000 lamports; the user absorbs it
   sendAmount = requested - networkFee

4. RESERVE FIRST  (withdraw.ts:127)
   ┌─────────────────────────────────────────────────┐
   │ UPDATE users                                    │
   │    SET availableBalance = availableBalance - X   │
   │  WHERE id = ? AND availableBalance >= X          │ ← conditional
   │                                                 │
   │ 0 rows affected → insufficient funds, abort     │
   │ insert ledgerEntry (status: 'pending')           │
   └─────────────────────────────────────────────────┘

5. Build and sign with the TREASURY keypair — no popup:
   sendAndConfirmTransaction(connection, tx, [treasury])
                                            ↑ server-side signer

6a. SUCCESS → ledger 'confirmed', store the signature
6b. FAILURE → increment the balance back, ledger 'failed'
```

### Why it's built this way

**Reserve before sending** (`withdraw.ts:117`). Doing the literal "debit on success" would leave a window where money already flying to the user's wallet is still spendable on a bet. Debiting up front and crediting back on failure closes that window, and the end state matches the spec exactly — a failed withdrawal never costs the user anything.

**Three layers of overdraw protection.** The in-process queue serializes one user's requests; the conditional `WHERE availableBalance >= X` is the actual correctness guarantee and holds even across processes; a database `CHECK` constraint is the final backstop. The queue is single-process only, so a multi-process deployment needs a distributed lock — but layers 2 and 3 still prevent overdraw there, making the worst case a rejected request rather than lost money.

**The user pays the network fee.** `sendAmount = requested - networkFee` (`withdraw.ts:110`), and a withdrawal too small to cover the fee is rejected outright.

---

## Part 11 — Full Setup Checklist

```bash
# 1. Database — see 07-Local-Dev-Environment
npm run db:up

# 2. Treasury
cd backend
npm run treasury:new                              # copy secret → backend/.env
solana airdrop 2 <TREASURY_PUB> --url devnet      # fund the house

# 3. Player wallet
#    Phantom → Settings → Developer Settings → Testnet Mode ON → Solana Devnet
#    https://faucet.solana.com → paste address → request devnet SOL

# 4. Migrations + servers
npx prisma migrate dev
npm run dev                        # backend  :4000
cd ../frontend && npm run dev      # frontend :5173
```

### Expected backend startup log

```
[solana]   RPC https://api.devnet.solana.com (devnet, commitment=confirmed)
[treasury] treasury loaded: Fh7x…
[deposits] watching treasury Fh7x… for deposits (commitment=confirmed)
```

If you instead see `TREASURY_SECRET_KEY is not set — deposits and withdrawals are disabled`, the `.env` value did not load.

### Then, in the browser

1. Connect → wallet picker → Phantom → approve
2. Sign the login message (free)
3. Deposit `0.1` → confirm in Phantom
4. Balance updates live via the socket push

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Phantom shows 0 SOL | Still on mainnet | Enable Testnet Mode, select Solana Devnet |
| `TREASURY_SECRET_KEY is not set` | `.env` not loaded or value empty | Check `backend/.env`, restart the backend |
| Deposit confirms on-chain but no credit | Deposited from a different wallet than the login | Use the same wallet; check for a `NEEDS MANUAL REVIEW` ledger row |
| Airdrop returns `429` | Faucet rate limit | Wait, or use https://faucet.solana.com |
| Withdrawal fails with a fee error | Treasury has no SOL | Airdrop to the treasury address |
| Random RPC `429` / dropped socket | Public RPC rate limits | Switch to a free Helius or QuickNode devnet endpoint |
| Treasury balance vanished | Devnet reset, or drained below rent exemption | Re-airdrop; keep a 0.01 SOL buffer |
| `Invalid public key input` | Malformed base58 address | Base58 is case-sensitive and has no `0x` prefix |

---

## Known Constraints

> [!note] Devnet gets reset
> Solana wipes devnet state periodically. The treasury balance goes to zero while Postgres still shows user balances — the ledger and the chain drift apart. On devnet, re-airdrop and reset the database. It's a useful reminder that these are two separate sources of truth that a real deployment must reconcile.

> [!note] Public RPC is rate-limited
> `api.devnet.solana.com` returns `429` under load and drops websocket connections. When it becomes annoying, get a free devnet endpoint from Helius or QuickNode and swap **both** `SOLANA_RPC_URL` and `SOLANA_WS_URL`.

> [!danger] Before real money
> - Move `TREASURY_SECRET_KEY` into KMS / Vault — only `loadTreasuryKeypair` changes
> - Re-evaluate `SOLANA_COMMITMENT=confirmed` versus `finalized`
> - Replace the in-process withdrawal queue with a distributed lock
> - Never reuse a devnet keypair on mainnet
> - Legal review per the compliance note in [[00-Overview]]

---

## Related Docs
- [[00-Overview]] — architecture principles, stack, roadmap, compliance
- [[01-Auth-Wallet-Connect]] — the sign-in specification this guide walks through
- [[02-Deposit-Withdraw]] — treasury model, deposit detection, withdrawal rules
- [[03-Escrow]] — bet locking, settlement, fee model
- [[07-Local-Dev-Environment]] — the Postgres container
- [[05-Progress-Log]] — dated decision changelog
