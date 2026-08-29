/**
 * Trumpcard engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs (or, where randomness is
 * intentional — shuffling, first-leader pick — isolated to one call site) and
 * easy to unit-test. This file never touches the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G04-Trumpcard.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1-4, with the Ludo/Trumpcard
 *     Rule 2 exception)
 */
import { STAT_KEYS } from './types.js';
// --- Constants ----------------------------------------------------------------
/** Max cards per player by seat count — Gambling_Docs/Games/G04-Trumpcard.md Reference. */
export const CARD_LIMITS = { 2: 26, 3: 17, 4: 13 };
export const STAT_CHOICE_TIMEOUT_MS = 10_000;
export const LIVES_START = 3;
/** Server-side pacing so every client's reveal animation gets a consistent window. */
export const ROUND_REVEAL_DELAY_MS = 4_000;
/**
 * Paid places and percentage splits by seated player count — the Ludo/Trumpcard
 * exception to Rule 2's fixed top-2 split, ported verbatim from
 * `../ludo/engine.ts`. After Rule 1's 5% fee is deducted from the pot.
 */
export const PAYOUT_TABLE = {
    2: { paidPlaces: 1, splits: [100] },
    3: { paidPlaces: 2, splits: [70, 30] },
    4: { paidPlaces: 3, splits: [50, 30, 20] },
};
// --- Canonical deck -------------------------------------------------------
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/**
 * Deterministic integer hash (no external deps) — same inputs always produce
 * the same output, so the deck is fixed rather than re-randomized per match.
 * A fixed deck keeps the game balanced by construction and unit-testable.
 */
function hashToRange(a, b, c, min, max) {
    let h = a * 374761393 + b * 668265263 + c * 2246822519;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    h = h >>> 0;
    return min + (h % (max - min + 1));
}
function buildCanonicalDeck() {
    const deck = [];
    SUITS.forEach((suit, suitIndex) => {
        for (const rank of RANKS) {
            const stats = {};
            STAT_KEYS.forEach((key, statIndex) => {
                stats[key] = hashToRange(suitIndex, rank, statIndex, 10, 99);
            });
            deck.push({ id: `${suit}-${rank}`, suit, rank, stats });
        }
    });
    return deck;
}
/** The one fixed 52-card deck every match deals from. */
export const CANONICAL_DECK = buildCanonicalDeck();
const DECK_BY_ID = new Map(CANONICAL_DECK.map((c) => [c.id, c]));
export function getCardById(cardId) {
    const card = DECK_BY_ID.get(cardId);
    if (!card)
        throw new Error(`Unknown card id: ${cardId}`);
    return card;
}
// --- Shuffle & deal -------------------------------------------------------
/** Fisher-Yates. Shuffling itself is not provably-fair — see the game doc's Open Questions. */
export function shuffleDeck(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}
/**
 * Shuffle the canonical deck and block-deal `cardsPerPlayer` cards to each
 * seat in order. Anything beyond `seatCount*cardsPerPlayer` (the 3-player
 * 51-of-52 case) is unused and dropped from the match entirely.
 */
export function dealHands(seatCount, cardsPerPlayer, playerIds) {
    const shuffled = shuffleDeck(CANONICAL_DECK);
    const hands = {};
    let cursor = 0;
    for (let i = 0; i < seatCount; i++) {
        const id = playerIds[i];
        hands[id] = shuffled.slice(cursor, cursor + cardsPerPlayer).map((c) => c.id);
        cursor += cardsPerPlayer;
    }
    const unused = shuffled.slice(cursor).map((c) => c.id);
    return { hands, unused };
}
// --- Match state ------------------------------------------------------------
export function createInitialState(seatCount, cardsPerPlayer, playerIds, durationMs) {
    const { hands } = dealHands(seatCount, cardsPerPlayer, playerIds);
    const lives = {};
    for (const id of playerIds)
        lives[id] = LIVES_START;
    return {
        seatCount,
        cardsPerPlayer,
        playerIds: [...playerIds],
        activePlayerIds: [...playerIds],
        hands,
        lives,
        pool: [],
        currentLeaderId: playerIds[Math.floor(Math.random() * playerIds.length)],
        leaderChoiceStartedAt: Date.now(),
        phase: 'leader_choosing',
        roundNumber: 1,
        disconnectedPlayers: [],
        eliminations: [],
        matchDeadline: Date.now() + durationMs,
    };
}
/**
 * Cyclic successor of `fromId` within `activePlayerIds`, walked via the fixed
 * original seat order so it still works when `fromId` itself was just
 * eliminated (a tie or a stat-choice skip can eliminate the current leader).
 */
