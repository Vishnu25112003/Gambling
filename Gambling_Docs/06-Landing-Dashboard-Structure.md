# Landing Page & Dashboard Structure

## One-Line Summary
Defines the two main pages of the site — the public landing page and the authenticated-feel dashboard — and how a user moves between them.

## Overview
The site has two layers. The **landing page** is public, static-feeling, and needs no wallet connection — it's marketing/info content meant to convince someone to click in. The **dashboard** is where actual gameplay lives — games list, profile, leaderboard, wallet balance, history. A user can *enter* the dashboard freely without connecting a wallet; they're only asked to connect when they try to do something that needs identity (play a game, deposit, view profile/wallet/history).

**Dependency note:** The UI shell (layout, components, navigation) for both pages has **no dependency** on `01-Auth-Wallet-Connect.md` — it can be built right now with mock/placeholder data. Only the *real* functionality (actual wallet connecting, real balance/profile/history data) depends on `01` being built. This page can be developed in parallel with backend work, not after it.

## Status
- **Phase:** Planning — structure defined, not yet coded
- **% Complete:** 0%
- **Depends on:** Nothing, for the UI shell. `01-Auth-Wallet-Connect.md` only for real wallet functionality (not for layout/structure).

## How It Works (Flow)

**Landing Page (public, no wallet needed):**
1. User lands on the site
2. Sees: **Hero section** (main pitch/branding)
3. Sees: **Game previews** — cards for each game, including placeholder "Coming Soon" cards for games not yet built
4. Sees: **Leaderboard teaser** — a small preview of top players (pulls from the same leaderboard data the dashboard uses, just fewer entries)
5. Clicks the **CTA button** → navigates straight into the Dashboard (no wallet-connect gate at this step)

**Dashboard (enter freely, wallet prompted only on action):**
1. User arrives at the dashboard — no login required to look around
2. **Games list** and **full leaderboard** are visible immediately (public data, no identity needed)
3. **Profile**, **Wallet Balance**, and **Transaction/Game History** sections show a **"Connect Wallet to view"** placeholder instead of content, since there's no identity yet
4. If the user clicks **"Play"** on a game, or clicks into a gated section → triggers the Connect Wallet flow (same one defined in `01-Auth-Wallet-Connect.md`)
5. Once connected, gated sections populate with real data; the placeholder is replaced permanently for that session

## Where This Lives
*(Proposed folder layout — rename freely once real coding starts)*
```
/frontend/pages/
  ├── Landing.jsx
  └── Dashboard.jsx
/frontend/components/
  ├── landing/
  │   ├── Hero.jsx
  │   ├── GamePreviewCard.jsx
  │   └── LeaderboardTeaser.jsx
  ├── dashboard/
  │   ├── GamesList.jsx
  │   ├── LeaderboardFull.jsx
  │   ├── ProfilePanel.jsx
  │   ├── WalletBalancePanel.jsx
  │   ├── TransactionHistoryPanel.jsx
  │   └── ConnectWalletPlaceholder.jsx   → reused across all 3 gated sections
  └── shared/
      └── ConnectWalletButton.jsx        → same component referenced in 01-Auth-Wallet-Connect.md
```

## Implementation Plan (TODO)

```
[ ] Build Landing page shell
    - Hero section (static content/branding, no data dependency)
    - Game preview cards — pull from Games Index list (04-Games-Index.md) once games exist; show "Coming Soon" placeholders until then
    - Leaderboard teaser — top N entries, can use mock data until real leaderboard data exists
    - CTA button — routes to /dashboard, no gating

[ ] Build Dashboard shell/layout
    - Navigation between Games List, Profile, Leaderboard, Wallet, History sections
    - Games List and Leaderboard render immediately with public/mock data — no wallet check needed
    - This can be built and visually tested entirely with dummy data before backend exists

[ ] Build ConnectWalletPlaceholder component
    - Generic reusable component: shows a message + Connect Wallet button in place of real content
    - Used identically across Profile, Wallet Balance, and History sections — one component, not three custom ones
    - Once wallet-connect succeeds, real data replaces this component for that section

[ ] Wire "Play" button gating
    - Clicking Play on any game checks connection state
    - Not connected → triggers Connect Wallet flow first
    - Connected → proceeds into the game normally

[ ] Wire real data once backend exists
    - Replace mock leaderboard/games list with real API calls
    - Replace ConnectWalletPlaceholder content with real profile/balance/history data post-connection
    - This step depends on 01-Auth-Wallet-Connect.md, 02-Deposit-Withdraw.md, and 03-Escrow.md being built
```

## Reference

**Gated sections (require wallet connection to show real content):**
- Profile
- Wallet Balance (+ Deposit/Withdraw panel)
- Transaction/Game History

**Ungated sections (visible without connecting):**
- Games List
- Full Leaderboard
- Everything on the Landing Page

**Shared component:** `ConnectWalletPlaceholder` — one component, reused across all gated sections, rather than custom-building the "please connect" message three separate times.

## Open Questions
- Visual/branding design (colors, layout details, styling) not yet decided — that's a separate design pass, not a structural one.

## Last Updated
2026-08-14 — Initial version, written after landing/dashboard flow discussion.
