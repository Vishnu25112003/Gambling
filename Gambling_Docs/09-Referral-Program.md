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
- **% Complete:** 100% of the reward loop, including the anti-Sybil payout gate — built, tested and verified end-to-end. Two items remain open and are both product decisions rather than missing plumbing: a per-referral commission cap, and an admin surface for `commissionBps`.
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
3. The anti-Sybil gate runs: the invited player must have deposited at least `REFERRAL_MIN_DEPOSIT_SOL` on-chain **and** wagered at least `REFERRAL_MIN_WAGERED_SOL`. If either is unmet the referral stays `pending` and the withholding is logged — it is never voided.
4. Once the gate clears, 5% of their net profit (`payout − stake`) is credited to the referrer's `availableBalance`, a `referral` ledger row is written, and the referral flips to `earned` — terminal.
5. Every later win pays nothing. One reward per invited player, ever.

## Where This Lives

```
backend/src/referral/
  ├── constants.ts        # REFERRAL_COMMISSION_BPS = 500, Crockford alphabet
  ├── referralCode.ts     # generateCode, ensureReferralCode, normalise/validate
  ├── bindReferral.ts     # attribution + eligibility rules
  ├── awardReferral.ts    # the settlement hook — where the money moves
  ├── payoutEligibility.ts # anti-Sybil: deposit + wagering gate on the PAYOUT
  ├── referral.routes.ts  # /api/referrals
  └── index.ts
backend/src/escrow/settleMatch.ts    # calls awardReferralOnWin per participant
backend/src/auth/auth.routes.ts      # optional referralCode on /auth/verify
backend/tests/referral.test.ts       # 29 tests against real PostgreSQL

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
[x] Anti-Sybil beyond one-referrer-per-account — payoutEligibility.ts
    - Gates the PAYOUT, not the bind: attribution stays instant, only money waits
    - Deposit + wagering thresholds, per-environment via REFERRAL_MIN_*_SOL
    - A failed gate leaves the referral `pending`, never void
[ ] Cap the commission per referral — see Open Questions. The gate bounds the
    cost of ENTERING the program, not the size of a single payout.
[ ] Admin surface for adjusting commissionBps (not needed on devnet)
```

## Reference

**API**

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/referrals/me` | required | Code, link, stats, friends list, `payoutRequirements` — everything the page renders |
| `POST /api/referrals/claim` | required | Apply a code manually; body `{ code }` |
| `GET /api/referrals/code/:code` | public | Confirm a link resolved; returns a display name only |

`POST /api/auth/verify` additionally accepts an optional `referralCode` and returns `referralApplied: boolean`.

Each entry in `/me`'s `friends` array carries `unlocked: boolean` — whether that friend has cleared the payout thresholds, so their next win pays. Deliberately one bit: a referrer learns the reward is live, never how much their friend deposited or wagered. The page renders three states from it — `paid`, `awaiting first win` (unlocked, waiting on a win) and `getting started` (not yet qualified) — because collapsing the last two is exactly what makes a withheld commission look like a bug.

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
- **A payout requires real money at risk.** The invited player must have deposited `REFERRAL_MIN_DEPOSIT_SOL` (confirmed on-chain) and wagered `REFERRAL_MIN_WAGERED_SOL`. Devnet defaults: 0.05 and 0.1 SOL. Either at `0` switches that half off — the documented per-environment kill switch, and what the existing commission tests run under so they keep testing what they claim to.
- **The gate is on the payout, never the bind.** Attribution is instant and generous; only the money waits. Gating the bind would mean an honest referral silently failing at sign-in, which is unrecoverable — the eligibility window closes at the player's first game.
- **Withheld is not void.** A referral that fails the gate stays `pending` and pays on the next win once the player qualifies. Nothing expires.

**Why the payout lives in escrow, not in a game module**

The games registry is still empty, and [[00-Overview]] principle #2 forbids a game from touching a balance. Putting the hook in `settleMatch` means the commission works the day the first game ships, with no per-game code and no way for a game author to forget it.

**Why a threshold and not identity detection**

Funding-source clustering, IP and timing heuristics are guesses, and a wrong guess here silently refuses money to an honest player who is never told why. A threshold can be stated up front, applies identically to everyone, and is checked against facts already in the ledger. It does not try to prove who someone is — it makes the farm unprofitable whoever runs it.

The wagering half is the one that bites: every pooled wager already pays the platform 5% of the pot, so requiring turnover before paying a 5% commission means the house has collected rake on that turnover first. The deposit half closes the hole wagering alone leaves, since turnover can be manufactured from balance that never came from outside the system — a promo credit, or a commission earned by an earlier ring member. Requiring confirmed on-chain SOL means every new mouth in a Sybil ring costs its operator real funds and real network fees.

Deposits are summed, never netted against withdrawals. The question is "did real money ever enter", which withdrawing later does not undo — and netting would hand an attacker the dodge in reverse: deposit, qualify, withdraw, and the record of qualifying disappears.

**Treasury note**

In a `solo_vs_house` match where the player wins more than the pot, `feeCollected` is already zero and the commission comes straight out of treasury float. That is what house-funded means. It is bounded — one payout per invited player — but it is real outflow, and it is the reason [[02-Deposit-Withdraw]]'s float needs watching once games are live.

## Open Questions
- **Sybil resistance — addressed, with one gap left.** The two-wallet farm (invite yourself from a second wallet, collect 5% of your own first win) is now unprofitable rather than merely inconvenient: `payoutEligibility.ts` withholds the commission until the invited wallet has deposited real SOL and wagered enough that the rake already collected exceeds what the referral pays. The one-referrer-per-account index and the self-referral CHECK still handle the trivial version.
  **The remaining gap is payout size, not entry cost.** The gate bounds what it costs to enter the program; it does not bound a single commission. A high-multiplier `solo_vs_house` win turns a small stake into a large net profit, and 5% of that can exceed the rake collected on the required turnover — so a farmer who gets lucky once still comes out ahead. The fix is a per-referral cap (a maximum commission, or a multiple of the friend's turnover), which is cheap to add but changes the payout economics enough to want a product decision first. **Size the thresholds against the cap before real-money mode**, and raise both well above the devnet defaults.
- Threshold values are per-environment env vars, so tuning them needs a redeploy rather than a toggle. Fine until there is an admin surface (below) to hold them.
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
