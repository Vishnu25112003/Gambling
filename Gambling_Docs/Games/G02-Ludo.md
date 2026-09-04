# Game 02: Ludo

## Identity
| Field | Value |
|---|---|
| **Game No.** | `02` |
| **Game ID** | `ludo` |
| **Doc file** | `Games/G02-Ludo.md` |
| **Fee Mode** | `Pooled` — every seated player bets into one pot (Rule 1) |
| **Players** | `Multiplayer` — 2, 3 or 4 seats, chosen by the host at creation. **Overrides Rule 2's fixed top-2 payout** — see Reference |
| **Discovery** | `Random + Friends` — Rule 4's two discovery modes, extended by its multiplayer lobby-fill gate (all chosen seats must fill before start). Rematch is not covered for 3+ seats — Rule 4's Rematch path is written for two players only |

## One-Line Summary
Classic 2–4 player Ludo, where the number of paid places scales with how many players actually joined — a deliberate, documented exception to the hub's fixed-top-2 payout rule.

## Overview
Standard Ludo — each player races 4 tokens around the board to get them all home. Unlike the 1v1 games in this hub, a Ludo match seats 2, 3, or 4 players, and both the ranking (by total steps moved, not just who finished) and the payout split scale with that seat count instead of staying fixed. The moment any player gets all 4 tokens home, the match ends — the rest is a race for placement, not for the win.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 100% — backend + frontend implemented, typecheck passes
- **Contract Status:** Off-chain only — uses the shared escrow layer
- **Inherits:** Rule 1 (fee) and Rule 3 (bet mode) of `../10-Game-Common-Rules.md` unchanged. **Overrides Rule 2** via the documented exception added 2026-08-24 — payout scales with seat count instead of the fixed top-2/70-30 split. **Uses Rule 4's multiplayer extension**, also added 2026-08-24 — Random/Friends Play now require every chosen seat filled before start, which is exactly the gate this game needs.

## How It Works (Flow)

### Match Setup
Setup follows Rule 4's Random Play / Friends Play shapes plus its multiplayer extension (the full-lobby gate) — only the parts specific to Ludo are below:

1. Player enters Ludo → sees already-hosted open lobbies, plus a **"Create New Game"** option.
2. Create → host chooses **Random Play** or **Friends Play** (Rule 4). 
3. Host chooses player count: **2, 3, or 4** — this game's seat-count setting, referenced by Rule 4's multiplayer extension as "all chosen slots."
4. Host chooses **Fixed Bet** or **Free Bet** mode (Rule 3) and sets the amount.
5. **Random Play:** the match is listed publicly. **Friends Play:** a room code is generated with a share option.
6. **Free Bet mode:** each joiner is prompted for their own stake (`ludo:stake:required`) before they're added as a participant — matching Rule 3's Free Bet definition exactly ("each player picks their own bet amount when joining"). Declining/closing the prompt is side-effect-free; nothing is locked or reserved yet. Fixed mode has no such prompt — the joiner is bound to the host's amount automatically, as before.
7. Per Rule 4's multiplayer extension, the lobby **must fill all chosen slots** before the match can start — no early start with a partial lobby, even if the host is willing.
8. Once full, players are **automatically assigned colors**:
   - **2 players:** fixed opposite pairing — Red vs Yellow.
   - **3/4 players:** standard four-color assignment (Red, Green, Yellow, Blue). The exact 3-player color subset is still undecided — see Open Questions.
9. Match starts → every seated player's own recorded stake locks via `lockBalance()` (the same amount for everyone in Fixed mode; each player's own chosen amount in Free mode).

