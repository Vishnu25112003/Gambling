# Game 04: Trumpcard

## Identity
| Field | Value |
|---|---|
| **Game No.** | `04` |
| **Game ID** | `trumpcard` |
| **Doc file** | `Games/G04-Trumpcard.md` |
| **Fee Mode** | `Pooled` — every seated player bets into one pot (Rule 1) |
| **Players** | `Multiplayer` — 2, 3 or 4 seats, chosen by the host at creation. **Overrides Rule 2's fixed top-2 payout** via the same documented exception as Ludo — see Reference |
| **Discovery** | `Random + Friends` — Rule 4's two discovery modes, extended by its multiplayer lobby-fill gate (all chosen seats must fill before start). Rematch is not covered for 3+ seats — Rule 4's Rematch path is written for two players only |

## One-Line Summary
A 52-card stat-battle game (Top Trumps style) for 2-4 players — compare a chosen stat across all active players' top cards, highest value takes the rest; most cards when time runs out (or last one standing) wins.

## Overview
Each player holds an equal-sized pile of cards, each with 6 stats. Whoever leads a round picks a stat from their top card; every active player's top card is compared on that stat, and the single highest value takes everyone else's card for that round. The round winner leads next. Play continues until the host's chosen timer runs out or only one player has cards left. Like Ludo, the number of paid places and the split scale with how many players the match actually seated, instead of staying fixed at Rule 2's top-2.

