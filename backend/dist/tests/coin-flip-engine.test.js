import { describe, it, expect } from 'vitest';
import { createInitialState, resolveCall, resolveSpinTimeout, advanceRound, } from '../src/games/coin-flip/engine.js';
const A = 'player-a';
const B = 'player-b';
describe('coin-flip engine — round resolution', () => {
    it('credits the caller, not the spinner, on a spin-initiation timeout', () => {
        // Regression: resolveSpinTimeout replaced a call site that reused
        // resolveCall(state, null, ...) for the spin-timeout case. That path
        // hardcodes "null call -> spinner wins" (correct for a CALL timeout),
        // so a spin timeout was silently crediting the spinner's score even
        // though the broadcast to clients said the caller won.
        let state = createInitialState(3, [A, B]);
        state = { ...state, seats: { [A]: 'spinner', [B]: 'caller' }, currentCommitHash: 'hash', currentSeed: 'seed', currentResult: 'heads' };
        const { state: next, record } = resolveSpinTimeout(state, A, B);
        expect(record.cause).toBe('no_spin');
        expect(next.scores[B]).toBe(1); // caller (B) credited
        expect(next.scores[A]).toBe(0); // spinner (A) NOT credited
    });
    it('still credits the spinner on a call timeout (unchanged, correct behavior)', () => {
        let state = createInitialState(3, [A, B]);
        state = { ...state, seats: { [A]: 'spinner', [B]: 'caller' }, currentCommitHash: 'hash', currentSeed: 'seed', currentResult: 'heads' };
        const { state: next, record } = resolveCall(state, null, 'heads', A, B);
        expect(record.cause).toBe('no_call');
        expect(next.scores[A]).toBe(1); // spinner (A) credited
        expect(next.scores[B]).toBe(0);
    });
    it('a run of spin timeouts clinches the caller, never the spinner who kept stalling', () => {
        // 3-round match, clinch threshold = 2. If A is repeatedly assigned
        // spinner and never spins, B (the caller) must be the one who clinches.
        let state = createInitialState(3, [A, B]);
        state = { ...state, seats: { [A]: 'spinner', [B]: 'caller' }, currentCommitHash: 'h1', currentSeed: 's1', currentResult: 'heads' };
        const round1 = resolveSpinTimeout(state, A, B);
        expect(round1.state.phase).toBe('round_over');
        expect(round1.state.scores[B]).toBe(1);
        state = advanceRound(round1.state, B, A); // B won round 1 -> B spins round 2
        state = { ...state, currentCommitHash: 'h2', currentSeed: 's2', currentResult: 'tails' };
        // Round 2: A is caller now — say A calls wrong, spinner (B) wins round 2.
        const round2 = resolveCall(state, 'heads', 'tails', B, A);
        expect(round2.record.cause).toBe('wrong_call');
        expect(round2.state.scores[B]).toBe(2);
        expect(round2.state.phase).toBe('match_over');
        // B reached the clinch threshold honestly — never via a phantom credit to A.
        expect(round2.state.scores[A]).toBe(0);
    });
});
//# sourceMappingURL=coin-flip-engine.test.js.map