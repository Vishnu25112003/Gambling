# Deposit & Withdraw

## One-Line Summary
Handles how real SOL moves between a user's wallet and the platform — currently via a single treasury wallet, no smart contract.

## Overview
This is Option A of the deposit/withdraw design: a single backend-held wallet (the "treasury") receives and sends SOL on behalf of every user. There's no custom Solana program here — just plain wallet-to-wallet transfers. The backend's job is to watch for incoming money, match it to the right user, and keep the database balance in sync. This is the only part of the whole hub that actually touches the blockchain.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 0% — designed, not yet coded
- **Depends on:** `01-Auth-Wallet-Connect.md` (a user must exist/be identified before their deposit can be credited)

## How It Works (Flow)

**Deposit:**
1. User's connected wallet sends SOL directly to the platform's treasury address
2. Backend has a live websocket subscription watching the treasury address — it gets notified the instant a transaction arrives (not polling every few seconds)
3. Backend reads the **sender's wallet address** from that incoming transaction
4. Backend matches sender address → finds the corresponding user in the database (wallet address is unique-indexed, from `01`)
5. Once the transaction reaches **`confirmed`** level (not `finalized` — faster, tiny accepted risk), backend credits that user's `availableBalance`
6. A ledger entry is logged for this deposit

**Withdraw:**
1. User requests a withdrawal amount from their dashboard
2. Backend checks their `availableBalance` covers the requested amount *(insufficient — see Open Questions: a reserved stake is not yet excluded, so a withdrawal can currently drain funds already committed to a pending match)*
3. Backend signs a transfer **from treasury → user's wallet address**, for (amount − network fee) — the user absorbs the small network fee, not the house
4. Backend waits for transaction confirmation
5. On success, backend debits the user's `availableBalance` and logs the withdrawal
6. Withdrawals are processed one at a time per user (serialized) to prevent a double-withdraw race condition

## Where This Lives
*(Proposed folder layout — rename freely once real coding starts)*
```
/backend/wallet/
  ├── treasury.js           → holds/loads the treasury keypair (env var for dev, secrets manager later)
  ├── depositListener.js    → websocket subscription + sender-matching logic
  ├── withdraw.js           → withdrawal endpoint + transfer signing
/backend/prisma/
  └── schema.prisma         → LedgerEntry model defined here (see Reference)
```

## Implementation Plan (TODO)

```
[ ] Set up treasury wallet keypair (Devnet)
    - Generate a Solana keypair for the treasury
    - Store the private key in an env var for dev — a real secrets manager will replace this before any real-money phase
    - This single wallet holds all pooled user funds during this phase

[ ] Build websocket deposit listener
    - Subscribe to the treasury address using Solana's websocket log/account subscription (not polling)
    - On each incoming transaction, extract the sender's wallet address
    - Look up that address in the User table
    - EDGE CASE: if the sender address doesn't match any known user, do NOT silently drop the funds — flag it for manual review/logging instead

[ ] Build deposit crediting logic
    - Wait for "confirmed" status on the transaction (not "finalized")
    - Credit the matched user's availableBalance by the deposit amount
    - Write a ledger entry: txSignature (unique-indexed — prevents crediting the same transaction twice), senderAddress, userId, amount, status, timestamp

[ ] Build withdrawal request endpoint
    - Input: userId, amount
    - Validate: amount > 0 AND amount <= user's current availableBalance
    - Reject if either check fails, with a clear error message

[ ] Build withdrawal signing + broadcast
    - Backend signs a transfer: treasury -> user's wallet address
    - Amount sent = requested amount MINUS the Solana network fee (user absorbs the fee)
    - Broadcast the transaction, wait for confirmation

[ ] Build withdrawal debit + logging
    - On confirmed success: debit user's availableBalance
    - Write a ledger entry: txSignature, userId, amount, status, timestamp
    - On failure: do NOT debit balance, log the failure for review

[ ] Add per-user withdrawal serialization
    - Prevents a user from submitting two withdrawal requests at the same instant and draining more than their real balance
    - Use a Postgres transaction (`SELECT ... FOR UPDATE` row lock, or Prisma's `$transaction`) with the balance check baked into the same transaction, not a separate read-then-write
```

## Reference

**LedgerEntry Model (PostgreSQL via Prisma)**
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `txSignature` | String | Unique, indexed — the Solana transaction signature, prevents double-processing |
| `userId` | UUID | Foreign key → User.id |
| `type` | Enum | `deposit` or `withdrawal` |
| `amount` | Decimal | `NUMERIC` type, in SOL |
| `senderAddress` | String | Only populated for deposits, nullable |
| `status` | Enum | `pending`, `confirmed`, `failed` |
| `timestamp` | DateTime | |

```prisma
enum LedgerType {
  deposit
  withdrawal
}

enum LedgerStatus {
  pending
  confirmed
  failed
}

model LedgerEntry {
  id             String       @id @default(uuid())
  txSignature    String       @unique
  userId         String
  user           User         @relation(fields: [userId], references: [id])
  type           LedgerType
  amount         Decimal      @db.Decimal(20, 9)
  senderAddress  String?
  status         LedgerStatus
  timestamp      DateTime     @default(now())
}
```

**Rules Locked**
- Confirmation level for crediting: `confirmed` (not `finalized`)
- Detection method: websocket subscription (not polling)
- Withdrawal network fee: deducted from the user's payout
- No smart contract / on-chain program involved in this phase — plain System Program transfers only

## Open Questions
- **Withdrawal must exclude reserved stakes, and does not.** `10-Game-Common-Rules.md` Rule 4 reserves a player's stake at match creation, before escrow locks anything. The withdrawal check above tests `availableBalance` alone, so a player with a published match or an outstanding rematch offer could withdraw the very funds that reserve is holding — reintroducing the confirm-time lock failure the reserve exists to prevent. Blocked on the `reservedBalance` field tracked in `03-Escrow.md`; once it exists, the withdrawal validation must subtract it.
- ~~None currently — this layer is locked for the dev/testnet phase.~~ No longer true: the reserved-stake requirement above reopened it.

## Last Updated
2026-08-19 — Reopened: withdrawal validation must exclude reserved stakes once `reservedBalance` exists (Rule 4, `10-Game-Common-Rules.md`). The layer is no longer fully locked.
2026-08-14 — Initial version, written after deposit/withdraw flow discussion.
