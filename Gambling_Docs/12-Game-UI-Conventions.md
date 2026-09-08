# Game UI Conventions

## One-Line Summary
Shared in-match presentation conventions — starting with the Turn Notification popup + countdown — that every turn-based game in the hub implements the same way, so a player doesn't have to relearn "how do I know it's my turn" for every new game.

## Overview
`10-Game-Common-Rules.md` owns money policy: fee, payout, betting mode, discovery. This file is the presentation equivalent — conventions that are not about money at all, but that every game should still implement identically rather than each inventing its own. The first (and so far only) entry is the **Turn Notification** popup: a big, unmissable "your turn" moment, followed by a countdown that costs the inactive player something if they miss it. Before this doc existed, every game signaled "your turn" with a different bit of inline text (`'Your turn to spin.'`, `'YOUR TURN'`, `'Your turn — pick a stat!'`, `'You are batting'`) and ran its own hand-rolled countdown — functional, but inconsistent, and never a genuinely hard-to-miss cue.

Like doc 10, this file is written once and applied by every game that qualifies — a game's own `Games/GNN-<Game-Name>.md` doc should link here rather than re-describing the popup or its timing.

## Status
- **Phase:** Devnet/testnet
- **Rule 1:** Implemented by Ludo (2026-09-03), then **reverted in Ludo (2026-09-08)** — players reported the full-screen popup as intrusive/irritating during play. Ludo now signals "your turn" only via its always-visible subtitle/status-line text, the same pattern the other games already use. **No game currently implements the popup described below.** Treat Rule 1 as a proposed pattern to revisit (e.g. a non-blocking toast, a shorter duration, or a dismissible variant) rather than a proven, ready-to-copy one.
- **Enforced by:** Nothing automatic — even when Ludo had it, a game opted in by using the shared `TurnBanner` component and following the sequencing below. There is no lint/test that catches a game skipping this.

---

## Rule 1: Turn Notification

**Applies to:** Any game with a discrete "it becomes exactly one player's turn now" moment — i.e. games with a `TURN_START`-shaped server event naming a single current player. Games where every player acts simultaneously each round (Hand Cricket's pick-a-number-at-the-same-time structure) don't have a turn to announce this way — see Open Questions for how (or whether) this convention should adapt to them.

**The sequence, exactly:**
1. The moment a fresh turn starts for a given player, **only that player's own screen** shows a big, centered, hard-to-miss popup reading "Your Turn" (or an equivalent label) over the board.
2. The popup stays up for **2.5 seconds**, then hides itself automatically. No player input is needed to dismiss it.
3. Immediately after it hides, that game's own turn countdown starts and is visibly displayed (whatever duration that game already uses for its roll/pick/placement action — this convention doesn't change *that* number, only when the visible countdown begins).
4. Missing that countdown is each game's own business (see below) — this convention only standardizes the *notification*, not the penalty.

**The server must delay arming its own timeout by the same amount.** If the countdown only *displays* starting after the popup, but the server's actual deadline started ticking the instant the turn began, the player has less real time than the countdown shows. The fix is mechanical: broadcast the turn-start event immediately (so the popup can appear right away), but delay actually arming the server-side timeout by the same popup duration (2.5s). Ludo previously implemented this shape via `backend/src/games/ludo/socket.ts`'s `armRollTimerWithBanner` wrapping `startRollTimer`; that wrapper was removed along with the popup on 2026-09-08 (Ludo now arms its roll timer immediately, with no delay), since keeping the delay without the popup it existed to justify would have left an unexplained pause before the countdown. If this pattern is revived, re-derive the delay-wrapper shape rather than assuming the old code still exists.

