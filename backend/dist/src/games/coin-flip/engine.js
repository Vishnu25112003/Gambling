/**
 * Coin Flip engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs and easy to unit-test.
 * This file never touches the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G01-Coin-Flip.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4)
 */
import { createHash, randomBytes } from 'node:crypto';
// --- Constants --------------------------------------------------------------
/** Odd round counts allowed by the spec. */
export const VALID_ROUND_COUNTS = [3, 5, 7, 9, 11, 13, 15];
/** Spinner has 10 seconds to initiate the spin. */
export const SPIN_TIMEOUT_MS = 10_000;
/** Caller has 10 seconds to call Head or Tail. */
export const CALL_TIMEOUT_MS = 10_000;
/** How long the result banner stays up before the next round (or the match
 * result, on the final round) begins. */
export const ROUND_TRANSITION_DELAY_MS = 2500;
// --- Commit-reveal helpers --------------------------------------------------
/**
 * Generate a random seed (hex string).
 * Used for both the seat draw and each coin result.
 */
export function generateSeed() {
    return randomBytes(32).toString('hex');
}
/**
 * Compute the commitment hash: sha256(seed || value).
 * value is lowercased before hashing for case-insensitive comparison.
 */
export function computeCommitHash(seed, value) {
    return createHash('sha256')
        .update(seed)
        .update(value.toLowerCase())
        .digest('hex');
}
/**
 * Verify a commitment: does hash(seed || value) === commitHash?
 */
export function verifyCommit(seed, value, commitHash) {
    return computeCommitHash(seed, value) === commitHash;
}
// --- Seat assignment --------------------------------------------------------
/**
 * Generate a fair seat assignment for Round 1.
 * Returns the seats and the commit info for the seat draw.
 */
export function generateSeatDraw(playerIds) {
    const seed = generateSeed();
    // Randomly assign: 'ab' means player[0]=spinner, player[1]=caller
    // 'ba' means player[0]=caller, player[1]=spinner
    const assignment = Math.random() < 0.5 ? 'ab' : 'ba';
    const commitHash = computeCommitHash(seed, assignment);
    const seats = {};
    if (assignment === 'ab') {
        seats[playerIds[0]] = 'spinner';
        seats[playerIds[1]] = 'caller';
    }
    else {
        seats[playerIds[0]] = 'caller';
        seats[playerIds[1]] = 'spinner';
    }
    return { seats, seed, commitHash, assignment };
}
/**
 * Determine seats for Round 2+.
 * The previous round's winner becomes the spinner; the loser becomes the caller.
 */
export function getNextSeats(previousWinner, previousLoser) {
    return {
        [previousWinner]: 'spinner',
        [previousLoser]: 'caller',
    };
}
// --- Coin result ------------------------------------------------------------
/**
 * Generate a coin result for a round. Returns the result and commit info.
 */
export function generateCoinResult() {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const seed = generateSeed();
    const commitHash = computeCommitHash(seed, result);
    return { result, seed, commitHash };
}
// --- Round resolution -------------------------------------------------------
/**
 * Determine the round winner based on the caller's call and the coin result.
 * Returns the winner userId and the cause.
 */
export function resolveRound(call, result, spinnerId, callerId) {
    if (call === null) {
        // Caller timed out — spinner wins
        return { winnerId: spinnerId, cause: 'no_call' };
    }
    if (call === result) {
        // Caller matched — caller wins
        return { winnerId: callerId, cause: 'correct_call' };
    }
    // Caller mismatched — spinner wins
    return { winnerId: spinnerId, cause: 'wrong_call' };
}
// --- Match state ------------------------------------------------------------
/**
 * Compute the clinch threshold for a given round count.
 * floor(rounds / 2) + 1
 */
export function clinchThreshold(totalRounds) {
    return Math.floor(totalRounds / 2) + 1;
}
/**
 * Create initial match state.
 */
export function createInitialState(totalRounds, playerIds) {
    return {
        totalRounds,
        currentRound: 1,
        clinchThreshold: clinchThreshold(totalRounds),
        scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
        seats: {},
        matchSeats: [],
        currentResult: null,
        currentCommitHash: null,
        currentSeed: null,
        currentCall: null,
        phase: 'seat_draw',
        spinStartedAt: null,
        callStartedAt: null,
        disconnectedPlayers: [],
    };
}
/**
 * Check if a player has clinched the match.
 * Returns the winner's userId if someone has clinched, null otherwise.
 */