export function getNextLeader(state, fromId) {
    const order = state.playerIds;
    const n = order.length;
    const startIdx = order.indexOf(fromId);
    for (let step = 1; step <= n; step++) {
        const candidate = order[(startIdx + step + n) % n];
        if (state.activePlayerIds.includes(candidate))
            return candidate;
    }
    return state.activePlayerIds[0];
}
/**
 * Compare every active player's top card on `statKey`.
 *
 * Single highest value takes every other active player's card (plus its own)
 * to the back of its pile, plus any carried-forward pool. Two or more tied for
 * highest: no winner this round — every active player's compared card this
 * round (not just the tied ones) goes into the shared pool, claimed by
 * whoever wins the next round. This is a confirmed reading of the game doc's
 * otherwise-silent 3+ player tie case (2 tied for highest, a 3rd strictly
 * lower has nobody to hand its card to either).
 */
export function resolveRound(state, statKey) {
    const activeIds = state.activePlayerIds;
    const comparison = activeIds.map((id) => {
        const cardId = state.hands[id][0];
        return { userId: id, cardId, value: getCardById(cardId).stats[statKey] };
    });
    const maxValue = Math.max(...comparison.map((c) => c.value));
    const topEntries = comparison.filter((c) => c.value === maxValue);
    const newHands = { ...state.hands };
    let newPool = [...state.pool];
    let winnerId = null;
    let tiedIds = [];
    let poolClaimedBy = null;
    const takenCards = [];
    for (const id of activeIds) {
        const hand = [...newHands[id]];
        const top = hand.shift();
        newHands[id] = hand;
        takenCards.push(top);
    }
    if (topEntries.length === 1) {
        winnerId = topEntries[0].userId;
        const claimedPool = newPool;
        newPool = [];
        poolClaimedBy = claimedPool.length > 0 ? winnerId : null;
        newHands[winnerId] = [...newHands[winnerId], ...takenCards, ...claimedPool];
    }
    else {
        tiedIds = topEntries.map((t) => t.userId);
        newPool = [...newPool, ...takenCards];
    }
    const newlyEliminated = [];
    let newActiveIds = [...activeIds];
    const eliminations = [...state.eliminations];
    for (const id of activeIds) {
        if (newHands[id].length === 0) {
            newlyEliminated.push(id);
            newActiveIds = newActiveIds.filter((x) => x !== id);
            eliminations.push({ userId: id, cause: 'cards', order: eliminations.length + 1 });
        }
    }
    let newState = {
        ...state,
        hands: newHands,
        pool: newPool,
        activePlayerIds: newActiveIds,
        eliminations,
        roundNumber: state.roundNumber + 1,
    };
    newState.currentLeaderId =
        winnerId && !newlyEliminated.includes(winnerId)
            ? winnerId
            : getNextLeader(newState, state.currentLeaderId);
    return { state: newState, comparison, winnerId, tiedIds, poolClaimedBy, newlyEliminated };
}
/**
 * Decrement a player's life for a stat-choice skip or a failed
 * disconnect-reconnect. At 0 lives: discard the player's entire remaining
 * hand (do NOT redistribute it — the game doc's explicit rule, and the one
 * deliberate difference from the Gaming_Hub reference demo, which
 * redistributes an eliminated player's cards).
 */
