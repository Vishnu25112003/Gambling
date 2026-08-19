# Game Common Rules

## One-Line Summary
The fee, payout, and betting-mode rules that apply to **every** game in the hub — the single source of truth for "who gets paid what", which `03-Escrow.md` executes and no individual game redefines.

## Overview
`03-Escrow.md` owns the *mechanism* of moving money (lock, settle, refund, forfeit). This file owns the *policy* those mechanisms enforce: how big the platform's cut is, how a settled pot is divided between finishers, and how a match's bet amount is decided. The split matters — escrow is code, this is policy, and policy changes far more often than code does. Whenever a number here changes (the fee rate, the 70/30 split), only this file and the escrow constants that mirror it need touching; no game module does.

Every game inherits all three rules automatically. A game's own `Games/Game-X.md` file only documents what is *specific* to that game (its odds table, its win condition, its board state) — never a fee or payout rule, which would create a second source of truth.

## Status
- **Phase:** Devnet/testnet
- **Rules 1–3:** Locked
- **Enforced by:** `03-Escrow.md` (`settleMatch` for Rules 1–2, `lockBalance` for Rule 3)
- **Depends on:** `03-Escrow.md` (the functions that apply these rules)

---

## Rule 1: Platform Fee Structure

**Fee:** 5% of the pot/winnings, taken by the platform on every settled match.

**How it's applied — two calculation modes:**

- **Pooled/multiplayer games** (players bet against each other, one pot): 5% is deducted from the **total pot** before payout, and the remainder is distributed to the winners by weight (per Rule 2).
  - Example: 2 players × 1 SOL = 2 SOL pot → 0.1 SOL to house → winner gets 1.9 SOL

- **Solo-vs-house games** (player bets against the platform — dice, slots, roulette): the 5% is **baked into the payout odds table** rather than deducted as a separate line. `settleMatch` charges no fee here and simply pays out according to that game's odds — charging again would take the same 5% cut twice off the same player. That game's odds table lives in its own `Games/Game-X.md` file.

**No fee is ever taken on a refund.** If a match is cancelled or the server crashes, `refundMatch` returns every stake in full — a crash is the platform's fault, not the player's.

---

## Rule 2: Payout Distribution by Player Count

**Scope:** Applies only to pooled/multiplayer **player-vs-player** games. Solo-vs-house games (dice, slots, roulette) are not covered by this rule — they stay under Rule 1's odds-table model, since there's no "2nd place" in a player-vs-house game.

**Game type determines the payout mode — not how many people actually join.** Whether a game is "1v1" or "multiplayer" is a fixed property of that game, decided at game design time, and locked in at match start. A forfeit that shrinks the lobby mid-match does **not** change which payout rule applies.

**1v1 games** (games designed for exactly 2 players):
- Winner takes the **entire pot**, after the 5% platform fee from Rule 1 is deducted

**Multiplayer games** (games designed for 3+ players):
- Only the **top 2 finishers** get paid — split **70/30**: 1st place gets 70% of the pot, 2nd place gets 30% (after the 5% platform fee is deducted)
- Players finishing 3rd place or lower get nothing back
- This 70/30 split stays **fixed regardless of lobby size** — a 10-player match still only pays the top 2, same as a 3-player match. It does not scale to top 3+ for larger lobbies.
- If a mid-match forfeit reduces the lobby down to 2 remaining players, the match **still pays out under the multiplayer 70/30 rule** — it does not switch to the 1v1 winner-take-all rule, since the payout mode was already locked in at match start based on the game's type.

**Ties:** If two or more players tie for a paid place (1st or 2nd), that place's prize share is **split evenly** among the tied players.

**How this reaches escrow.** A game module expresses its finishing order through `settleMatch(matchId, winners[], weights[])` — the game supplies the ranking, and this rule supplies the weights:

| Game type | Call |
|---|---|
| 1v1 | `settleMatch(id, [winner], [1])` — one winner, whole post-fee pot |
| Multiplayer | `settleMatch(id, [first, second], [70, 30])` |
| Multiplayer, tie for 1st | `settleMatch(id, [a, b], [35, 35])` — the 70 share split evenly, 2nd place unpaid |

Weights are **relative** for pooled games (escrow normalises them against the post-fee pot). For solo-vs-house games they are **absolute SOL payouts** straight from the odds table — see Rule 1.

---

## Rule 3: Betting Mode — Fixed Bet vs Free Bet

**Chosen by:** The host, per match, at the time the match is created. Available for any game — 1v1 or multiplayer.

**Fixed Bet Mode:** Host sets one bet amount when creating the match. Every player who joins must bet exactly that amount — no variation allowed.

**Free Bet Mode:** Each player picks their own bet amount when joining, independent of everyone else. Still capped by their own `availableBalance` (per the escrow max-bet rule — no separate cap for this mode).

**Payout is unaffected by bet mode.** In both modes, payout still follows Rule 2 exactly — rank decides the payout share (winner-take-all for 1v1, 70/30 for multiplayer), regardless of who staked what. A player who bet less can still walk away with the full winning share if they finish 1st or 2nd — Free Bet Mode does not introduce stake-proportional payouts.

---

## Reference

**Rules at a glance**
| Rule | Setting | Value | Enforced in |
|---|---|---|---|
| 1 | Platform fee (pooled) | 5% off the total pot | `settleMatch` |
| 1 | Platform fee (solo-vs-house) | 5% baked into the odds table, no separate deduction | that game's odds table |
| 1 | Fee on refund | None, ever | `refundMatch` |
| 2 | 1v1 payout | Winner takes the whole post-fee pot | `settleMatch` weights |
| 2 | Multiplayer payout | Top 2 only — 70/30, fixed at any lobby size | `settleMatch` weights |
| 2 | Tie for a paid place | That place's share split evenly | `settleMatch` weights |
| 2 | Payout mode | Locked at match start by game type, never by live lobby size | game module |
| 3 | Bet mode | Fixed or Free, host's choice per match | `lockBalance` validation |
| 3 | Max bet | The player's own `availableBalance`, both modes | `lockBalance` |

**Rules Locked**
- Fee rate is defined **here and only here**. `03-Escrow.md` describes how the fee is applied, not what it is.
- A game module never implements a fee or a payout split — it reports a finishing order and lets `settleMatch` apply these rules.

## Open Questions
- **Rule 3 has no schema behind it yet.** The shipped `Match` model has no `betMode` or `fixedBetAmount` column, so Fixed vs Free is currently unenforceable at the database level — every match behaves as Free Bet. Both fields need adding to `Match` (and the fixed amount validated inside `lockBalance`) before the first multiplayer game with a lobby ships. Tracked in `03-Escrow.md`'s implementation plan.
- **Rule 2 has no schema behind it yet either.** Nothing on `Match` records whether a game is 1v1 or multiplayer, so "locked in at match start" is currently a convention the game module upholds rather than something the database enforces.

## Related Docs
- `03-Escrow.md` — the four functions that execute these rules
- `04-Games-Index.md` — which games exist and which payout mode each uses
- `09-Referral-Program.md` — the referral commission, funded by the house *on top of* Rule 1's fee, never skimmed from it
- `00-Overview.md` — project overview and reading order

## Last Updated
2026-08-18 — Initial version. Rules 1–3 written; Rule 1's fee definition moved here from `03-Escrow.md` so there is one source of truth.
