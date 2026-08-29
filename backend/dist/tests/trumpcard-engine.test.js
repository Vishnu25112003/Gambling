import { describe, it, expect } from 'vitest';
import { CANONICAL_DECK, CARD_LIMITS, calculatePayoutWeights, checkMatchEnd, dealHands, decrementLife, getCardById, getNextLeader, rankFinalStandings, resolveRound, } from '../src/games/trumpcard/engine.js';
import { STAT_KEYS } from '../src/games/trumpcard/types.js';
const A = 'player-a';
const B = 'player-b';
const C = 'player-c';
const D = 'player-d';
function makeState(overrides) {
    const playerIds = Object.keys(overrides.hands);
    return {
        seatCount: playerIds.length,
        cardsPerPlayer: 1,
        playerIds,
        activePlayerIds: [...playerIds],
        lives: Object.fromEntries(playerIds.map((id) => [id, 3])),
        pool: [],
        currentLeaderId: playerIds[0],
        leaderChoiceStartedAt: Date.now(),
        phase: 'leader_choosing',
        roundNumber: 1,
        disconnectedPlayers: [],
        eliminations: [],
        matchDeadline: Date.now() + 60_000,
        ...overrides,
    };
}
describe('trumpcard engine — canonical deck', () => {
    it('has exactly 52 unique cards with 6 stats each in [10,99]', () => {
        expect(CANONICAL_DECK).toHaveLength(52);
        expect(new Set(CANONICAL_DECK.map((c) => c.id)).size).toBe(52);
        for (const card of CANONICAL_DECK) {
            for (const key of STAT_KEYS) {
                expect(card.stats[key]).toBeGreaterThanOrEqual(10);
                expect(card.stats[key]).toBeLessThanOrEqual(99);
            }
        }
    });
    it('is deterministic — the same card id always resolves to the same stats', () => {
        const id = CANONICAL_DECK[0].id;
        expect(getCardById(id)).toEqual(getCardById(id));
    });
    it('does not let a single card dominate every stat (sanity check on the hash spread)', () => {
        const allMax = CANONICAL_DECK.some((card) => STAT_KEYS.every((key) => card.stats[key] === 99));
        expect(allMax).toBe(false);
    });
});
describe('trumpcard engine — dealing', () => {
    it('deals the requested cards per player for each seat count and discards the rest', () => {
        for (const seatCount of [2, 3, 4]) {
            const max = CARD_LIMITS[seatCount];
            const ids = Array.from({ length: seatCount }, (_, i) => `p${i}`);
            const { hands, unused } = dealHands(seatCount, max, ids);
            for (const id of ids)
                expect(hands[id]).toHaveLength(max);
            expect(unused).toHaveLength(52 - seatCount * max);
        }
    });
    it('the 3-player max-cards case leaves exactly 1 card unused, per the deck-usage table', () => {
        const { unused } = dealHands(3, CARD_LIMITS[3], ['p0', 'p1', 'p2']);
        expect(unused).toHaveLength(1);
    });
    it('never deals the same card to two hands', () => {
        const { hands } = dealHands(4, CARD_LIMITS[4], ['p0', 'p1', 'p2', 'p3']);
        const all = Object.values(hands).flat();
        expect(new Set(all).size).toBe(all.length);
    });
});
describe('trumpcard engine — round resolution', () => {
    it('a single winner takes every other card and the loser is eliminated at 0 cards', () => {
        const sorted = [...CANONICAL_DECK].sort((a, b) => b.stats.power - a.stats.power);
        const winnerCard = sorted[0];
        const loserCard = sorted[sorted.length - 1];
        expect(winnerCard.stats.power).toBeGreaterThan(loserCard.stats.power);
        const state = makeState({
            hands: { [A]: [winnerCard.id], [B]: [loserCard.id] },
            currentLeaderId: A,
        });
        const { state: next, winnerId, newlyEliminated, comparison } = resolveRound(state, 'power');
        expect(winnerId).toBe(A);
        expect(comparison).toHaveLength(2);
        expect(next.hands[A]).toEqual([winnerCard.id, loserCard.id]);
        expect(next.hands[B]).toEqual([]);
        expect(newlyEliminated).toEqual([B]);
        expect(next.activePlayerIds).toEqual([A]);
        expect(next.eliminations).toEqual([{ userId: B, cause: 'cards', order: 1 }]);
        expect(next.currentLeaderId).toBe(A);
    });
    it('a tie pools every active players compared card (not just the tied ones), and the pool is claimed by the next decisive winner', () => {
        const statKey = STAT_KEYS[0];
        const sorted = [...CANONICAL_DECK].sort((a, b) => b.stats[statKey] - a.stats[statKey]);
        const maxCard = sorted[0];
        const lowerCard = sorted.find((c) => c.stats[statKey] < maxCard.stats[statKey]);
        expect(lowerCard.stats[statKey]).toBeLessThan(maxCard.stats[statKey]);
        // Round 1: A and B tie at the max value (forced via a shared card id — a
        // legitimate way to guarantee an exact tie in a hand-built test state),
        // C strictly lower. Each player keeps a second card so nobody empties out.
        const second = [sorted[10], sorted[11], sorted[12]];
        const state = makeState({
            hands: {
                [A]: [maxCard.id, second[0].id],
                [B]: [maxCard.id, second[1].id],
                [C]: [lowerCard.id, second[2].id],
            },
            currentLeaderId: A,
        });
        const r1 = resolveRound(state, statKey);
        expect(r1.winnerId).toBeNull();
        expect([...r1.tiedIds].sort()).toEqual([A, B].sort());
        expect(r1.poolClaimedBy).toBeNull();
        expect([...r1.state.pool].sort()).toEqual([maxCard.id, maxCard.id, lowerCard.id].sort());
        expect(r1.state.hands[A]).toEqual([second[0].id]);
        expect(r1.state.hands[B]).toEqual([second[1].id]);
        expect(r1.state.hands[C]).toEqual([second[2].id]);
        expect(r1.newlyEliminated).toEqual([]);
        // Tie -> leadership passes to the next player in seat order, not to a winner.
        expect(r1.state.currentLeaderId).toBe(B);
        // Round 2: whichever of the three "second" cards is highest on a fresh
        // stat wins outright and should claim the round-1 pool too.
        const statKey2 = STAT_KEYS[2];
        const candidates = [
            { player: A, card: second[0] },
            { player: B, card: second[1] },
            { player: C, card: second[2] },
        ];
        const maxVal2 = Math.max(...candidates.map((c) => c.card.stats[statKey2]));
        const winners2 = candidates.filter((c) => c.card.stats[statKey2] === maxVal2);
        expect(winners2).toHaveLength(1); // guard against an unlucky second-round tie
        const expectedWinner = winners2[0].player;
        const r2 = resolveRound(r1.state, statKey2);
        expect(r2.winnerId).toBe(expectedWinner);
        expect(r2.poolClaimedBy).toBe(expectedWinner);
        expect(r2.state.hands[expectedWinner]).toEqual([
            second[0].id, second[1].id, second[2].id,
            maxCard.id, maxCard.id, lowerCard.id,
        ]);
        const others = [A, B, C].filter((p) => p !== expectedWinner);
        for (const p of others)
            expect(r2.state.hands[p]).toEqual([]);
        expect([...r2.newlyEliminated].sort()).toEqual([...others].sort());
        expect(r2.state.activePlayerIds).toEqual([expectedWinner]);
        expect(r2.state.pool).toEqual([]);
    });
});
describe('trumpcard engine — lives system', () => {
    it('costs a life without eliminating while lives remain, and leaves the hand untouched', () => {
        const state = makeState({ hands: { [A]: ['x'], [B]: ['y'] }, lives: { [A]: 3, [B]: 3 } });
        const r = decrementLife(state, A, 'stat_choice_skip');
        expect(r.lifeLost).toBe(true);
        expect(r.eliminated).toBe(false);
        expect(r.state.lives[A]).toBe(2);
        expect(r.state.hands[A]).toEqual(['x']);
        expect(r.state.activePlayerIds).toContain(A);
    });
    it('discards the entire hand at 0 lives — does NOT redistribute it to anyone else', () => {
        const state = makeState({ hands: { [A]: ['x', 'y', 'z'], [B]: ['w'] }, lives: { [A]: 1, [B]: 3 } });
        const r = decrementLife(state, A, 'disconnect_timeout');
        expect(r.eliminated).toBe(true);
        expect(r.state.hands[A]).toEqual([]);
        expect(r.state.hands[B]).toEqual(['w']);
        expect(r.state.activePlayerIds).not.toContain(A);
        expect(r.state.eliminations).toEqual([{ userId: A, cause: 'lives', order: 1 }]);
    });
    it('reassigns the leader when the eliminated player was leading', () => {
        const state = makeState({
            hands: { [A]: ['x'], [B]: ['y'], [C]: ['z'] },
            lives: { [A]: 1, [B]: 3, [C]: 3 },
            currentLeaderId: A,
        });
        const r = decrementLife(state, A, 'stat_choice_skip');
        expect(r.eliminated).toBe(true);
        expect(r.state.currentLeaderId).toBe(B);
    });
    it('no-ops for a player already eliminated', () => {
        const state = makeState({ hands: { [B]: ['y'] }, activePlayerIds: [B], lives: { [A]: 0, [B]: 3 } });
        const r = decrementLife(state, A, 'stat_choice_skip');
        expect(r.lifeLost).toBe(false);
        expect(r.eliminated).toBe(false);
    });
});
describe('trumpcard engine — leader succession', () => {
    it('wraps around and skips eliminated players', () => {
        const state = makeState({ hands: { [A]: ['a'], [C]: ['c'] }, activePlayerIds: [A, C], playerIds: [A, B, C] });
        expect(getNextLeader(state, A)).toBe(C);
        expect(getNextLeader(state, C)).toBe(A);
    });
    it('still resolves correctly when fromId itself was just eliminated', () => {
        const state = makeState({ hands: { [A]: ['a'], [C]: ['c'] }, activePlayerIds: [A, C], playerIds: [A, B, C] });
        expect(getNextLeader(state, B)).toBe(C);
    });
});
describe('trumpcard engine — match end and ranking', () => {
    it('ends the match when only one active player remains', () => {
        expect(checkMatchEnd(makeState({ hands: { [A]: ['x'] }, activePlayerIds: [A] }))).toBe('one_left');
    });
    it('ends the match once the deadline has passed', () => {
        const state = makeState({ hands: { [A]: ['x'], [B]: ['y'] }, matchDeadline: Date.now() - 1 });
        expect(checkMatchEnd(state)).toBe('timer');
    });
    it('reports no end trigger while the match is still live', () => {
        const state = makeState({ hands: { [A]: ['x'], [B]: ['y'] }, matchDeadline: Date.now() + 60_000 });
        expect(checkMatchEnd(state)).toBeNull();
    });
    it('ranks active players by card count and eliminated players below them in reverse elimination order', () => {
        const state = makeState({
            hands: { [A]: ['a1', 'a2'], [B]: ['b1'] },
            activePlayerIds: [A, B],
            playerIds: [A, B, C, D],
            eliminations: [
                { userId: C, cause: 'cards', order: 1 },
                { userId: D, cause: 'lives', order: 2 },
            ],
        });
        const ranking = rankFinalStandings(state);
        expect(ranking.find((r) => r.playerId === A)).toMatchObject({ rank: 1, cardCount: 2 });
        expect(ranking.find((r) => r.playerId === B)).toMatchObject({ rank: 2, cardCount: 1 });
        // D eliminated LAST (order 2) ranks better than C eliminated FIRST (order 1).
        expect(ranking.find((r) => r.playerId === D)).toMatchObject({ rank: 3, eliminatedAt: 'lives' });
        expect(ranking.find((r) => r.playerId === C)).toMatchObject({ rank: 4, eliminatedAt: 'cards' });
    });
    it('matches the Ludo/Trumpcard seat-count-scaled payout table', () => {
        expect(calculatePayoutWeights([{ playerId: A, rank: 1 }], 2)).toEqual([{ userId: A, weight: 100 }]);
        expect(calculatePayoutWeights([{ playerId: A, rank: 1 }, { playerId: B, rank: 2 }, { playerId: C, rank: 3 }], 4)).toEqual([{ userId: A, weight: 50 }, { userId: B, weight: 30 }, { userId: C, weight: 20 }]);
    });
    it('splits a tied places share evenly', () => {
        const weights = calculatePayoutWeights([{ playerId: A, rank: 1 }, { playerId: B, rank: 1 }], 3);
        expect(weights).toEqual([{ userId: A, weight: 35 }, { userId: B, weight: 35 }]);
    });
});
//# sourceMappingURL=trumpcard-engine.test.js.map