### Gameplay
Standard classic Ludo rules:
- Each player starts with 4 tokens in their home yard.
- Rolling a **6** is required to bring a token out of the yard onto the board.
- Tokens move around the board according to each dice roll.
- **Capturing:** landing exactly on an opponent's token on a non-safe square sends that token back to its owner's yard.
- **Safe squares** (starting squares and star squares) protect tokens from capture.
- A token needs an **exact roll** to enter the home triangle at the center.
- Rolling a **6 grants an extra turn**, unless it's the **third consecutive 6** — that forfeits the turn instead (classic house rule).
- **A 6 that has no usable move** (e.g. the player's own start square is already blocked by two of their own tokens) keeps the turn with the same player instead of forfeiting it — they simply roll again. This is distinct from an ordinary non-6 dead roll, which does pass the turn.
- Turn order proceeds in sequence around the assigned colors.

**Turn timer:** each player has **15 seconds to roll** once it becomes their turn, and (after rolling, when more than one token could move) **10 seconds to pick which token to move**. See *Turn Notification* below for how this is presented, and Reference for the exact durations.

### Turn Notification
Ludo is the first game to adopt the hub-wide **Turn Notification** convention — see `../12-Game-UI-Conventions.md` (Rule 1) for the full spec shared by every game. In short: the instant it becomes a player's turn, only *their* screen shows a large centered "Your Turn" popup for 2.5 seconds; the popup then hides and the 15-second roll countdown starts. The server delays arming its own roll timer by the same 2.5 seconds so the countdown never lies about how much time is actually left.

### Lives & Elimination
Unlike most games in this hub, Ludo does **not** use the standard 15-second escrow reconnect-grace disconnect rule as its only stall protection — it layers a **lives system** on top, scoped specifically to missed rolls:
- Every player starts a match with **3 lives**.
- Missing the 15-second roll window (not rolling in time) costs **1 life** — the missed-move 10-second window does not; choosing which token to move is a separate action from rolling and isn't penalized the same way.
- At **0 lives**, the player is **eliminated immediately** — forfeited via the same `forfeitPlayer()` primitive the disconnect path uses, but with no reconnect grace period (they're still connected; there's nothing to wait for). Their tokens stay on the board exactly as a disconnect-forfeit leaves them — uncontrolled, still capturable by everyone else.
- The match continues exactly as a disconnect-forfeit would: turn passes on if it was the eliminated player's turn, and the match settles immediately if only one active player remains.

### Disconnects
For an actual dropped connection (as opposed to running out of lives while still connected), Ludo uses the **standard escrow disconnect rule, unmodified**:
- 15-second reconnect grace period. Failing to reconnect within it triggers `forfeitPlayer()`, confiscating that player's stake into the pot; the match continues with the remaining players.
- A forfeited player's tokens **stay on the board as-is, uncontrolled** — other players can still capture them normally. Nobody rolls or moves on their behalf.
- **`forfeitPlayer()` does not end the match.** With 3+ seats, a forfeit only removes one player from contention — the match keeps running toward a winner among those still seated, and `settleMatch()` still fires at the normal match-end trigger with the forfeited player excluded from the payout.

### Points Economy
Ranking and payout are based on **points**, not raw steps moved:
- **+1 point** per square a token moves (a yard-exit itself is worth 0 — the token hasn't traveled any squares yet, just entered the board).
- **+10 points** to the player who captures a token; **-10 points** to the player whose token was captured.
- **+50 points** the instant a token reaches its final home square.

Points can go negative (a player captured often ends up below zero) — ranking simply sorts by whatever value results, ties handled per Rule 2.

### Match End
1. The match ends **instantly** the moment one player gets all 4 tokens home — that player is 1st place.
2. Every other still-seated player is ranked by **points** (more points = higher rank) — see the *Points Economy* below; `totalSteps` (raw squares moved) is still recorded but is no longer the ranking basis. A forfeited or eliminated player is not ranked and is not paid.
3. **Ties** (equal total steps) → that place's prize share is split evenly between the tied players, per Rule 2's tie handling.
4. **Payout** — Rule 1's 5% fee comes off the pot first, then the split below is applied instead of Rule 2's fixed top-2/70-30 (see Reference for the exact override text):

| Seated players | Paid places | Split |
|---|---|---|
| 2 | 1 (winner only) | 100% |
| 3 | 2 | 70% / 30% |
| 4 | 3 | 50% / 30% / 20% |

5. `settleMatch(matchId, [ranked winners...], [weights...])` is called with as many entries as paid places for that seat count — the game supplies the ranked finishing order, escrow applies the weights.

### Record & Result
- Per-match record: final ranking, each player's total steps moved, and the payout breakdown (stake, pot, 5% fee, net per paid place).
- **Leaderboard shown** — with 3 or 4 players genuinely ranked, this is the one game in the hub where "leaderboard" is the correct word for the result screen, not a 1v1 misnomer.
- Ludo makes no provably-fair claim in its current spec (dice rolls are not commit-revealed like Coin Flip's coin), so no verify affordance is needed unless that changes.
- All seated players' profiles updated: win/loss/earnings history.

## Where This Lives
```
backend/src/games/ludo/
├── index.ts        # default-exports the GameModule
├── manifest.ts     # id: 'ludo', mode: 'pooled', 2-4 players, status
├── engine.ts       # pure rules — dice, movement, capture, ranking, payout split (no I/O)
└── socket.ts       # realtime: turn broadcast, dice roll, capture events, forfeit updates
frontend/src/games/ludo/
├── LudoSetup.tsx    # host setup — player count, bet mode, amount
├── LudoBoard.tsx    # board rendering, dice, token movement/animations
└── LudoResult.tsx   # result screen: leaderboard, steps moved, payout breakdown
```
Registered with one line in `backend/src/games/registry.ts`.
See `backend/src/games/README.md` for the hard rule: a game gets money
behaviour **only** from the escrow adapter.

## Implementation Plan (TODO)
```
[x] Build lobby browser + create flow
    - List already-hosted open lobbies for this game
    - Create New Game -> Random/Friends Play selector, player count selector (2/3/4)
    - Bet mode selector (Rule 3), amount input
    Backend: backend/src/games/ludo/socket.ts — LIST_MATCHES, CREATE_MATCH handlers

[x] Build lobby-fill gating
    - Random Play: publish to public lobby list, block match start until all
      chosen slots filled
    - Friends Play: generate room code + share option, same full-lobby requirement
    - No early-start option for the host, regardless of mode
    Backend: backend/src/games/ludo/socket.ts — JOIN_MATCH with full-lobby gate

[x] Build color assignment
    - 2 players: fixed Red vs Yellow
    - 3/4 players: assign remaining colors (exact 3-player subset pending
      decision, see Open Questions)
    Backend: backend/src/games/ludo/engine.ts — assignColors(), getColorSet()

[x] Build board engine
    - Track 4 tokens per player, yard/board/home states
    - Dice roll logic: 6 required to exit yard, extra turn on rolling a 6
    - Movement logic per roll, exact-roll-required for home entry
    - Capture logic: landing on opponent token (non-safe square) sends it home
    - Safe square definitions (starting squares + star squares)
    Backend: backend/src/games/ludo/engine.ts — full board engine

[x] Build disconnect handling
    - Reuse existing escrow forfeitPlayer() flow unchanged
    - On forfeit: leave that player's tokens on the board, uncontrolled, still
      capturable
    - forfeitPlayer() only removes a player from contention -- the match still
      needs settleMatch() at the real end trigger to pay the remaining players
    Backend: backend/src/games/ludo/socket.ts — disconnect handler with forfeit

[x] Build match-end detection
    - Trigger the instant any player gets all 4 tokens home
    - Rank remaining players by total steps moved across all 4 tokens
    - Handle ties: split that place's share evenly
    Backend: backend/src/games/ludo/engine.ts — checkMatchEnd(), rankPlayers()

[x] Build settlement
    - Determine paid places by seated player count (1 for 2p, 2 for 3p, 3 for 4p)
    - Apply the correct percentage split (100 / 70-30 / 50-30-20)
    - Call settleMatch() with the ranked finishing order
    - Update leaderboard + all players' win/loss/earnings history
    Backend: backend/src/games/ludo/engine.ts — calculatePayoutWeights(), PAYOUT_TABLE
    Backend: backend/src/games/ludo/socket.ts — settleMatch() integration

[x] Build frontend — LudoSetup.tsx, LudoBoard.tsx, LudoResult.tsx
    frontend/src/games/ludo/LudoSetup.tsx — host setup wizard (player count, bet mode, amount)
    frontend/src/games/ludo/LudoBoard.tsx — lobby, create, waiting, live game, result
    frontend/src/games/ludo/LudoResult.tsx — standalone result card with leaderboard
```

## Reference

**Game-specific timers**
| Timer | Duration | On Timeout |
|---|---|---|
| "Your Turn" popup | 2.5 seconds | Hides automatically; the roll countdown starts right after (see `../12-Game-UI-Conventions.md`) |
| Roll dice | 15 seconds | Turn passes to the next player **and costs the player 1 life** (see Lives & Elimination). At 0 lives, eliminated instead. |
| Choose which token to move | 10 seconds | Turn passes to the next player — no life lost |

**Lives**
| Field | Value |
|---|---|
| Starting lives | 3 |
| Lost on | Missing the 15-second roll window only |
| At 0 lives | Eliminated — `forfeitPlayer()` with no reconnect grace, same downstream handling as a disconnect forfeit |

**Points economy** (ranking & payout basis — see *Points Economy* above)
| Event | Points |
|---|---|
| Step moved | +1 (per square; yard-exit = 0) |
| Capturing a token | +10 to the capturer |
| Being captured | -10 to the victim |
| Token reaches final home | +50 |

**Payout by seated player count** (after Rule 1's 5% fee — overrides Rule 2's fixed top-2)
| Players | Paid Places | Split |
|---|---|---|
| 2 | 1 (winner only) | 100% |
| 3 | 2 | 70% / 30% |
| 4 | 3 | 50% / 30% / 20% |

**Color assignment**
| Players | Colors Used |
|---|---|
| 2 | Red vs Yellow (fixed opposite pairing) |
| 3 | TBD — see Open Questions |
| 4 | Red, Green, Yellow, Blue (all four) |

**Escrow / Rules tie-in**
- Uses `lockBalance()` and `settleMatch()` from `../03-Escrow.md`, and the standard `forfeitPlayer()` disconnect flow, unmodified.
- **`forfeitPlayer()` does not end a match** — with 3+ seats it only removes one player from the payout; `settleMatch()` still has to fire at the real match-end trigger (someone gets all 4 tokens home) to rank and pay whoever is left.
- **Rule 1** applies unchanged — 5% off the pot, taken by `settleMatch`.
- **Rule 2 is overridden by this game**, via the documented exception in `../10-Game-Common-Rules.md`'s Rule 2 Exceptions subsection (added 2026-08-24): 2 players = winner-take-all, 3 players = top 2 paid (70/30), 4 players = top 3 paid (50/30/20). This game links to that exception rather than restating the numbers as its own rule.
- **Rule 3** applies as documented — Fixed mode is one amount for the whole match, host's choice; Free mode has each joiner pick their own amount when they join (`ludo:stake:required`), matching Rule 3's Free Bet definition exactly rather than the earlier (buggy) behavior of silently reusing the host's amount for everyone.
- **Rule 4 covers this game** via its Multiplayer Extension (added 2026-08-24): Random Play and Friends Play both require every chosen seat filled before the match starts. This game's Match Setup section above documents only what is Ludo-specific (seat count, color assignment) — the lobby-fill mechanics themselves are Rule 4's, not restated here.

## Open Questions

### Owned by this game
- **3-player color assignment.** Which 3 of the 4 standard colors are used, and is it a fixed set (e.g. always Red/Green/Yellow) or does it vary per match?

### Inherited — waiting on the shared rules

**Both of Ludo's original shared-rule gaps closed on 2026-08-24** — Rule 2 now carries this game's payout exception, and Rule 4's multiplayer extension covers the full-lobby gate. What's left is inherited schema debt that blocks every game leaning on Rule 4, not something specific to Ludo:

- **Rule 4's underlying schema gaps apply here too.** No discovery mode, room code, host, or confirmation state exists on `Match` yet (tracked in `../10-Game-Common-Rules.md`'s Open Questions) — Ludo's lobby cannot be built on top of a model that does not track any of this.
- **Rule 2's schema gap now also covers seat count.** Nothing on `Match` records whether a game is 1v1/multiplayer or, for Ludo specifically, how many seats a given match was created with — so the scaled split this game relies on is enforced by convention, not by the database. Tracked in `../10-Game-Common-Rules.md`'s Open Questions.
- **The multiplayer extension doesn't describe a partially-filled lobby.** What a Random Play listing shows while only 2 of 4 seats are taken, and whether a seated player can leave before the lobby fills, is unanswered upstream — tracked in `../10-Game-Common-Rules.md`'s Open Questions, since it applies to any multiplayer game, not just this one.

## Related Docs
- `../04-Games-Index.md` — master game list and status
- `../10-Game-Common-Rules.md` — Rules 1–4; this game inherits 1 and 3 unchanged, and uses documented amendments to 2 and 4
- `../12-Game-UI-Conventions.md` — the Turn Notification popup this game first adopted
- `../03-Escrow.md` — the functions this game calls instead of touching balances

## Last Updated
2026-09-03 — **Bug-fix pass**: fixed a 6-rolled-with-no-legal-move incorrectly forfeiting the turn (it now re-rolls the same player); replaced `totalSteps`-based ranking/payout with a **points economy** (+1/step, ±10/capture, +50/home); added a **3-lives** system that eliminates a player after 3 missed 15-second roll windows; Free Bet matches now actually collect each joiner's own stake instead of silently reusing the host's; adopted the hub-wide **Turn Notification** popup (`../12-Game-UI-Conventions.md`); the board now visually rotates per viewer so a player's own color always renders bottom-left (client-side only, no rule change); and in-match errors now broadcast to every seated player instead of only the one whose action triggered them. Resolves this doc's former "no turn timer specified" open question.
2026-08-24 — **Rule 2 and Rule 4 amendments applied upstream.** `../10-Game-Common-Rules.md` now carries Ludo's payout exception (Rule 2 Exceptions) and the multiplayer full-lobby gate (Rule 4 Multiplayer Extension) as real amendments, not proposed text. This doc's Reference and Open Questions sections rewritten to link to them instead of quoting paste-ready text; the two "waiting on shared rules" gaps are closed, leaving only inherited schema debt.
2026-08-24 — Restructured onto the standard game template and numbered as Game 02, from the original unstructured `game_ideas/Game-Ludo.md`. Rule 2 override and the needed Rule 4 multiplayer extension carried forward as paste-ready text under Reference, and re-filed under Open Questions as inherited gaps rather than "depends on" bullets. No content changes to the designed flow itself.