**Missing the countdown should cost something, via each game's own lives system.** This convention does not invent a second lives mechanic — it hooks into whatever `lives: Record<userId, number>` system that game already has (or should have), the same pattern Mine Catcher pioneered (see `Games/G03-Mine-Catcher.md`'s "Lives & Disconnects" section) and Hand Cricket and Trumpcard both reused. Ludo's version (`Games/G02-Ludo.md`'s "Lives & Elimination" section) is the current reference for wiring a lives system to specifically the *roll* timeout, not every timer a game has — decide per-game which timeout is the "real" one worth a life.

**Frontend component:** previously `frontend/src/components/shared/TurnBanner.tsx` — a small, dumb, prop-driven overlay (`show: boolean`, `label?: string`) that owned only the popup's rendering, with the calling game owning all timing. **Deleted 2026-09-08** along with its only usage (Ludo) — recoverable from git history (`c8a281a` added it) if this pattern is revived. It was modeled on the existing `frontend/src/games/trumpcard/RoundRevealOverlay.tsx` pattern: `fixed inset-0 z-50`, plain `useState`/`setTimeout` staging, the existing `.animate-fade-up` utility in `frontend/src/index.css` — no animation library.

**Why the popup owns none of the timing.** Every game's actual turn/action timers already differ (Ludo's 15s roll vs. Mine Catcher's 15s attack vs. Trumpcard's per-round pick), and some games layer more than one timer per turn (Ludo also has a separate 10s move-selection window that does *not* get its own popup — only a genuine new-player turn change does). A dumb component that just shows/hides on command adapts to all of that without needing per-game configuration options.

### Reference
| Piece | Duration | Notes |
|---|---|---|
| Popup shown | 2.5 seconds | Fixed across every game — do not make this game-configurable without a documented reason |
| Countdown start | Immediately after the popup hides | Not overlapping — the player gets the popup, *then* the full countdown, not the countdown running underneath the popup |
| Server timeout delay | Same as popup duration (2.5s) | Keeps the displayed countdown truthful |

## Open Questions

- **Retrofitting existing games.** No longer applicable as originally framed — Ludo itself reverted the popup (2026-09-08) after it was reported as intrusive. Coin Flip, Mine Catcher, Trumpcard, and Hand Cricket continue to use their original inline "your turn" text, which is now the convention across every game in the hub, not the exception. Do not retrofit `TurnBanner` into another game without first addressing why it didn't work out in Ludo.
- **Simultaneous-action games.** Hand Cricket has no single "current player" moment — both players pick at once, every ball. Whether this convention should skip such games entirely, or adapt into something like "both players see their own popup at the start of each ball," is undecided.
- **Multi-timer games.** Ludo has two timers per turn cycle (roll, then sometimes move-selection) and only shows the popup once, at the start of the cycle. Whether a future game with more layered timers needs more than one notification moment per turn is undecided — default to "no" until a real game needs it.

## Related Docs
- `00-Overview.md` — Architecture Principle #4 (reusable frontend components), which this doc is an instance of
- `04-Games-Index.md` — "before adding a game" reading list, which now points here for turn-based games
- `10-Game-Common-Rules.md` — the money-policy equivalent of this doc; same "written once, linked everywhere" shape
- `Games/G02-Ludo.md` — the only game that implemented this convention (2026-09-03 – 2026-09-08); still the reference for the server-side arm-delay pattern *shape*, even though that code was removed with the popup
- `Games/G03-Mine-Catcher.md` — origin of the `lives` pattern this convention's countdown-penalty hooks into

## Last Updated
2026-09-08 — Ludo's `TurnBanner` popup removed after user feedback that it felt intrusive/irritating; the paired server-side arm-delay (`armRollTimerWithBanner`/`TURN_BANNER_MS`) was removed with it to avoid leaving an unexplained pause before the roll countdown. Rule 1 is left documented as a candidate pattern for a future, less-intrusive redesign rather than deleted outright, but no game currently implements it.

2026-09-03 — Created, documenting the Turn Notification convention as implemented for Ludo's bug-fix pass (big "Your Turn" popup for 2.5s, then the existing roll countdown, missing it costs a life via Ludo's new lives system).
