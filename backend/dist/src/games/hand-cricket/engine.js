/**
 * Hand Cricket engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs (bar the two explicit
 * random-first-batter draws) and easy to unit-test. This file never touches
 * the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G05-Hand-Cricket.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1-4)
 */
// --- Constants ---------------------------------------------------------------
export const MAX_LIVES = 3;
export const PICK_TIMEOUT_MS = 10_000;
export const SUPER_OVER_BALLS = 6;
export const VALID_BALLS_PER_INNINGS = [6, 8, 10, 12];
// --- Innings helpers -----------------------------------------------------------
function createInnings(batterId, bowlerId, ballsPerInnings) {
    return {
        batterId,
        bowlerId,
        ballsPerInnings,
        ballsBowled: 0,
        runs: 0,
        isOut: false,
        ballLog: [],
    };
}
/**
 * Create the initial match state for two players. Randomly picks who bats
 * first, per the spec ("system randomly picks who bats first").
 */
export function createInitialState(ballsPerInnings, playerIds) {
    const firstBatter = playerIds[Math.floor(Math.random() * 2)];
    const firstBowler = playerIds.find((id) => id !== firstBatter);
    return {
        ballsPerInnings,
        phase: 'batting',
        lives: { [playerIds[0]]: MAX_LIVES, [playerIds[1]]: MAX_LIVES },
        currentInningsIndex: 0,
        innings: [createInnings(firstBatter, firstBowler, ballsPerInnings)],
        pendingBall: null,
        disconnectedPlayers: [],
        winnerId: null,
        endCause: null,
    };
}
// --- Simultaneous pick / ball resolution ---------------------------------------
/**
 * Start a fresh ball awaiting both players' picks. Called at innings start
 * and after every resolved or discarded (stalled) ball.
 */
export function startNewBall(state, now = Date.now()) {
    return { ...state, pendingBall: { ballStartedAt: now, picks: {} } };
}
/**
 * Record one player's pick for the ball in progress. Pure — does not resolve
 * the ball itself, since resolution timing (as soon as both picks are in) is
 * the socket layer's job.
 */
export function submitPick(state, userId, pick) {
    if (!state.pendingBall)
        return state;
    if (pick < 1 || pick > 6 || !Number.isInteger(pick))
        return state;
    const innings = state.currentInningsIndex !== null ? state.innings[state.currentInningsIndex] : undefined;
    if (!innings)
        return state;
    if (userId !== innings.batterId && userId !== innings.bowlerId)
        return state;
    return {
        ...state,
        pendingBall: {
            ...state.pendingBall,
            picks: { ...state.pendingBall.picks, [userId]: pick },
        },
    };
}
/** True once both the batter and bowler of the current innings have picked. */
export function bothPicksIn(state) {
    if (!state.pendingBall || state.currentInningsIndex === null)
        return false;
    const innings = state.innings[state.currentInningsIndex];
    if (!innings)
        return false;
    return (state.pendingBall.picks[innings.batterId] !== undefined &&
        state.pendingBall.picks[innings.bowlerId] !== undefined);
}
/**
 * Resolve the ball currently in progress. Requires both picks to already be
 * in (callers must check `bothPicksIn` first) — otherwise this is a no-op.
 */
export function resolveBall(state) {
    if (!bothPicksIn(state) || state.currentInningsIndex === null)
        return null;
    const idx = state.currentInningsIndex;
    const innings = state.innings[idx];
    if (!innings || !state.pendingBall)
        return null;
    const batterPick = state.pendingBall.picks[innings.batterId];
    const bowlerPick = state.pendingBall.picks[innings.bowlerId];
    const out = batterPick === bowlerPick;
    const runsScored = out ? 0 : batterPick;
    const ballNumber = innings.ballsBowled + 1;
    const logEntry = { ball: ballNumber, batterPick, bowlerPick, runsScored, out };
    const newInnings = {
        ...innings,
        ballsBowled: ballNumber,
        runs: innings.runs + runsScored,
        isOut: out,
        ballLog: [...innings.ballLog, logEntry],
    };
    const newInningsList = [...state.innings];
    newInningsList[idx] = newInnings;
    return {
        state: { ...state, innings: newInningsList, pendingBall: null },
        ballResult: { ballNumber, batterPick, bowlerPick, runsScored, out },
    };
}
// --- Innings progression ---------------------------------------------------
export function currentInnings(state) {
    if (state.currentInningsIndex === null)
        return null;
    return state.innings[state.currentInningsIndex] ?? null;
}
/** True once the live innings has ended (out, or balls used up). */
export function checkInningsEnd(state) {
    const innings = currentInnings(state);
    if (!innings)
        return false;
    return innings.isOut || innings.ballsBowled >= innings.ballsPerInnings;
}
/**
 * Push the next innings with batter/bowler roles swapped from the innings
 * that just ended. Used for both the main-match 1->2 swap and the
 * Super-Over 3->4 swap.
 */
