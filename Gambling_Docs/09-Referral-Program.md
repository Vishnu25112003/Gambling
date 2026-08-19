---
tags:
  - referral
  - invite
  - growth
  - escrow
created: 2026-08-17
status: implemented
---

# Referral Program — Invite & Earn

## One-Line Summary
A player shares an invite link; the friend who signs up through it is bound to them permanently; the first time that friend **wins** a match, the referrer is credited 5% of the friend's net profit on it, paid by the house.

## Overview
This is the hub's only growth loop, and it is deliberately the smallest one that works: one reward, per invited player, ever. It exists because [[06-Landing-Dashboard-Structure]]'s design handoff shipped an "Affiliates" sidebar section and an "Invite & Earn" card promising a referral program that had no backend behind it at all.

The reward is funded entirely by the platform. The referred player's stake, payout and balance are untouched — they never pay for having been invited, and they are never told a different number than they won. Every commission is a `referral` row in the ledger, so the platform's true revenue is `sum(fee) − sum(referral)` and both halves are auditable.

**Correction to the shipped design copy.** The mock's text read *"Earn 5% of every bet your invited friends make."* That could not ship as written: the platform fee is itself 5% of the pot ([[10-Game-Common-Rules]], Rule 1), so paying a referrer 5% of every bet would hand away the entire rake and leave the house running at exactly zero on every pooled game a referred player touched. The live rule pays 5% of **net profit**, **once**, on the friend's **first winning** match. Both the sidebar card and the nav copy were updated to match.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 100% — built, tested and verified end-to-end
- **Depends on:** [[01-Auth-Wallet-Connect]] (attribution happens at sign-in) and [[03-Escrow]] (the payout fires from `settleMatch`)

## How It Works (Flow)

**Getting the link:**
1. Every account is minted with an 8-character invite code at signup. Accounts created before this doc get one lazily, the first time they open the page.
2. The Invite & Earn page shows `http(s)://<domain>/?ref=<CODE>`, a Copy button, share buttons for X and Telegram, and the bare code for reading aloud.

**Attribution (once, permanently):**
1. A visitor opens `/?ref=CODE`. The code is validated client-side, stashed in `localStorage`, and stripped from the address bar so it does not ride along into links they share next.
2. The landing page confirms the link resolved — *"Alice invited you"* — so the visitor can see it registered before they own an account.
3. They connect a wallet and sign in. The stored code rides along on `POST /api/auth/verify`.
4. The server binds them **if eligible**: no existing referrer, and `gamesPlayed = 0`.
5. A binding failure never blocks sign-in. A stale, self-referring or already-used code is logged and ignored.

**Earning:**
1. The referred player plays. Nothing happens on a loss, a draw, or a refund — the referral simply stays `pending`.
2. The first match they finish in profit, `settleMatch` calls `awardReferralOnWin` inside its own transaction.
3. 5% of their net profit (`payout − stake`) is credited to the referrer's `availableBalance`, a `referral` ledger row is written, and the referral flips to `earned` — terminal.
4. Every later win pays nothing. One reward per invited player, ever.

## Where This Lives

```
backend/src/referral/
  ├── constants.ts        # REFERRAL_COMMISSION_BPS = 500, Crockford alphabet
  ├── referralCode.ts     # generateCode, ensureReferralCode, normalise/validate
  ├── bindReferral.ts     # attribution + eligibility rules
  ├── awardReferral.ts    # the settlement hook — where the money moves
  ├── referral.routes.ts  # /api/referrals
  └── index.ts
backend/src/escrow/settleMatch.ts    # calls awardReferralOnWin per participant
backend/src/auth/auth.routes.ts      # optional referralCode on /auth/verify
backend/tests/referral.test.ts       # 19 tests against real PostgreSQL

frontend/src/pages/dashboard/InviteEarn.tsx   # the page
frontend/src/lib/referralCapture.ts           # ?ref= capture + localStorage
frontend/src/hooks/useReferrals.ts
```

## Implementation Plan (TODO)

```
[x] Schema: User.referralCode (nullable-unique), Referral model, LedgerType.referral
    - NOTE: nullable-unique for the same reason as LedgerEntry.txSignature —
      Postgres treats NULLs as distinct, so no backfill migration was needed
[x] Migration 20260817090000_add_referral_program, with hand-added CHECK constraints
    - referrals_no_self_referral blocks self-referral in the DATABASE, not just in code
[x] generateCode / ensureReferralCode — Crockford base32, crypto.randomBytes
[x] bindReferral — unknown code, self-referral, already-bound, already-played
[x] awardReferralOnWin(tx, ...) called from settleMatch inside its transaction
[x] GET /referrals/me, POST /referrals/claim, GET /referrals/code/:code
[x] Frontend page, ?ref= capture, landing banner, sidebar card enabled
[x] Tests: 19 cases including draw, refund, solo_vs_house, and double-pay
[ ] Anti-Sybil beyond one-referrer-per-account — see Open Questions
[ ] Admin surface for adjusting commissionBps (not needed on devnet)
```