export function decrementLife(state, userId, cause) {
    const currentLives = state.lives[userId] ?? 0;
    if (currentLives <= 0 || !state.activePlayerIds.includes(userId)) {
        return { state, lifeLost: false, eliminated: false, cause };
    }
    const newLives = { ...state.lives, [userId]: currentLives - 1 };
    let newState = { ...state, lives: newLives };
    if ((newLives[userId] ?? 0) > 0) {
        return { state: newState, lifeLost: true, eliminated: false, cause };
    }
    const newHands = { ...newState.hands, [userId]: [] };
    const newActiveIds = newState.activePlayerIds.filter((id) => id !== userId);
    const eliminations = [
        ...newState.eliminations,
        { userId, cause: 'lives', order: newState.eliminations.length + 1 },
    ];
    newState = { ...newState, hands: newHands, activePlayerIds: newActiveIds, eliminations };
    if (newState.currentLeaderId === userId && newActiveIds.length > 0) {
        newState.currentLeaderId = getNextLeader(newState, userId);
    }
    return { state: newState, lifeLost: true, eliminated: true, cause };
}
// --- Disconnect tracking ------------------------------------------------
export function markDisconnected(state, userId) {
    if (state.disconnectedPlayers.includes(userId))
        return state;
    return { ...state, disconnectedPlayers: [...state.disconnectedPlayers, userId] };
}
export function markReconnected(state, userId) {
    return { ...state, disconnectedPlayers: state.disconnectedPlayers.filter((id) => id !== userId) };
}
// --- Match end / ranking / payout --------------------------------------------
/** Checked after every round resolves and before starting the next leader turn — never mid-round. */
export function checkMatchEnd(state) {
    if (state.activePlayerIds.length <= 1)
        return 'one_left';
    if (Date.now() >= state.matchDeadline)
        return 'timer';
    return null;
}
/**
 * Active players ranked by card count held (more = higher placement, ties
 * share a rank). Eliminated players are ranked below all active players, in
 * reverse elimination order (earlier eliminated = lower placement).
 */
export function rankFinalStandings(state) {
    const activeSorted = state.activePlayerIds
        .map((id) => ({ playerId: id, cardCount: state.hands[id]?.length ?? 0 }))
        .sort((a, b) => b.cardCount - a.cardCount);
    const results = [];
    let currentRank = 1;
    for (let i = 0; i < activeSorted.length; i++) {
        const entry = activeSorted[i];
        if (i > 0 && entry.cardCount === activeSorted[i - 1].cardCount) {
            results.push({ ...entry, rank: results[i - 1].rank, eliminatedAt: null });
        }
        else {
            results.push({ ...entry, rank: currentRank, eliminatedAt: null });
            currentRank++;
        }
    }
    let rank = results.length + 1;
    for (const elim of [...state.eliminations].reverse()) {
        results.push({ playerId: elim.userId, rank, cardCount: 0, eliminatedAt: elim.cause });
        rank++;
    }
    return results;
}
/**
 * Calculate payout weights from final standings and seat count. Returns an
 * array of { userId, weight } for paid places only. Ties are handled by
 * splitting that place's share evenly — ported from `../ludo/engine.ts`.
 */
export function calculatePayoutWeights(rankings, seatCount) {
    const payoutInfo = PAYOUT_TABLE[seatCount];
    if (!payoutInfo)
        return [];
    const { paidPlaces, splits } = payoutInfo;
    const result = [];
    for (let place = 1; place <= paidPlaces; place++) {
        const playersAtPlace = rankings.filter((r) => r.rank === place);
        if (playersAtPlace.length === 0)
            continue;
        const splitWeight = splits[place - 1] ?? 0;
        const perPlayerWeight = splitWeight / playersAtPlace.length;
        for (const p of playersAtPlace) {
            result.push({ userId: p.playerId, weight: perPlayerWeight });
        }
    }
    return result;
}
//# sourceMappingURL=engine.js.map