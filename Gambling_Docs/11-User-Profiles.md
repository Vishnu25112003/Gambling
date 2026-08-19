---
tags:
  - profile
  - identity
  - stats
  - tiers
  - dashboard
created: 2026-08-18
status: implemented
---

# User Profiles — Identity, Tiers & Statistics

## One-Line Summary
Every player gets a profile page: a username, an uploaded picture, a loyalty tier earned by lifetime volume, and their full playing record — wins, losses, streaks, per-game breakdown and every match they have ever joined — with a read-only public version anyone can open from the leaderboard.

## Overview
Before this, the dashboard had no profile. `/dashboard/profile` redirected to Settings, and Settings was doing double duty: a wallet-address card, three flat stat tiles and a display-name box. There was no way to look at *another* player — clicking a name on the leaderboard did nothing — and nothing anywhere recorded a **win**.

This doc adds two pages and the data behind them:

- **`/dashboard/profile`** — your own, editable. Username, display name, profile picture.
- **`/dashboard/u/:handle`** — anyone's, read-only. Never shows a balance, a deposit, or a full wallet address.

The statistics are deliberately *detailed rather than summary*. A count of games played says almost nothing; what a player wants is the split, the extremes, the streak, and which game they are actually good at. So the profile answers wins/losses/draws, win rate, biggest win, biggest loss, current and best streak, average stake, a per-game table, a 30-day profit curve, and a paginated match history carrying stake, payout and net on every row.

**Built against real queries with no games in existence.** [[04-Games-Index]] is still empty, so every figure is legitimately zero today and every section renders the design's empty state. That was a deliberate choice over stubbing: the queries read `Match`, `MatchParticipant` and `LedgerEntry` for real, so the page is correct from the *first match ever settled* rather than needing a second pass when [[04-Games-Index]] fills in. The identity half — username, avatar — is fully usable right now.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 100% — built, tested and verified end-to-end
- **Depends on:** [[01-Auth-Wallet-Connect]] (a profile is an account), [[03-Escrow]] (every statistic is a settled match), [[06-Landing-Dashboard-Structure]] (the gated-section rules this follows)
- **Tier thresholds:** Locked — defined in this file and only here, per [[00-Overview]] principle #5

## How It Works (Flow)

**Claiming an identity:**
1. A new account has no username and no picture. It is still fully linkable — the public handle falls back to the internal user id, so a leaderboard row always resolves to a profile.
2. The player claims a username: 3–20 characters of lowercase letters, digits and underscore. It is normalised to lowercase on the way in, checked against a reserved list, and unique across the platform.
3. The form checks availability as they type. That check is **advisory only** — two people can be told "available" for the same handle in the same instant, and the unique index decides. The loser gets a readable 409.
4. Once claimed, their profile URL becomes `/dashboard/u/<username>` instead of `/dashboard/u/<uuid>`.

**Uploading a picture:**
1. The player clicks their avatar and picks a PNG, JPEG or WebP up to 2 MB.
2. The server sniffs the **actual magic bytes** — `file.mimetype` is a claim supplied by the caller, not evidence, and a `.txt` renamed `.png` carries `image/png` quite happily.
3. `sharp` applies the EXIF orientation, crops to 256×256 and re-encodes to WebP. Re-encoding is what strips the metadata, so the GPS coordinates in a phone photo do not ship with the avatar.
4. It is written as `<userId>.webp` — a filename derived **only** from the session, never from anything the client sent, so there is no path-traversal surface at all.
5. The stored URL carries a `?v=` counter that increments on every replace. Without it the stable path would keep serving the old image from cache and the upload would look like it silently failed.
6. Removing it deletes the file and reverts to the gradient generated from the wallet address.

**Earning a tier:**
1. Tier is read from `User.totalWagered` — lifetime volume, already maintained exactly by `lockBalance`.
2. It is **computed on every read and never stored**. See *Rules Locked* for why.
3. The profile shows the current badge, the exact amount still needed for the next rung, and the whole ladder with locked rungs visible, so nobody has to play to discover what is ahead.