## Status
- **Phase:** Devnet/testnet
- **% Complete:** 100% — backend + frontend implemented, typecheck and build pass on both, engine unit-tested
- **Contract Status:** Off-chain only — uses the shared escrow layer
- **Inherits:** Rule 1 (fee) and Rule 3 (bet mode) of `../10-Game-Common-Rules.md` unchanged. **Overrides Rule 2** via the Ludo exception in Rule 2's Exceptions subsection, extended on 2026-08-25 to also cover Trumpcard — same seat-count-scaled split, no separate table needed. **Uses Rule 4's multiplayer extension** (added by Ludo's spec pass) for the full-lobby-fill gate. **Overrides the generic disconnect rule** with its own combined lives system (see below) — the one redefinition this file makes beyond the two shared-rule links above.

## How It Works (Flow)

### Match Setup
Setup follows Rule 4's Random Play / Friends Play shapes plus its multiplayer extension (the full-lobby gate) — only the parts specific to Trumpcard are below:

1. Player enters Trumpcard → sees already-hosted open lobbies, plus a **"Create New Game"** option.
2. Create → host chooses **Random Play** or **Friends Play** (Rule 4).
3. Host chooses player count: **2, 3, or 4** — this game's seat-count setting, referenced by Rule 4's multiplayer extension as "all chosen slots."
4. Host chooses **cards per player** — must be equal across all players, up to the max the 52-card deck allows for that count:

   | Players | Max Cards Each | Deck Used |
   |---|---|---|
   | 2 | 26 | 52 (full) |
   | 3 | 17 | 51 (1 unused) |
   | 4 | 13 | 52 (full) |

   The host can choose a smaller equal split too (e.g. 10 each for a faster match).
5. Host chooses match **duration** (10 min, 15 min, etc.) — this game's own timer, not a Rule 4 concept.
6. Host chooses **Fixed Bet** or **Free Bet** mode (Rule 3) and sets the amount.
7. Per Rule 4's multiplayer extension, the lobby **must fill all chosen slots** before the match can start — no early start with a partial lobby, even if the host is willing.
8. Once full, every seated player's bet amount locks via `lockBalance()`.

### Gameplay
1. The deck is shuffled and dealt into equal piles per the chosen player/card-count combination. Any unused cards (the 3-player case) are removed from this match entirely.
2. System **randomly picks the first leader**.
3. Leader has **10 seconds** to pick a stat category from their top card.
   - No pick within 10 sec → counts as a **skip**, leader loses 1 life (see Lives System below).
4. **All active players'** top cards are compared on the chosen stat at once.
5. **Single highest value** takes every other active player's card for that round, adding them to the back of their own pile.
6. **Tie** (two or more players share the highest value): those tied cards go into a **shared pool** — whoever wins the **next** round takes the pool **in addition to** that round's normal spoils.
7. The round's winner becomes the new leader.
8. **Elimination (0 cards):** any player whose pile hits 0 cards is eliminated immediately; remaining players continue.
9. Match continues until the timer runs out, or only one player has cards remaining.

### Lives & Disconnects (overrides Rule 4's generic disconnect behavior, for this game only)
- Each player starts the match with **3 lives**.
- A life is lost when **either**:
  - **Stat-choice skip:** leader doesn't pick a stat within the 10-second timer, or
  - **Disconnect-timeout:** disconnects and fails to reconnect within the standard 15-second escrow grace period.
- Losing all **3 lives** → that player is **eliminated immediately**. `forfeitPlayer()` is called at this point to move their locked stake into the pot, same as any other forfeit — the lives system only decides *when* that call fires, not what it does.
- **Cards in an eliminated-by-lives player's pile are discarded entirely** — removed from play, not redistributed to anyone. This is different from natural 0-card elimination, where there's simply nothing left to redistribute.
- `forfeitPlayer()` does not end the match — with 3+ seats it only removes one player from contention. `settleMatch()` still fires at the real match-end trigger (timer expiry or one player left with cards) to rank and pay whoever remains.

### Match End
1. Match ends when the timer runs out, or only one player remains with cards.
2. **Ranking:** eliminated players (via either 0 cards or lost lives) are ranked by **elimination order** — earlier eliminated = lower placement. Any players still active at time-up are ranked by **card count held** (more = higher placement).
3. **Payout** (after Rule 1's 5% fee) — scales by the match's **original** seated player count, via the same exception documented for Ludo in Rule 2's Exceptions:

   | Seated players | Paid places | Split |
   |---|---|---|
   | 2 | 1 (winner only) | 100% |
   | 3 | 2 | 70% / 30% |
   | 4 | 3 | 50% / 30% / 20% |

4. `settleMatch(matchId, [ranked winners...], [weights...])` is called with as many entries as paid places for that seat count — the game supplies the ranked finishing order, escrow applies the weights.

### Record & Result
- Per-match record: final ranking, elimination order, each player's card count at end, and the payout breakdown (stake, pot, 5% fee, net per paid place).
- **Leaderboard shown** for 3- or 4-player matches — the same exception to the "no leaderboard in a 1v1" rule that Ludo documents.
- No provably-fair claim is currently specified for the shuffle/deal or the first-leader pick — see Open Questions.
- All seated players' profiles updated: win/loss/earnings history.

## Where This Lives
*(As built — differs slightly from the original proposal below: no separate
`TrumpcardSetup.tsx`, since every game in this hub folds setup/lobby/live/
result into one page-state-machine `*Board.tsx`, with setup itself driven by
the shared `GameSetupWizard` off a small config object instead.)*
```
backend/src/games/trumpcard/
├── index.ts        # default-exports the GameModule
├── manifest.ts     # id: 'trumpcard', mode: 'pooled', 2-4 players, status
├── types.ts        # TrumpcardState, TrumpCard, socket event names
├── engine.ts       # pure rules — deck split, stat comparison, tie pool, ranking, payout (no I/O)
└── socket.ts       # realtime: lobby-fill gate, stat-choice timer, comparison reveal, lives/forfeit
frontend/src/games/trumpcard/
├── trumpcardSetupConfig.tsx  # feeds the shared GameSetupWizard — seat count, cards-per-player, duration
├── TrumpcardBoard.tsx        # page-state-machine: lobby, create, waiting, live, result
├── TrumpcardCard.tsx         # generic stylized suit+rank stat card (+ TrumpcardBack)
├── RoundRevealOverlay.tsx    # staged reveal: banner -> cards -> stat-bar race -> winner text
└── TrumpcardResult.tsx       # result screen: leaderboard, payout breakdown, no rematch button
```
Registered with one line in `backend/src/games/registry.ts`. Routed at
`/dashboard/play/trumpcard` in `frontend/src/App.tsx`, and wired into the
games hub's `gameVisuals.ts`.
See `backend/src/games/README.md` for the hard rule: a game gets money
behaviour **only** from the escrow adapter.

Unit tests for the pure engine functions live in
`backend/tests/trumpcard-engine.test.ts` (deck determinism, dealing/discard
limits, round resolution including the tie-pool path, lives/elimination,
ranking, and payout weights).

## Implementation Plan (TODO)
```
[x] Build lobby browser + create flow
    - List already-hosted open lobbies for this game
    - Create New Game -> Random/Friends Play selector (Rule 4), player count
      selector (2/3/4)
    - Cards-per-player input, validated against the max for that player count
    - Match duration selector, bet mode selector (Rule 3) + amount
    Frontend: frontend/src/games/trumpcard/trumpcardSetupConfig.tsx — required
    generalizing the shared GameSetupWizard from a single extra step to an
    ordered extraSteps[] array (this game needs 3: seat count, cards-per-player
    depending on seat count, and duration); every existing game's setup config
    was migrated to the new shape unchanged.
    Backend: backend/src/games/trumpcard/socket.ts — LIST_MATCHES, CREATE_MATCH

[x] Build lobby-fill gating
    - Reuse Rule 4's multiplayer extension: Random Play publishes publicly,
      Friends Play generates a room code, both block start until every chosen
      seat is filled -- no early start
    Backend: backend/src/games/trumpcard/socket.ts — JOIN_MATCH with full-lobby
    gate, ported from ludo/socket.ts's identical pattern

[x] Build deck split + deal
    - Shuffle 52-card deck, deal equal piles per player per the chosen count
    - Unused cards (3-player case) removed from this match entirely
    Backend: backend/src/games/trumpcard/engine.ts — buildCanonicalDeck() (one
    fixed 52-card deck, deterministic stat generation, not re-randomized per
    match), shuffleDeck(), dealHands()

[x] Build round engine
    - Track current leader, 10-sec stat-choice timer
    - On timeout: skip counted, decrement leader's life, pass leader role per
      normal rules
    - On pick: compare that stat across all active players' top cards
    - Determine single highest value; move all other active players' top
      cards to winner's pile (back of pile)
    - Handle ties: move tied cards into a shared pool, carry pool forward
      until a non-tied round resolves it
    Backend: backend/src/games/trumpcard/engine.ts — resolveRound(),
    getNextLeader(). Confirmed during implementation: a 3+ player tie where 2
    tie for highest and a 3rd is strictly lower pools ALL active players'
    compared cards that round, not just the tied ones (the doc's original text
    was silent on the strictly-lower player's card) — see Reference below.

[x] Build elimination handling
    - 0 cards -> eliminate that player immediately, record elimination order
    - 3 lives lost -> eliminate that player, call forfeitPlayer(), discard
      their remaining pile entirely (do not redistribute)
    - Remove eliminated players from subsequent round comparisons
    Backend: backend/src/games/trumpcard/engine.ts — resolveRound() (0-card
    path), decrementLife() (0-life path, discards the hand)

[x] Build lives system
    - Track 3 lives per player
    - Stat-choice timeout (10 sec) OR failed disconnect-reconnect (15 sec) ->
      decrement 1 life
    - 0 lives -> trigger elimination-by-lives path (forfeit + discard pile)
    Backend: backend/src/games/trumpcard/engine.ts — decrementLife(), ported
    from mine-catcher/engine.ts's shape. socket.ts's disconnect handler
    deliberately does NOT call escrow.forfeitPlayer() on a raw disconnect (that
    would forfeit the stake on the very first disconnect regardless of
    remaining lives) — it runs its own local reconnect-grace timer and only
    calls escrow.forfeitPlayer(matchId, userId, 0) at the exact moment lives
    hit 0, resolving this doc's own open question below.

[x] Build match-end detection
    - Trigger at timer expiry OR when only one player has cards remaining
    - Rank eliminated players by elimination order; rank remaining active
      players by card count held
    Backend: backend/src/games/trumpcard/engine.ts — checkMatchEnd(),
    rankFinalStandings()

[x] Build settlement
    - Determine paid places by ORIGINAL seated player count (1 for 2p, 2 for
      3p, 3 for 4p), per Rule 2's Ludo/Trumpcard exception
    - Apply percentage split (100 / 70-30 / 50-30-20)
    - Call settleMatch() with ranked results
    - Update leaderboard + all players' win/loss/earnings history
    Backend: backend/src/games/trumpcard/engine.ts — PAYOUT_TABLE,
    calculatePayoutWeights() ported verbatim from ludo/engine.ts
    Backend: backend/src/games/trumpcard/socket.ts — settleMatch()

[x] Build frontend — TrumpcardBoard.tsx, TrumpcardCard.tsx,
    RoundRevealOverlay.tsx, TrumpcardResult.tsx
    frontend/src/games/trumpcard/TrumpcardBoard.tsx — lobby, create, waiting,
    live game, result (page-state-machine, same shape as LudoBoard.tsx)
    frontend/src/games/trumpcard/TrumpcardCard.tsx — generic stylized
    suit+rank stat card (no character-art pipeline exists in this repo;
    Trumpcard.png is a hub-tile promo image like every other game's, not
    in-game card art)
    frontend/src/games/trumpcard/RoundRevealOverlay.tsx — staged reveal
    (banner -> cards pop in -> stat-bar race -> winner text), interaction
    pattern referenced from the user's Gaming_Hub demo, reimplemented with
    this repo's own stack (plain React state + setTimeout, Tailwind, no
    animation library — no code was reused from that project)
    frontend/src/games/trumpcard/TrumpcardResult.tsx — leaderboard + payout
    breakdown, no rematch button (see Reference)
```

## Reference

**Card-per-player limits**
| Players | Max Cards Each | Deck Used |
|---|---|---|
| 2 | 26 | 52 (full) |
| 3 | 17 | 51 (1 unused) |
| 4 | 13 | 52 (full) |

**Game-specific timers**
| Timer | Duration | On Timeout |
|---|---|---|
| Leader stat-choice | 10 seconds | Counts as 1 lost life |
| Disconnect reconnect | 15 seconds (standard escrow, reused) | Counts as 1 lost life |

**Payout by player count** (after Rule 1's 5% fee) — same exception table as Ludo
| Players | Paid Places | Split |
|---|---|---|
| 2 | 1 (winner only) | 100% |
| 3 | 2 | 70% / 30% |
| 4 | 3 | 50% / 30% / 20% |

**Escrow / Rules tie-in**
- Uses `lockBalance()` and `settleMatch()` from `../03-Escrow.md`, but **overrides** the generic disconnect/forfeit behavior with this game's own combined 3-lives system (same override pattern as Mine Catcher).
- **`forfeitPlayer()` does not end a match** — it moves an eliminated-by-lives player's stake into the pot; with 3+ seats the match keeps running toward its real end trigger, and `settleMatch()` still fires there to pay whoever is left.
- **`forfeitPlayer()` is called only at the exact moment a player hits 0 lives — never on a raw disconnect.** A disconnect alone starts a local 15-second reconnect-grace timer that, on expiry, costs a life like any other cause; only if that life loss brings them to 0 does `escrow.forfeitPlayer(matchId, userId, 0)` fire. This resolves the "inferred, not confirmed" open question the original spec left (see Last Updated).
- Payout **does not** follow Rule 2's fixed-top-2 rule — relies on the same Exceptions entry documented for Ludo in `../10-Game-Common-Rules.md`, extended on 2026-08-25 to name Trumpcard alongside it.
- Random/Friends Play relies on Rule 4's multiplayer extension, also added by Ludo's spec pass — no separate lobby logic needed for this game.
- Bet mode follows Rule 3 unchanged.
- **No Rematch.** Rule 4's Rematch path is written for two players only, and this game's own Identity table already flags that 3+ seats aren't covered — the result screen has no rematch button rather than half-supporting it.

**3+ player tie resolution (confirmed during implementation)** — the original spec said only "those tied cards go into a shared pool," leaving the strictly-lower player's card in a 3+ seat tie unaddressed. Implemented as: every active player's compared top card that round — not just the ones tied for highest — goes into the shared pool, since there is no single winner to hand a non-tied, non-winning card to either.

## Open Questions

### Owned by this game
- **No provably-fair claim is made for the shuffle/deal or the first-leader pick.** Coin Flip commits and reveals every random value it produces; Trumpcard's deck shuffle and leader selection are currently just asserted as fair (implemented with plain `Math.random()`). Whether this game intends the same commit-reveal treatment, or is deliberately out of scope for it, is still undecided — not addressed by this implementation pass.
- **Resolved during implementation (2026-08-28):** the exact `forfeitPlayer()` call point at 0-lives elimination. Built as: never on a raw disconnect, only at the instant a life-loss (from either a stat-choice skip or a failed disconnect-reconnect) brings a player to 0 lives — see Reference above.
- **Stat names/ranges are this implementation's own unblocking choice, not a design decision.** The original spec named "6 stats" without naming them; implemented as `power / speed / defense / intellect / stamina / luck`, each 1-99, generated once into a fixed 52-card deck (not re-randomized per match). Changing them later is a pure data change in `engine.ts`'s `buildCanonicalDeck()`, not a structural one — flag for product/design sign-off if the exact names matter.
- **Card visuals are a generic stat card, not character art.** No per-card art/portrait pipeline exists in this repo (Trumpcard.png is a hub-tile promo image like every other game's `public/games/*.png`, not in-game card art, and there is no Cloudinary/upload flow for individual cards). Confirmed with the user: cards render as a stylized suit+rank card with 6 stat pills, Tailwind only — not a character-portrait design like the user's Gaming_Hub reference demo.

### Inherited — waiting on the shared rules
Trumpcard's two upstream dependencies (a Rule 2 payout exception, a Rule 4 multiplayer lobby-fill gate) are both already live, reusing exactly what Ludo's spec pass added — no new shared-rule text was needed. What's left is the same inherited schema debt Ludo already flags, not something specific to Trumpcard:
- **Rule 4's underlying schema gaps apply here too.** No discovery mode, room code, host, or confirmation state exists on `Match` yet (tracked in `../10-Game-Common-Rules.md`'s Open Questions) — Trumpcard's lobby cannot be built on top of a model that does not track any of this.
- **Rule 2's schema gap now also covers seat count.** Nothing on `Match` records whether a game is 1v1/multiplayer or how many seats a given match was created with — so the scaled split this game relies on is enforced by convention, not by the database. Tracked in `../10-Game-Common-Rules.md`'s Open Questions.

## Related Docs
- `../04-Games-Index.md` — master game list and status
- `../10-Game-Common-Rules.md` — Rules 1–4; this game inherits 1 and 3 unchanged, and uses the Ludo/Trumpcard exception to Rule 2 and Rule 4's multiplayer extension
- `../03-Escrow.md` — the functions this game calls instead of touching balances
- `Games/G02-Ludo.md` — the game that first surfaced the Rule 2 exception and Rule 4 multiplayer extension this game reuses
- `Games/G03-Mine-Catcher.md` — the game that first established the combined lives-system override pattern this game reuses

## Last Updated
2026-08-28 — **Full implementation complete.** All 8 TODO items marked done: lobby browser + create flow (required generalizing the shared `GameSetupWizard` to support multiple game-specific setup steps, since this game needs 3), lobby-fill gating, deck split + deal, round engine (including the tie-pool path), elimination handling, lives system, match-end detection, and settlement. Frontend built: setup config, board (page-state-machine), card component, staged round-reveal overlay, and result screen. Registered in the backend registry and routed in the frontend. Resolved two open questions along the way: the `forfeitPlayer()` call-point question (now confirmed: only at 0 lives, never on a raw disconnect) and the 3+ player tie-pool scope (confirmed with the user: pools every active player's compared card that round, not just the tied ones). Card visuals confirmed with the user as a generic stylized stat card, not character art. Stat names/ranges (`power/speed/defense/intellect/stamina/luck`, 1-99) are this pass's own unblocking choice, not a locked design decision. No provably-fair claim was added — that open question remains as-is.
2026-08-25 — Restructured onto the standard game template and numbered as Game 04, from the original unstructured `game_ideas/Game-Trumpcard.md`. Rule 2's Ludo exception extended upstream to also name Trumpcard, since both games share the identical seat-count-scaled split — no new shared-rule text needed. No content changes to the designed flow itself.
