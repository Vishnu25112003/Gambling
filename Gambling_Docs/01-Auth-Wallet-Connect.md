# Auth & Wallet Connect

## One-Line Summary
Handles how a user logs in and how their identity is created — via wallet-connect only, no email/password/OAuth.

## Overview
There's no traditional signup form here. A user proves who they are by connecting their Solana wallet (Phantom/Solflare) and signing a message. That signature becomes their login. Their wallet's public address becomes their permanent identity in the system — but internally, we still give them our own generated ID so the rest of the app (games, escrow, DB references) never has to work with long wallet addresses directly.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 0% — designed, not yet coded
- **Depends on:** Nothing (this is the first layer to build)

## How It Works (Flow)
1. User clicks **"Connect Wallet"** on the site
2. Their wallet extension (Phantom/Solflare) pops up asking to connect
3. Backend sends a message for the wallet to **sign** (this proves they own the address — they're not just typing it in)
4. Wallet signs the message, sends the signed proof back
5. Backend **verifies the signature** matches the claimed wallet address
6. Backend checks: does a user with this wallet address already exist?
   - **Yes** → log them in, load their existing account
   - **No** → create a new user record with this wallet address
7. Backend issues a session/JWT tied to the **internal user ID** (not the wallet address directly)
8. User is now "logged in" — dashboard sections that need identity (profile, wallet balance, history) unlock; sections that don't (games list, leaderboard) were already visible

## Where This Lives
*(Proposed folder layout — rename freely once real coding starts)*
```
/backend/auth/
  ├── walletAuth.js       → generates sign-in message, verifies signature
  ├── authMiddleware.js   → protects routes that need a logged-in user
/backend/prisma/
  └── schema.prisma       → User model defined here (see Reference below)
/frontend/components/
  └── ConnectWalletButton.jsx → reusable button, used on landing CTA + dashboard gated sections
```

## Implementation Plan (TODO)

```
[ ] Build "Connect Wallet" button (frontend, reusable component)
    - Used in 2 places: landing page CTA, and any gated dashboard section (profile/wallet/history)
    - Triggers wallet extension popup (Phantom/Solflare adapter)

[ ] Build sign-in message generation (backend)
    - Backend generates a one-time message/nonce for the wallet to sign
    - Nonce prevents replay attacks (someone reusing an old signature)
    - OPEN QUESTION: exact nonce strategy (random string + short expiry?) not yet decided — see below

[ ] Build signature verification endpoint
    - Takes: wallet public address + signed message
    - Verifies the signature actually matches that address using Solana's verification method
    - If invalid → reject login attempt

[ ] Build user lookup/creation by wallet address
    - Query User table by walletAddress (unique indexed column) via Prisma
    - If found → return existing user's internal ID
    - If not found → create new User row, internal ID auto-generated (UUID)

[ ] Build session/JWT issuance
    - JWT payload contains internal user ID only — never the wallet address as the primary claim
    - Used by frontend to stay "logged in" across page loads

[ ] Build auth middleware
    - Protects routes/socket events that require a logged-in user (deposit, withdraw, bet placement, profile, history)
    - Public routes (landing page, games list, leaderboard) skip this middleware entirely

[ ] Wire up "Connect Wallet to view" placeholder
    - Applies to: Profile, Wallet Balance, Transaction History sections in the dashboard
    - Shown instead of content when no valid session exists
    - Clicking it triggers the same Connect Wallet flow as the landing CTA
```

## Reference

**User Model (PostgreSQL via Prisma)**
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Internal primary key, used everywhere else in the app |
| `walletAddress` | String | Unique, indexed — the user's Solana public address |
| `availableBalance` | Decimal | `NUMERIC` type — no float rounding errors on SOL amounts. Defined fully in `02-Deposit-Withdraw.md` / `03-Escrow.md` |
| `lockedBalance` | Decimal | `NUMERIC` type. Defined fully in `03-Escrow.md` |
| `createdAt` | DateTime | |
| `lastLogin` | DateTime | |

```prisma
model User {
  id               String   @id @default(uuid())
  walletAddress    String   @unique
  availableBalance Decimal  @default(0) @db.Decimal(20, 9)
  lockedBalance    Decimal  @default(0) @db.Decimal(20, 9)
  createdAt        DateTime @default(now())
  lastLogin        DateTime?
}
```
*(Decimal precision `20,9` covers SOL's 9 decimal places safely.)*

**Rules**
- Private keys **never** touch the backend or database — the wallet extension signs everything on the user's side
- Recovery model: the user's own wallet/seed phrase is their recovery method. The platform **cannot** recover a lost wallet — this is an accepted tradeoff of wallet-connect auth, not a bug to fix later

## Open Questions
- Exact nonce/message format for the sign-in challenge (random token + short expiry window) — needs to be decided before this gets built, to prevent signature replay attacks

## Last Updated
2026-08-14 — Initial version, written after auth flow discussion.