## Reference

**API**

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/referrals/me` | required | Code, link, stats, friends list — everything the page renders |
| `POST /api/referrals/claim` | required | Apply a code manually; body `{ code }` |
| `GET /api/referrals/code/:code` | public | Confirm a link resolved; returns a display name only |

`POST /api/auth/verify` additionally accepts an optional `referralCode` and returns `referralApplied: boolean`.

**Models (PostgreSQL via Prisma)**

```prisma
enum ReferralStatus { pending  earned }

model Referral {
  id             String         @id @default(uuid()) @db.Uuid
  referrerId     String         @db.Uuid
  referredUserId String         @unique @db.Uuid   // one referrer per player, forever
  status         ReferralStatus @default(pending)
  commissionBps  Int            @default(500)      // snapshotted at bind time
  earnedAmount   Decimal        @default(0) @db.Decimal(20, 9)
  matchId        String?        @db.Uuid
  gameType       String?
  createdAt      DateTime       @default(now())
  earnedAt       DateTime?
  @@map("referrals")
}
```

`User` gains `referralCode String? @unique @db.VarChar(12)`.

**Rules Locked**
- **Rate: 5%** (`REFERRAL_COMMISSION_BPS = 500`), of the referred player's **net profit** — not their stake, and not every bet.
- **Trigger: first winning match.** A loss, a draw, or a refund leaves the referral `pending`, never void.
- **One payout per referred player, ever.** `earned` is terminal.
- **Funded by the house.** The pot, the winner's payout and `match.feeCollected` are all exactly what they would have been with no referral in play.
- **Attribution is permanent and one-way.** Enforced by the `referredUserId` unique index; self-referral is blocked by a database CHECK.
- **Eligibility window: before the first settled game.** Nobody can shop for a referrer after discovering they are about to trigger a commission.
- **Rate is snapshotted at bind time.** Changing the platform rate never re-prices a referral already promised.
- **Rounding is DOWN**, in whole lamports via `applyFeeBps`, consistent with the rest of [[03-Escrow]]. A win so small that 5% truncates to zero lamports leaves the referral pending rather than burning it for nothing.

**Why the payout lives in escrow, not in a game module**

The games registry is still empty, and [[00-Overview]] principle #2 forbids a game from touching a balance. Putting the hook in `settleMatch` means the commission works the day the first game ships, with no per-game code and no way for a game author to forget it.

**Treasury note**

In a `solo_vs_house` match where the player wins more than the pot, `feeCollected` is already zero and the commission comes straight out of treasury float. That is what house-funded means. It is bounded — one payout per invited player — but it is real outflow, and it is the reason [[02-Deposit-Withdraw]]'s float needs watching once games are live.

## Open Questions
- **Sybil resistance is weak.** One person with two wallets can invite themselves and farm a small commission off their own first win. The one-referrer-per-account rule and the self-referral CHECK stop the trivial version, but nothing stops the two-wallet version. On devnet, with valueless SOL and a reward capped at 5% of one win, this is acceptable. **It must be revisited before real-money mode** — likely a minimum deposit or a minimum wager before a referral can pay.
- Should the reward expire if the invited friend never wins? Currently a referral can stay `pending` forever. That costs nothing, but it makes "pending" an unbounded liability on paper.
- Multi-level referrals, and a top-referrer leaderboard, are deliberately out of scope.

## Related Docs
- [[11-User-Profiles]] — a player's total referral earnings also surface on their profile, read off the `referral` ledger rows this doc writes
- [[00-Overview]] — architecture principles, especially #2
- [[01-Auth-Wallet-Connect]] — where attribution happens
- [[03-Escrow]] — the settlement this hooks into
- [[10-Game-Common-Rules]] — the platform fee this commission is funded alongside (Rule 1), never skimmed from
- [[06-Landing-Dashboard-Structure]] — the Affiliates section this fills in

## Last Updated
2026-08-18 — Noted that referral earnings now also appear on the profile page ([[11-User-Profiles]]).
2026-08-17 — Initial version, written alongside the implementation.
