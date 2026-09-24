/**
 * Ludo engine tests — updated for the new relative-position token model.
 *
 * Token.position:
 *   0      = yard
 *   1–51   = shared outer track
 *   52–56  = home column
 *   57     = finished (center)
 */
import { describe, it, expect } from 'vitest';
import { getValidMoves, executeMove, toGlobalCell, isSafeCell, } from '../src/games/ludo/engine.js';
const A = 'player-a';
const B = 'player-b';
// ---------- Helpers ---------------------------------------------------------
/** Token on the shared outer track (relative position 1–51). */
function track(relPos) {
    return { position: relPos };
}
/** Token in the yard. */
function yard() {
    return { position: 0 };
}
/** Token in the home column or finished (relative position 52–57). */
function home(relPos) {
    return { position: relPos };
}
// ---------- Token blocking --------------------------------------------------
describe('ludo engine — token blocking / capture', () => {
    it('lets a token land on an opponent single token and captures it', () => {
        // Red token0 at relative 5 rolling 5 → relative 10 (global 9).
        // Yellow (offset 26) token at relative 36 → global (26+36-1)%52 = 9 → same cell.
        const aTokens = [track(5), yard(), yard(), yard()];
        const bTokens = [track(36), yard(), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: bTokens };
        const colors = { [A]: 'red', [B]: 'yellow' };
        expect(toGlobalCell('yellow', 36)).toBe(9);
        expect(toGlobalCell('red', 10)).toBe(9);
        const result = executeMove(aTokens, 0, 5, 'red', allTokens, [A, B], colors);
        expect(result.captured).toEqual([{ playerId: B, tokenIndex: 0 }]);
        expect(result.tokens[0].position).toBe(10);
    });
    it('does NOT capture on a safe cell', () => {
        // SAFE_CELLS = [0,8,13,21,26,34,39,47]
        // Yellow offset=26: relative 22 → global (26+22-1)%52 = 47 → safe.
        // Red: to reach global 47 → relative 48 → (0+48-1)%52 = 47.
        // Red token at relative 42, rolling 6 → relative 48 (global 47, safe).
        const aTokens = [track(42), yard(), yard(), yard()];
        const bTokens = [track(22), yard(), yard(), yard()]; // yellow at global 47 (safe)
        const allTokens = { [A]: aTokens, [B]: bTokens };
        const colors = { [A]: 'red', [B]: 'yellow' };
        expect(isSafeCell(toGlobalCell('yellow', 22))).toBe(true);
        expect(toGlobalCell('red', 48)).toBe(47);
        expect(isSafeCell(47)).toBe(true);
        const result = executeMove(aTokens, 0, 6, 'red', allTokens, [A, B], colors);
        expect(result.captured).toEqual([]);
    });
    it('does not capture when token enters the home column (positions > 51)', () => {
        // Red token at relative 49 rolling 4 → relative 53 (home column). No capture possible.
        const aTokens = [track(49), yard(), yard(), yard()];
        const bTokens = [yard(), yard(), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: bTokens };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const result = executeMove(aTokens, 0, 4, 'red', allTokens, [A, B], colors);
        expect(result.tokens[0].position).toBe(53);
        expect(result.enteredHome).toBe(true);
        expect(result.captured).toEqual([]);
    });
});
// ---------- Move validation -------------------------------------------------
describe('ludo engine — getValidMoves', () => {
    it('only allows leaving yard on a 6', () => {
        const aTokens = [yard(), yard(), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const no = getValidMoves(aTokens, 3, 'red', allTokens, [A, B], colors);
        expect(no).toEqual([]);
        const yes = getValidMoves(aTokens, 6, 'red', allTokens, [A, B], colors);
        expect(yes.length).toBeGreaterThan(0);
        expect(yes[0]).toMatchObject({ type: 'yard', to: 1 });
    });
    it('skips tokens that would overshoot position 57', () => {
        // Token at relative 55 (home column). Rolling 5 → 60 > 57 → illegal.
        const aTokens = [home(55), yard(), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 5, 'red', allTokens, [A, B], colors);
        expect(moves.find((m) => m.tokenIndex === 0)).toBeUndefined();
    });
    it('allows finishing exactly on 57', () => {
        // Token at relative 54 rolling 3 → 57 exactly.
        const aTokens = [home(54), yard(), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 3, 'red', allTokens, [A, B], colors);
        expect(moves).toContainEqual({ tokenIndex: 0, to: 57, type: 'home' });
    });
    it('skips finished tokens entirely', () => {
        // Token at relative 57 (finished).
        const aTokens = [home(57), yard(), yard(), yard()];
        const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
        const colors = { [A]: 'red', [B]: 'yellow' };
        const moves = getValidMoves(aTokens, 6, 'red', allTokens, [A, B], colors);
        expect(moves.find((m) => m.tokenIndex === 0)).toBeUndefined();
    });
});
// ---------- Dice roll & extra turn ------------------------------------------
describe('ludo engine — dice roll & extra turn (processDiceRoll / processTokenMove)', () => {
    it('a 6 grants an extra turn on BOTH the first and second consecutive six', async () => {
        const { createInitialState, processDiceRoll, processTokenMove } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(2, [A, B]);
        const originalRandom = Math.random;
        Math.random = () => 0.99; // floor(0.99*6)+1 = 6
        // Roll 1: 6 → yard exit → extra turn
        let roll = processDiceRoll(state);
        expect(roll.diceValue).toBe(6);
        expect(roll.validMoves.length).toBeGreaterThan(0);
        let move = processTokenMove(roll.state, 0);
        expect(move.getsExtraTurn).toBe(true);
        expect(move.nextPlayerId).toBe(A);
        state = move.state;
        // Roll 2: another 6 → still extra turn
        roll = processDiceRoll(state);
        expect(roll.diceValue).toBe(6);
        move = processTokenMove(roll.state, 1);
        expect(move.getsExtraTurn).toBe(true);
        expect(move.nextPlayerId).toBe(A);
        state = move.state;
        // Roll 3: third consecutive 6 → forfeit
        roll = processDiceRoll(state);
        expect(roll.diceValue).toBe(6);
        expect(roll.mustPass).toBe(true);
        Math.random = originalRandom;
    });
    it('a non-6 roll ends the turn and passes to the next player', async () => {
        const { createInitialState, processDiceRoll, processTokenMove } = await import('../src/games/ludo/engine.js');
        const originalRandom = Math.random;
        try {
            Math.random = () => 0.4; // floor(0.4*6)+1 = 3
            let state = createInitialState(2, [A, B]);
            // Put one red token on the track so there is a valid move
            state = {
                ...state,
                tokens: {
                    ...state.tokens,
                    [A]: [track(5), yard(), yard(), yard()],
                },
            };
            const roll = processDiceRoll(state);
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
    it('dice is random across many rolls', async () => {
        const { createInitialState, processDiceRoll } = await import('../src/games/ludo/engine.js');
        const state = createInitialState(2, [A, B]);
        const seen = new Set();
        for (let i = 0; i < 200; i++) {
            seen.add(processDiceRoll({ ...state, consecutiveSixes: 0 }).diceValue);
        }
        expect(seen.size).toBe(6);
    });
});
// ---------- Turn pass phase regression --------------------------------------
describe('ludo engine — turn pass phase regression', () => {
    it('processTurnPass always returns to the rolling phase', async () => {
        const { createInitialState, processTurnPass } = await import('../src/games/ludo/engine.js');
        const state = { ...createInitialState(2, [A, B]), phase: 'moving' };
        const { state: passed } = processTurnPass(state);
        expect(passed.phase).toBe('rolling');
        expect(passed.currentPlayerId).toBe(B);
    });
});
// ---------- Six with no moves keeps the turn --------------------------------
describe('ludo engine — a 6 with zero valid moves keeps the turn', () => {
    it('processSixNoMoves keeps the same player and returns to rolling', async () => {
        const { createInitialState, processSixNoMoves } = await import('../src/games/ludo/engine.js');
        const state = { ...createInitialState(2, [A, B]), phase: 'rolling', currentDice: 6 };
        const result = processSixNoMoves(state);
        expect(result.currentPlayerId).toBe(A);
        expect(result.phase).toBe('rolling');
        expect(result.currentDice).toBeNull();
    });
});
// ---------- Points economy --------------------------------------------------
describe('ludo engine — points economy', () => {
    it('processTokenMove adds +1 point per step moved on the track', async () => {
        const { createInitialState, processTokenMove } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(2, [A, B]);
        state = {
            ...state,
            tokens: { ...state.tokens, [A]: [track(5), yard(), yard(), yard()] },
            currentDice: 4,
        };
        const { state: after } = processTokenMove(state, 0);
        expect(after.points[A]).toBeGreaterThanOrEqual(4); // ≥4 (capture bonus adds more)
        expect(after.totalSteps[A]).toBe(4);
    });
    it('a capture gives the mover +10 and the victim -10', async () => {
        const { createInitialState, processTokenMove } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(2, [A, B]);
        // Red at 5 rolling 5 → relative 10 (global 9).
        // Yellow at 36 → global 9 (offset 26, so (26+36-1)%52=9).
        state = {
            ...state,
            tokens: {
                ...state.tokens,
                [A]: [track(5), yard(), yard(), yard()],
                [B]: [track(36), yard(), yard(), yard()],
            },
            currentDice: 5,
        };
        const { state: after, result } = processTokenMove(state, 0);
        expect(result.captured).toEqual([{ playerId: B, tokenIndex: 0 }]);
        expect(after.points[A]).toBe(5 + 10); // steps + capture bonus
        expect(after.points[B]).toBe(-10);
    });
    it('reaching final home gives +50 on top of the steps moved', async () => {
        const { createInitialState, processTokenMove } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(2, [A, B]);
        // Token in home column at relative 55, rolling 2 → 57 (finish).
        state = {
            ...state,
            tokens: { ...state.tokens, [A]: [home(55), yard(), yard(), yard()] },
            currentDice: 2,
        };
        const { state: after, result } = processTokenMove(state, 0);
        expect(result.reachedHome).toBe(true);
        expect(after.points[A]).toBe(2 + 50); // steps + home bonus
    });
    it('rankPlayers and calculatePayoutWeights rank by points, not totalSteps', async () => {
        const { createInitialState, rankPlayers, calculatePayoutWeights } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(2, [A, B]);
        state = {
            ...state,
            totalSteps: { [A]: 40, [B]: 10 },
            points: { [A]: -10, [B]: 20 },
        };
        const rankings = rankPlayers(state, []);
        const first = rankings.find((r) => r.rank === 1);
        expect(first.playerId).toBe(B);
        expect(first.points).toBe(20);
        const weights = calculatePayoutWeights(rankings, 2);
        expect(weights).toEqual([{ userId: B, weight: 100 }]);
    });
});
// ---------- Lives -----------------------------------------------------------
describe('ludo engine — lives', () => {
    it('createInitialState seeds every player at MAX_LIVES', async () => {
        const { createInitialState, MAX_LIVES } = await import('../src/games/ludo/engine.js');
        const state = createInitialState(2, [A, B]);
        expect(state.lives[A]).toBe(MAX_LIVES);
        expect(state.lives[B]).toBe(MAX_LIVES);
    });
});
// ---------- Match end -------------------------------------------------------
describe('ludo engine — match end (all 4 tokens at position 57)', () => {
    it('checkMatchEnd returns the winner once all 4 tokens reach 57', async () => {
        const { createInitialState, checkMatchEnd, processTokenMove } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(2, [A, B]);
        // A has 3 tokens finished, 1 at relative 56 (one step from finish).
        state = {
            ...state,
            tokens: {
                ...state.tokens,
                [A]: [home(57), home(57), home(57), home(56)],
                [B]: [track(5), yard(), yard(), yard()],
            },
            currentDice: 1,
        };
        const { state: after, matchWinner } = processTokenMove(state, 3);
        expect(after.tokens[A][3].position).toBe(57);
        expect(checkMatchEnd(after)).toBe(A);
        expect(matchWinner).toBe(A);
    });
});
// ---------- Turn rotation skips forfeited players ---------------------------
describe('ludo engine — turn rotation skips forfeited/eliminated players', () => {
    const C = 'player-c';
    const D = 'player-d';
    it('getNextPlayer skips a forfeited seat', async () => {
        const { getNextPlayer } = await import('../src/games/ludo/engine.js');
        expect(getNextPlayer(A, [A, B, C, D], [B])).toBe(C);
    });
    it('getNextPlayer skips multiple forfeited seats in a row', async () => {
        const { getNextPlayer } = await import('../src/games/ludo/engine.js');
        expect(getNextPlayer(A, [A, B, C, D], [B, C])).toBe(D);
    });
    it('getNextPlayer with no forfeits works normally', async () => {
        const { getNextPlayer } = await import('../src/games/ludo/engine.js');
        expect(getNextPlayer(A, [A, B, C, D])).toBe(B);
    });
    it('processTurnPass routes around a forfeited player in a 4-seat match', async () => {
        const { createInitialState, processTurnPass } = await import('../src/games/ludo/engine.js');
        const state = createInitialState(4, [A, B, C, D]);
        const { state: after } = processTurnPass(state, [B]);
        expect(after.currentPlayerId).toBe(C);
    });
    it('processTokenMove routes the next turn around a forfeited player', async () => {
        const { createInitialState, processTokenMove } = await import('../src/games/ludo/engine.js');
        let state = createInitialState(4, [A, B, C, D]);
        state = {
            ...state,
            tokens: { ...state.tokens, [A]: [track(5), yard(), yard(), yard()] },
            currentDice: 3, // non-6, so turn passes on
        };
        const { nextPlayerId } = processTokenMove(state, 0, [B]);
        expect(nextPlayerId).toBe(C);
    });
});
//# sourceMappingURL=ludo-engine.test.js.map