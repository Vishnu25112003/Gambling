import { describe, it, expect } from 'vitest';
import { getValidMoves, executeMove, canOccupyTrackSquare, getGlobalPosition, } from '../src/games/ludo/engine.js';
const A = 'player-a';
const B = 'player-b';
function track(position) {
    return { zone: 'track', position, homePosition: 0 };
}
function yard() {
    return { zone: 'yard', position: 0, homePosition: 0 };
}
describe('ludo engine — token blocking', () => {
    it('lets a second token of the same color land on its own token, forming a block', () => {
        // Red token0 at global 5, token1 at global 2 rolling a 3 -> also global 5.
        const aTokens = [track(5), track(2), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 3, 'red', allTokens, [A, B], colors);
        expect(moves).toContainEqual({ tokenIndex: 1, type: 'track' });
    });
    it('refuses a third same-color token onto an already-blocked square', () => {
        // Red tokens 0 and 1 already both sit on global 5 (a block). Token 2
        // rolling to land on global 5 too must be rejected.
        const aTokens = [track(5), track(5), track(2), yard()];
        const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 3, 'red', allTokens, [A, B], colors);
        expect(moves).not.toContainEqual({ tokenIndex: 2, type: 'track' });
    });
    it('refuses landing on an opponent block (two of one opposing color)', () => {
        // Red token0 at position 5 rolling a 5 lands on global 10.
        // Yellow (offset 26) needs trackPosition 36 to also land on global 10.
        const aTokens = [track(5), yard(), yard(), yard()];
        const bTokens = [track(36), track(36), yard(), yard()];
        expect(getGlobalPosition('yellow', 36)).toBe(10);
        const allTokens = { [A]: aTokens, [B]: bTokens };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 5, 'red', allTokens, [A, B], colors);
        expect(moves).not.toContainEqual({ tokenIndex: 0, type: 'track' });
        expect(canOccupyTrackSquare(10, allTokens, [A, B], colors)).toBe(false);
    });
    it('still allows capturing a single, unblocked opponent token (regression)', () => {
        const aTokens = [track(5), yard(), yard(), yard()];
        const bTokens = [track(36), yard(), yard(), yard()]; // single token, global 10
        const allTokens = { [A]: aTokens, [B]: bTokens };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 5, 'red', allTokens, [A, B], colors);
        expect(moves).toContainEqual({ tokenIndex: 0, type: 'track' });
        const result = executeMove(aTokens, 0, 5, 'red', allTokens, [A, B], colors);
        expect(result.captured).toEqual([{ playerId: B, tokenIndex: 0 }]);
        expect(result.tokens[0].position).toBe(10);
    });
    it('refuses leaving the yard onto a start square already blocked by an opponent', () => {
        // Yellow (offset 26) at trackPosition 26 sits on global 0 — red's own
        // start square — as a two-token block.
        expect(getGlobalPosition('yellow', 26)).toBe(0);
        const aTokens = [yard(), yard(), yard(), yard()];
        const bTokens = [track(26), track(26), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: bTokens };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 6, 'red', allTokens, [A, B], colors);
        expect(moves).not.toContainEqual({ tokenIndex: 0, type: 'yard' });
    });
    it('still allows the normal yard exit when the start square is clear', () => {
        const aTokens = [yard(), yard(), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 6, 'red', allTokens, [A, B], colors);
        expect(moves).toContainEqual({ tokenIndex: 0, type: 'yard' });
    });
});
describe('ludo engine — dice roll & extra turn (processDiceRoll / processTokenMove)', () => {
    const colors = { [A]: 'red', [B]: 'yellow' };
    it('a 6 grants an extra turn on BOTH the first and second consecutive six', async () => {
        const { createInitialState, processDiceRoll, processTokenMove } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(2, [A, B]);
        // Force the dice so we control the roll. processDiceRoll uses Math.random,
        // so stub it to always return 6 (=> value 6).
        const originalRandom = Math.random;
        Math.random = () => 0.99; // floor(0.99*6)+1 = 6
        // Roll 1: 6 -> extra turn
        let roll = processDiceRoll(state);
        expect(roll.diceValue).toBe(6);
        expect(roll.validMoves.length).toBeGreaterThan(0);
        let move = processTokenMove(roll.state, 0); // yard token out
        expect(move.getsExtraTurn).toBe(true);
        expect(move.nextPlayerId).toBe(A);
        state = move.state;
        // Roll 2: another 6 -> must STILL be an extra turn (bug: returned false)
        roll = processDiceRoll(state);
        expect(roll.diceValue).toBe(6);
        move = processTokenMove(roll.state, 1); // move a token on track
        expect(move.getsExtraTurn).toBe(true);
        expect(move.nextPlayerId).toBe(A);
        state = move.state;
        // Roll 3: third consecutive 6 -> forfeits turn (no extra turn, passes on)
        roll = processDiceRoll(state);
        expect(roll.diceValue).toBe(6);
        expect(roll.mustPass).toBe(true);
        Math.random = originalRandom;
    });
    it('a non-6 roll ends the turn (no extra turn) and passes to the next player', async () => {
        const { createInitialState, processDiceRoll, processTokenMove } = await import('../src/games/ludo/engine.js');
        const originalRandom = Math.random;
        try {
            // Stub random to return a non-6 (floor(0.4*6)+1 = 3).
            Math.random = () => 0.4;
            const state = createInitialState(2, [A, B]);
            // Bring one token onto the track so a normal move is possible.
            const ready = {
                ...state,
                tokens: {
                    ...state.tokens,
                    [A]: [{ zone: 'track', position: 0, homePosition: 0 }, ...state.tokens[A].slice(1)],
                },
            };
            const roll = processDiceRoll(ready);
            expect(roll.diceValue).toBe(3);
            expect(roll.validMoves.length).toBeGreaterThan(0);
            const move = processTokenMove(roll.state, 0);
            expect(move.getsExtraTurn).toBe(false);
            expect(move.nextPlayerId).toBe(B);
        }
        finally {
            Math.random = originalRandom;
        }
    });
    it('the dice value is uniformly random across many rolls (not fixed)', async () => {
        const { createInitialState, processDiceRoll } = await import('../src/games/ludo/engine.js');
        const state = createInitialState(2, [A, B]);
        const seen = new Set();
        for (let i = 0; i < 200; i++) {
            seen.add(processDiceRoll({ ...state, consecutiveSixes: 0 }).diceValue);
        }
        // With 200 random rolls we should see every face at least once.
        expect(seen.size).toBe(6);
    });
});
describe('ludo engine — turn pass phase regression', () => {
    it('processTurnPass always returns to the rolling phase (so the next roll is accepted)', async () => {
        const { createInitialState, processTurnPass } = await import('../src/games/ludo/engine.js');
        // Simulate a pass that happens while phase was 'moving' (the move-timeout
        // case). The old code left phase === 'moving', which made the next player's
        // ROLL_DICE hit the "Not the rolling phase" guard and fatal-error.
        const state = { ...createInitialState(2, [A, B]), phase: 'moving' };
        const { state: passed } = processTurnPass(state);
        expect(passed.phase).toBe('rolling');
        expect(passed.currentPlayerId).toBe(B);
    });
});
//# sourceMappingURL=ludo-engine.test.js.map