**Reading the record:**
1. `gamesPlayed`, `gamesWon`, `totalWagered` and `netProfit` are read straight off `users` — escrow maintains them transactionally, alongside the balances they derive from.
2. Everything else is aggregated in SQL over the player's own matches: the split, the extremes, the average, the per-game table, the daily curve, the streaks.
3. Losses are derived by **subtraction** from the authoritative total rather than counted separately, so the parts always sum to the whole instead of two sources disagreeing on screen.

## Where This Lives

*(As shipped)*
```
backend/src/profile/
  ├── tiers.ts            # the ladder — the ONLY place thresholds are defined
  ├── username.ts         # normalise, validate, reserved list, availability
  ├── avatarStore.ts      # multer + sharp + disk; all path/byte handling
  ├── stats.ts            # lifetimeStats, perGameStats, dailyNet, streaks
  ├── history.ts          # matchHistory — one row per match
  ├── profile.routes.ts   # /api/profile
  └── index.ts
backend/src/escrow/settleMatch.ts   # writes gamesWon; forfeit double-count fix
backend/src/escrow/lockBalance.ts   # writes stakeTotal
backend/src/escrow/refundMatch.ts   # unwinds a forfeit's counters on refund
backend/src/auth/auth.routes.ts     # PATCH /me widened; avatar upload/delete
backend/src/lib/user.ts             # publicProfile, userHandle, userLabel
backend/src/app.ts                  # express.static for /uploads
backend/tests/profile.test.ts       # 37 tests against real PostgreSQL

frontend/src/pages/dashboard/Profile.tsx        # own profile
frontend/src/pages/dashboard/PublicProfile.tsx  # /dashboard/u/:handle
frontend/src/components/profile/
  ├── ProfileHeader.tsx    ├── TierBadge.tsx      ├── StatGrid.tsx
  ├── AvatarUploader.tsx   ├── TierProgress.tsx   ├── PerGameTable.tsx
  ├── IdentityForm.tsx     └── ProfitCurve.tsx    └── MatchHistoryTable.tsx
frontend/src/components/shared/Avatar.tsx     # the ONE avatar, now with uploads
frontend/src/components/shared/Sparkline.tsx  # inline SVG, no chart library
frontend/src/hooks/useProfile.ts
frontend/src/hooks/useMatchHistory.ts
frontend/src/lib/gameLabel.ts
```

## Implementation Plan (TODO)

```
[x] Schema: User.username (nullable-unique), User.avatarUrl, User.gamesWon,
    MatchParticipant.stakeTotal, Match index on (status, settledAt desc)
    - NOTE: username is nullable-unique for the same reason referralCode is —
      Postgres treats NULLs as distinct, so no account needed a backfilled handle
[x] Migration 20260818120000_add_user_profiles, with hand-added CHECKs + backfill
    - users_games_won_within_played, users_username_shape (a regex CHECK, because
      a username is a URL segment), participant_stake_total_non_negative
    - stakeTotal backfilled from the `lock` ledger entries, which stay exact even
      for matches whose lockedAmount was already zeroed by settlement
[x] tiers.ts — 5 rungs, exact decimal thresholds, derived on read
[x] username.ts — normalisation, shape, 40-entry reserved list, availability
[x] avatarStore.ts — magic-byte sniffing, 2 MB cap, sharp 256px WebP, ?v= busting
[x] stats.ts — lifetime, per-game, 30-day curve, gaps-and-islands streaks
[x] history.ts — one row per match, status-first result classification
[x] GET /profile/me, /profile/me/history, /profile/:handle, /profile/:handle/history,
    /profile/username/check; PATCH /auth/me widened; POST+DELETE /auth/me/avatar
[x] Leaderboard rows gained handle, tier, avatarUrl and gamesWon
[x] Frontend: both pages, 9 profile components, shared Avatar, Sparkline, 2 hooks
[x] Avatar consolidated from THREE implementations into one
[x] Tier colours as CSS custom properties in both palettes
[x] Tests: 37 cases; plus 96 end-to-end HTTP checks run during the build
[ ] Achievement badges (first win, hot streak, whale) — see Open Questions
[ ] Rakeback or any actual tier BENEFIT — the ladder is currently cosmetic
```

## Reference