export function advanceInnings(state) {
    const prev = currentInnings(state);
    if (!prev)
        return state;
    const next = createInnings(prev.bowlerId, prev.batterId, prev.ballsPerInnings);
    const innings = [...state.innings, next];
    return { ...state, innings, currentInningsIndex: innings.length - 1 };
}
/**
 * Compare the pair of innings that just completed (indices [n-2, n-1] of
 * `state.innings`) — main match = [0,1], Super Over = [2,3].
 */
export function compareRuns(state) {
    const n = state.innings.length;
    const a = state.innings[n - 2];
    const b = state.innings[n - 1];
    if (!a || !b)
        return { decided: false, winnerId: null, tied: true };
    if (a.runs === b.runs)
        return { decided: false, winnerId: null, tied: true };
    const winnerId = a.runs > b.runs ? a.batterId : b.batterId;
    return { decided: true, winnerId, tied: false };
}
/**
 * Start a 6-ball Super Over after the main match ties. Draws a fresh random
 * first batter — the spec does not require batting-order continuity from
 * the main match.
 */
export function startSuperOver(state) {
    const playerIds = Object.keys(state.lives);
    const firstBatter = playerIds[Math.floor(Math.random() * playerIds.length)];
    const firstBowler = playerIds.find((id) => id !== firstBatter);
    const superInnings = createInnings(firstBatter, firstBowler, SUPER_OVER_BALLS);
    const innings = [...state.innings, superInnings];
    return {
        ...state,
        phase: 'super_over',
        innings,
        currentInningsIndex: innings.length - 1,
    };
}
/**
 * Single decision point for what happens once an innings has just ended.
 * Pure — does not mutate `state`; callers apply the result themselves.
 */
export function checkMatchEnd(state) {
    const n = state.innings.length;
    if (n === 2) {
        const cmp = compareRuns(state);
        if (cmp.decided)
            return { over: true, winnerId: cmp.winnerId, endCause: 'runs_higher' };
        return { over: false, winnerId: null, endCause: null };
    }
    if (n === 4) {
        const cmp = compareRuns(state);
        if (cmp.decided)
            return { over: true, winnerId: cmp.winnerId, endCause: 'super_over_decided' };
        return { over: true, winnerId: null, endCause: 'super_over_tied_split' };
    }
    return { over: false, winnerId: null, endCause: null };
}
// --- Lives system --------------------------------------------------------------
/**
 * Decrement a player's life. Returns the updated state. If lives reach 0,
 * the opponent wins by forfeit — unless the opponent is also disconnected
 * at that moment, in which case the platform keeps the pot instead.
 */
export function decrementLife(state, userId) {
    const currentLives = state.lives[userId] ?? 0;
    if (currentLives <= 0) {
        return { state, lifeLost: false, gameOver: false, winnerId: null };
    }
    const newLives = { ...state.lives, [userId]: currentLives - 1 };
    const newState = { ...state, lives: newLives };
    if ((newLives[userId] ?? 0) <= 0) {
        const opponent = Object.keys(state.lives).find((id) => id !== userId) ?? null;
        const opponentDisconnected = opponent ? state.disconnectedPlayers.includes(opponent) : false;
        if (opponentDisconnected) {
            return {
                state: { ...newState, phase: 'match_over', winnerId: null, endCause: 'dual_unreachable' },
                lifeLost: true,
                gameOver: true,
                winnerId: null,
            };
        }
        return {
            state: { ...newState, phase: 'match_over', winnerId: opponent, endCause: 'lives_forfeit' },
            lifeLost: true,
            gameOver: true,
            winnerId: opponent,
        };
    }
    return { state: newState, lifeLost: true, gameOver: false, winnerId: null };
}
/** Mark a player as disconnected. */
export function markDisconnected(state, userId) {
    if (state.disconnectedPlayers.includes(userId))
        return state;
    return { ...state, disconnectedPlayers: [...state.disconnectedPlayers, userId] };
}
/** Mark a player as reconnected. */
export function markReconnected(state, userId) {
    return { ...state, disconnectedPlayers: state.disconnectedPlayers.filter((id) => id !== userId) };
}
/** Get the opponent's userId for a given player. */
export function getOpponent(state, userId) {
    return Object.keys(state.lives).find((id) => id !== userId) ?? null;
}
//# sourceMappingURL=engine.js.map