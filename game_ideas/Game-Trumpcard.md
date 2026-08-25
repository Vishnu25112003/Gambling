# Trumpcard

## One-Line Summary
A 52-card stat-battle game (Top Trumps style) for 2-4 players — compare a chosen stat across all active players' top cards, highest value takes the rest; most cards when time runs out (or last one standing) wins.

## Overview
Each player holds an equal-sized pile of cards, each with 6 stats. Whoever leads a round picks a stat from their top card; every active player's top card is compared on that stat, and the single highest value takes everyone else's card for that round. The round winner leads next. Play continues until the host's chosen timer runs out or only one player has cards left. Payout scales by how many players the match started with — same model as Ludo.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 0% — designed, not yet coded
- **Game Type:** Multiplayer, variable player count (2/3/4) — same variable-payout exception pattern as Ludo, **not** a fixed 1v1/multiplayer type per Rule 2
- **Contract Status:** Off-chain only — uses the shared escrow layer
- **Depends on:** The same Rule 2 exception and Rule 4 multiplayer extension already flagged for Ludo — if those haven't been pasted into `010-Game-Common-Rules.md` yet, this game needs them too (no new common-rule text required beyond that)

## How It Works (Flow)

### Match Setup
1. Player enters Trumpcard → sees already-hosted open lobbies, plus a **"Create New Game"** option
2. Create → host chooses **Random Play** or **Friends Play** (Rule 4, multiplayer-extended)
3. Host chooses player count: **2, 3, or 4**
4. Host chooses **cards per player** — must be equal across all players, up to the max the 52-card deck allows for that count:
   - 2 players: up to 26 each
   - 3 players: up to 17 each (51 of 52 used, 1 unused)
   - 4 players: up to 13 each (all 52 used)
   - Host can choose a smaller equal split too (e.g. 10 each for a faster match)
5. Host chooses match **duration** (10 min, 15 min, etc.)
6. Host chooses **Fixed Bet Mode** or **Free Bet Mode** (Rule 3) and fills in the amount
7. **Random Play:** hosted publicly, waits until all chosen slots filled. **Friends Play:** room code generated + share option, same full-lobby requirement.
8. Match starts → all players' bet amounts locked via `lockBalance()`

### Gameplay
1. System **randomly picks the first leader**
2. Leader has **10 seconds** to pick a stat category from their top card
   - No pick within 10 sec → counts as a **skip**, leader loses 1 life (see Lives System below)
3. **All active players'** top cards are compared on the chosen stat at once
4. **Single highest value** takes every other active player's card for that round, adding them to the back of their own pile
5. **Tie** (two or more players share the highest value): those tied cards go into a **shared pool** — whoever wins the **next** round takes the pool **in addition to** that round's normal spoils
6. The round's winner becomes the new leader
7. **Elimination (0 cards):** any player whose pile hits 0 cards is eliminated immediately; remaining players continue
8. Match continues until the timer runs out, or only one player has cards remaining

### Lives & Disconnect System (combined, same pattern as Mine Catcher)
- Each player starts the match with **3 lives**
- A life is lost when **either**:
  - **Stat-choice skip:** leader doesn't pick a stat within the 10-second timer, or
  - **Disconnect-timeout:** disconnects and fails to reconnect within the standard escrow 15-second grace period
- Losing all **3 lives** → that player is **eliminated immediately**
- **Cards in an eliminated-by-lives player's pile are discarded entirely** — removed from play, not redistributed to anyone (different from natural 0-card elimination, where there's simply nothing left to redistribute)