**API**

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/profile/me` | required | Identity, tier, stats, per-game and curve — everything the page renders |
| `GET /api/profile/me/history` | required | Paginated match history; `?page&limit` (limit max 100) |
| `GET /api/profile/:handle` | public | Another player's profile — no balances, no full address |
| `GET /api/profile/:handle/history` | public | Their match history |
| `GET /api/profile/username/check?u=` | required | Advisory availability for the form |
| `POST /api/auth/me/avatar` | required | `multipart/form-data`, one file in an `avatar` field |
| `DELETE /api/auth/me/avatar` | required | Revert to the generated gradient |
| `PATCH /api/auth/me` | required | `{ displayName?, username? }` — both optional |

`PATCH /api/auth/me` was previously `displayName`-only and **required**. Both fields are now optional: an omitted key means "leave alone", an explicit `null` means "clear". Without that change, saving a username would have blanked the display name as a side effect.

`GET /api/leaderboard` entries gained `handle`, `tier`, `avatarUrl` and `gamesWon`.

**Models (PostgreSQL via Prisma)**

```prisma
model User {
  // ...
  gamesWon  Int     @default(0)
  username  String? @unique @db.VarChar(20)   // lowercase; CHECK ^[a-z0-9_]{3,20}$
  avatarUrl String? @db.VarChar(255)          // "/uploads/avatars/<id>.webp?v=3"
}