export function checkClinch(scores, threshold) {
    for (const [userId, wins] of Object.entries(scores)) {
        if (wins >= threshold)
            return userId;
    }
    return null;
}
/**
 * Update scores after a round and check for clinch.
 */
export function updateScores(scores, winnerId, threshold) {
    const newScores = { ...scores };
    newScores[winnerId] = (newScores[winnerId] ?? 0) + 1;
    const winner = checkClinch(newScores, threshold);
    return { scores: newScores, winner };
}
// --- State transitions ------------------------------------------------------
/**
 * Transition from seat_draw phase: reveal the seat assignment.
 */
export function revealSeatDraw(state, seed, assignment, playerIds) {
    const seats = {};
    if (assignment === 'ab') {
        seats[playerIds[0]] = 'spinner';
        seats[playerIds[1]] = 'caller';
    }
    else {
        seats[playerIds[0]] = 'caller';
        seats[playerIds[1]] = 'spinner';
    }
    return {
        ...state,
        seats,
        matchSeats: [
            { userId: playerIds[0], seat: seats[playerIds[0]] },
            { userId: playerIds[1], seat: seats[playerIds[1]] },
        ],
        phase: 'waiting_spin',
        spinStartedAt: Date.now(),
        callStartedAt: null,
        currentCall: null,
        currentResult: null,
        currentSeed: null,
        currentCommitHash: null,
    };
}
/**
 * Transition from waiting_spin: spinner has initiated the spin.
 */
export function startSpin(state) {
    return {
        ...state,
        phase: 'waiting_call',
        callStartedAt: Date.now(),
    };
}
/**
 * Transition from waiting_call: caller has called or timed out.
 * Returns the new state plus the round record.
 */
export function resolveCall(state, call, result, spinnerId, callerId) {
    const { winnerId, cause } = resolveRound(call, result, spinnerId, callerId);
    const roundRecord = {
        roundNumber: state.currentRound,
        commitHash: state.currentCommitHash,
        seed: state.currentSeed,
        result,
        call,
        cause,
        spinnerId,
        callerId,
    };
    const { scores: newScores, winner } = updateScores(state.scores, winnerId, state.clinchThreshold);
    const nextPhase = winner ? 'match_over' : 'round_over';
    return {
        state: {
            ...state,
            scores: newScores,
            phase: nextPhase,
            currentCall: call,
        },
        record: roundRecord,
    };
}
/**
 * Resolve a round where the spinner never initiated the spin in time.
 *
 * This is NOT the same shape as resolveCall's `call === null` case — that one
 * means the caller failed to call *after a real spin*, and the spinner wins.
 * Here the spinner never acted at all, so the round always goes to the
 * caller instead. A previous version of this handler reused resolveCall for
 * both timeouts, which silently credited the win to the spinner every time —
 * the outward-facing broadcast said the caller won, but match.state.scores
 * (the only thing checkClinch actually reads) kept crediting the spinner, so
 * the match could later end for a player who never reached the real clinch
 * threshold.
 */
export function resolveSpinTimeout(state, spinnerId, callerId) {
    const roundRecord = {
        roundNumber: state.currentRound,
        commitHash: state.currentCommitHash,
        seed: state.currentSeed,
        result: state.currentResult,
        call: null,
        cause: 'no_spin',
        spinnerId,
        callerId,
    };
    const { scores: newScores, winner } = updateScores(state.scores, callerId, state.clinchThreshold);
    const nextPhase = winner ? 'match_over' : 'round_over';
    return {
        state: {
            ...state,
            scores: newScores,
            phase: nextPhase,
            currentCall: null,
        },
        record: roundRecord,
    };
}
/**
 * Advance to the next round after round_over.
 */
export function advanceRound(state, previousWinnerId, previousLoserId) {
    const nextSeats = getNextSeats(previousWinnerId, previousLoserId);
    return {
        ...state,
        currentRound: state.currentRound + 1,
        seats: nextSeats,
        currentResult: null,
        currentCommitHash: null,
        currentSeed: null,
        currentCall: null,
        phase: 'waiting_spin',
        spinStartedAt: Date.now(),
        callStartedAt: null,
    };
}
/**
 * Check if a timer has expired.
 */
export function isTimerExpired(startedAt, timeoutMs) {
    if (startedAt === null)
        return false;
    return Date.now() - startedAt >= timeoutMs;
}
//# sourceMappingURL=engine.js.map