### Match End & Payout
1. Match ends when the timer runs out, or only one player remains with cards
2. **Ranking:** eliminated players (via either 0 cards or lost lives) are ranked by **elimination order** — earlier eliminated = lower placement. Any players still active at time-up are ranked by **card count held** (more = higher placement)
3. **Payout** (after Rule 1's 5% fee) — scales by the match's **original** player count, same as Ludo:
   - 2 players: winner takes 100%
   - 3 players: top 2 paid, 70/30
   - 4 players: top 3 paid, 50/30/20
4. Leaderboard displayed (multiplayer matches)
5. All players' profiles updated: win/loss/earnings history

## Where This Lives
*(Proposed folder layout — rename freely once real coding starts)*
```
/backend/games/trumpcard/
  ├── matchSetup.js        → player count, card-split, duration, bet mode, lobby/room-code logic
  ├── deckEngine.js        → deck split, pile tracking, tie-pool tracking
  ├── roundEngine.js       → stat-choice timer, multi-player comparison, round resolution
  ├── livesSystem.js       → 3-lives tracking (stat-skip + disconnect combined)
  └── matchResult.js       → elimination-order + card-count ranking, triggers settlement
/frontend/games/trumpcard/
  ├── TrumpcardSetup.jsx     → host setup screen (players, card count, duration, bet mode)
  ├── TrumpcardBoard.jsx     → card piles, stat-choice UI, comparison reveal, timers
  └── TrumpcardResult.jsx    → match result + leaderboard screen
```

## Implementation Plan (TODO)

```
[ ] Build lobby browser + create flow
    - List already-hosted open lobbies for this game
    - Create New Game → Random/Friends Play selector, player count (2/3/4)
    - Cards-per-player input, validated against the max for that player count
    - Match duration selector, bet mode selector (Rule 3) + amount

[ ] Build lobby-fill gating
    - Random Play: publish publicly, block start until all chosen slots filled
    - Friends Play: room code + share, same full-lobby requirement

[ ] Build deck split + deal
    - Shuffle 52-card deck, deal equal piles per player per the chosen count
    - Unused cards (if any) removed from this match entirely

[ ] Build round engine
    - Track current leader, 10-sec stat-choice timer
    - On timeout: skip counted, decrement leader's life, pass leader role per normal rules
    - On pick: compare that stat across all active players' top cards
    - Determine single highest value; move all other active players' top cards to winner's pile (back of pile)
    - Handle ties: move tied cards into a shared pool, carry pool forward until a non-tied round resolves it

[ ] Build elimination handling
    - 0 cards → eliminate that player immediately, record elimination order
    - 3 lives lost → eliminate that player, discard their remaining pile entirely (do not redistribute)
    - Remove eliminated players from subsequent round comparisons

[ ] Build lives system
    - Track 3 lives per player
    - Stat-choice timeout (10 sec) OR failed disconnect-reconnect (15 sec) → decrement 1 life
    - 0 lives → trigger elimination-by-lives path (discard pile)

[ ] Build match-end detection
    - Trigger at timer expiry OR when only one player has cards remaining
    - Rank eliminated players by elimination order; rank remaining active players by card count held

[ ] Build settlement
    - Determine paid places by ORIGINAL player count (1 for 2p, 2 for 3p, 3 for 4p)
    - Apply percentage split (100 / 70-30 / 50-30-20)
    - Call settleMatch() with ranked results
    - Update leaderboard + all players' win/loss/earnings history
```

## Reference

**Card-per-player limits**
| Players | Max Cards Each | Deck Used |
|---|---|---|
| 2 | 26 | 52 (full) |
| 3 | 17 | 51 (1 unused) |
| 4 | 13 | 52 (full) |

**Timers**
| Timer | Duration | On Timeout |
|---|---|---|
| Leader stat-choice | 10 seconds | Counts as 1 lost life |
| Disconnect reconnect | 15 seconds (standard escrow, reused) | Counts as 1 lost life |

**Payout by player count** (after Rule 1's 5% fee) — same scaling as Ludo
| Players | Paid Places | Split |
|---|---|---|
| 2 | 1 (winner only) | 100% |
| 3 | 2 | 70% / 30% |
| 4 | 3 | 50% / 30% / 20% |

**Escrow/Rules tie-in**
- Uses `lockBalance()`, `settleMatch()` from `03-Escrow.md` — but **overrides** the generic disconnect/forfeit behavior with this game's own combined 3-lives system (same override pattern as Mine Catcher)
- Payout **does not** follow Rule 2's fixed-top-2 rule — relies on the same exception documented for Ludo
- Random/Friends Play relies on the multiplayer extension to Rule 4, also documented for Ludo
- Bet mode follows Rule 3

## Open Questions
- None currently — this game's flow is fully locked.

## Last Updated
2026-08-15 — Initial version, written after full Trumpcard flow discussion including the multiplayer lives system.