model MatchParticipant {
  // ...
  /// Written at lock time, NEVER reduced. settleMatch zeroes lockedAmount, so
  /// this is the only surviving record of what the player actually staked.
  stakeTotal Decimal @default(0) @db.Decimal(20, 9)
}
```

**The tier ladder**

| Tier | Lifetime wagered | Level |
|---|---|---|
| Bronze | 0 SOL | 1 |
| Silver | 1 SOL | 2 |
| Gold | 10 SOL | 3 |
| Platinum | 50 SOL | 4 |
| Diamond | 250 SOL | 5 |

**Result classification** — the order is load-bearing:

| Condition | Result |
|---|---|
| match or participant `refunded` | `refunded` |
| participant `forfeited` | `forfeited` |
| match still `open` | `open` |
| `payout > stakeTotal` | `won` |
| `payout < stakeTotal` | `lost` |
| otherwise | `draw` |

Status must be checked **before** the amounts are compared, because `refundMatch` sets `payout` to the full stake — so a crash-refund is numerically identical to a draw.

**Rules Locked**

- **Tier thresholds are defined here and only here** ([[00-Overview]] principle #5). `backend/src/profile/tiers.ts` mirrors this table; no route, component or other doc restates a number from it.
- **Tier is derived on every read, never stored.** This is the deliberate opposite of [[09-Referral-Program]]'s `commissionBps`, and the difference is instructive: a commission is a *promise* agreed at bind time, so re-pricing it later would break it. A tier is a *current standing*. Storing it would mean a threshold change silently applied to new players but not old ones, and needed a backfill to correct; deriving it means one edit re-prices everybody at once.
- **A tier is not monotonic.** `refundMatch` decrements `totalWagered` — a refunded match never happened — so a crash-refund can move a player back down a rung. That is correct, and it is why no copy anywhere promises a tier is permanent.
- **A win is finishing in profit**, `payout > stake`, not merely being named in `settleMatch`'s `winners`. A pooled draw returns every stake and pays nobody, and that is a win for no one.
- **Wallet movement is private.** `totalDeposited` and `totalWithdrawn` are omitted from another player's profile — they are wallet facts, not a playing record.
- **A wallet address is not a valid profile handle.** [[01-Auth-Wallet-Connect]]'s board already refuses to publish full addresses, and a URL is more public than a table cell — it lands in browser history, referer headers and shared links. The handle is a username, falling back to the internal id.
- **Money never becomes a float.** Every aggregate is computed in SQL and cast `::text` before it leaves, because the driver adapter does not promise whether a raw `NUMERIC` arrives as a string or a `Decimal`. Every average is wrapped in `ROUND(…, 9)`: Postgres `AVG` divides, and a result with more than 9 decimal places throws in `toDecimal`.
- **`winRate` is null, not zero, for a player who has never finished a match.** "0%" reads as a record of failure nobody has earned.

**Two escrow bugs found and fixed during this work**

Both were pre-existing, both would have made the profile visibly self-contradictory, and both now have regression tests that were confirmed to fail before the fix.

1. **A forfeited player was counted twice.** `forfeitPlayer` debits `netProfit` and increments `gamesPlayed` when the reconnect window closes. `settleMatch` then loops over *every* participant, including forfeited ones, and did both again — so one 1 SOL forfeit recorded two games played and a 2 SOL loss. `settleMatch` now skips the counters for a participant already marked `forfeited`; the money half was always a no-op there, since such a row has `lockedAmount = 0` and is never a winner.
2. **A forfeit followed by a crash-refund never unwound.** `refundMatch` returned the stake and decremented `totalWagered`, but left the `netProfit` debit and the `gamesPlayed` increment from the forfeit in place — so a refunded match "never happened" everywhere except those two counters, permanently. It now restores both.

**Why `stakeTotal` had to exist**

`settleMatch` sets `lockedAmount` to 0. After a match, the participant row therefore cannot answer "what did this player stake" — and without that number there is no win, no loss and no net for any row of match history. The stake did survive inside a `settlement` ledger entry's `meta` JSON, but reconstructing every statistic from a signed ledger sum is slower, and parsing money out of a JSON blob is exactly the kind of thing [[03-Escrow]]'s money discipline exists to avoid. One immutable column, written once at lock time, makes the whole statistics layer a plain typed read.

**Why the streak query is derived rather than stored**

Stored streak counters would need maintaining in three separate escrow files (`settleMatch`, `forfeitPlayer`, `refundMatch`), and once any one of them drifted the number would be wrong forever with no way to recompute it — which is precisely what the two bugs above demonstrate happens in practice. The gaps-and-islands query in `stats.ts` reads the matches themselves and cannot drift. It orders by `(settledAt, id)`; the id tie-break matters, because two matches can settle inside the same millisecond and without a deterministic second key the displayed streak flickers between requests on identical data.

## Open Questions
- **The tier ladder is cosmetic.** It confers a badge and nothing else. The natural next step is a real benefit — rakeback, a fee discount, or priority in a lobby — which is what the unbacked **Rewards** sidebar section ("Rakeback, streak bonuses and seasonal drops") has been promising since the design handoff. Any fee discount would touch [[10-Game-Common-Rules]] Rule 1 and must be specified there, not here.
- **Tier thresholds are guesses.** 1 / 10 / 50 / 250 SOL is a plausible curve on devnet with valueless SOL, but nothing calibrated it against real player behaviour. Worth revisiting once there are games and actual volume to look at.
- **No achievement badges yet.** One-off unlockables (first win, a 5-win streak, a big single bet, first referral earned) would need an `Achievement`/`UserBadge` pair and an award hook. Deliberately out of scope here: the tier ladder had to exist first, and it is derivable from a column that already existed.
- **Avatars are on local disk.** Correct for devnet — no external account, works offline — but a single-host store, so it does not survive a second backend instance or an ephemeral filesystem. Everything that touches a path or a byte is inside `avatarStore.ts`, so moving to S3 means rewriting `saveAvatar`/`removeAvatar` and nothing else. Same shape as [[02-Deposit-Withdraw]]'s treasury note.
- **No image moderation.** Nothing stops somebody uploading an offensive picture, and there is no report or takedown path. Acceptable while the player base is the dev team; not acceptable at launch.
- **Username changes are unlimited and leave no redirect.** Renaming frees the old handle immediately, so an old profile link can silently start resolving to a different person. A cooldown, or reserving a vacated handle for a period, is the usual fix.
- **A username is not a display name.** Both exist, and a player can set them to confusingly different things. That is intentional — one is a URL, one is a label — but it does mean the leaderboard and a profile header can show different text for the same account.

## Related Docs
- [[00-Overview]] — architecture principles, especially #5 (one source of truth per rule)
- [[01-Auth-Wallet-Connect]] — the `User` model a profile describes
- [[03-Escrow]] — every statistic here is a settled match; `stakeTotal` and `gamesWon` are written there
- [[06-Landing-Dashboard-Structure]] — the Profile gated section this fills in
- [[09-Referral-Program]] — referral earnings, surfaced on the profile
- [[10-Game-Common-Rules]] — where a tier *benefit* would have to be specified

## Last Updated
2026-08-18 — Initial version, written alongside the implementation.
