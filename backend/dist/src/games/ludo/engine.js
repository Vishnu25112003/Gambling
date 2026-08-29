/**
 * Ludo engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs and easy to unit-test.
 * This file never touches the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G02-Ludo.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4, with Rule 2 exception)
 */
import { HOME_COLUMN_LENGTH, TRACK_LENGTH } from './types.js';
// --- Constants --------------------------------------------------------------
/** Max consecutive 6s allowed before the turn is forfeited (rule: 3 sixes = lose turn). */
export const MAX_CONSECUTIVE_SIXES = 3;
/** Timeout for a player to roll the dice (ms). */
export const ROLL_TIMEOUT_MS = 15_000;
/** Timeout for a player to choose which token to move after rolling (ms). */
export const MOVE_TIMEOUT_MS = 10_000;
// --- Payout table (overrides Rule 2) ----------------------------------------
/**
 * Paid places and percentage splits by seated player count.
 * After Rule 1's 5% fee is deducted from the pot.
 */
export const PAYOUT_TABLE = {
    2: { paidPlaces: 1, splits: [100] },
    3: { paidPlaces: 2, splits: [70, 30] },
    4: { paidPlaces: 3, splits: [50, 30, 20] },
};
// --- Safe squares -----------------------------------------------------------
/** Global track positions that are safe (tokens cannot be captured here). */
export const SAFE_POSITIONS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
/**
 * Start position offset for each color on the global track.
 * Red=0, Green=13, Yellow=26, Blue=39.
 */
export const COLOR_OFFSET = {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39,
};
// --- Color assignment -------------------------------------------------------
/** 2-player: fixed Red vs Yellow (opposite pairing). */
const TWO_PLAYER = ['red', 'yellow'];
/** 3-player: Red, Green, Yellow (standard subset). */
const THREE_PLAYER = ['red', 'green', 'yellow'];
/** 4-player: all four colors. */
const FOUR_PLAYER = ['red', 'green', 'yellow', 'blue'];
/**
 * Get the color set for a given player count.
 */
export function getColorSet(seatCount) {
    switch (seatCount) {
        case 2: return TWO_PLAYER;
        case 3: return THREE_PLAYER;
        case 4: return FOUR_PLAYER;
        default: throw new Error(`Invalid seat count: ${seatCount}`);
    }
}
/**
 * Assign colors to players in seat order.
 * Player 0 gets the first color, player 1 gets the second, etc.
 */
export function assignColors(playerIds, seatCount) {
    const colors = getColorSet(seatCount);
    const assignment = {};
    for (let i = 0; i < playerIds.length; i++) {
        assignment[playerIds[i]] = colors[i];
    }
    return assignment;
}
// --- Token helpers ----------------------------------------------------------
/** Create 4 tokens in the yard for a new player. */
export function createTokens() {
    return [
        { zone: 'yard', position: 0, homePosition: 0 },
        { zone: 'yard', position: 0, homePosition: 0 },
        { zone: 'yard', position: 0, homePosition: 0 },
        { zone: 'yard', position: 0, homePosition: 0 },
    ];
}
/** Count how many tokens a player has in each zone. */
export function countTokensByZone(tokens) {
    let yard = 0, track = 0, home = 0;
    for (const t of tokens) {
        if (t.zone === 'yard')
            yard++;
        else if (t.zone === 'track')
            track++;
        else
            home++;
    }
    return { yard, track, home };
}
/** Check if all 4 tokens are home (match-winning condition). */
export function allTokensHome(tokens) {
    return tokens.every((t) => t.zone === 'home' && t.homePosition >= HOME_COLUMN_LENGTH);
}
// --- Board position helpers -------------------------------------------------
/**
 * Get the global track position for a token on the track.
 * Wraps around the 52-square track using the color's offset.
 */
export function getGlobalPosition(color, trackPosition) {
    return (COLOR_OFFSET[color] + trackPosition) % TRACK_LENGTH;
}
/**
 * Get the global position a token would land on after moving `diceValue` steps
 * from its current track position. Returns -1 if it would enter the home column.
 */
export function getTargetGlobalPosition(color, currentPosition, diceValue) {
    const targetTrackPos = currentPosition + diceValue;
    if (targetTrackPos >= TRACK_LENGTH) {
        return -1; // entering home column
    }
    return getGlobalPosition(color, targetTrackPos);
}
/**
 * Check if a global position is a safe square.
 */
export function isSafeSquare(globalPosition) {
    return SAFE_POSITIONS.has(globalPosition);
}
/**
 * Check if a token is on its own start square (always safe).
 */
export function isOnOwnStart(color, trackPosition) {
    return trackPosition === 0;
}
/**
 * Classic Ludo "block": two tokens of the same color sharing a track square
 * form a block that no other color — including a third of that same color —
 * may land on. This checks the destination as it stands *before* the move:
 * empty or a single token of any color is always fine to land on (landing on
 * a single opponent captures it, per executeMove's existing capture logic);
 * two-or-more of one color already there means it's full.
 */
export function canOccupyTrackSquare(globalPosition, allTokens, playerIds, colors) {
    const countsByColor = {};
    for (const id of playerIds) {
        const playerColor = colors[id];
        const playerTokens = allTokens[id];
        if (!playerColor || !playerTokens)
            continue;
        for (const t of playerTokens) {
            if (t.zone === 'track' && getGlobalPosition(playerColor, t.position) === globalPosition) {
                countsByColor[playerColor] = (countsByColor[playerColor] ?? 0) + 1;
            }
        }
    }
    return Object.values(countsByColor).every((count) => count < 2);
}
/**
 * Get all valid moves for a player given the current dice roll.
 *
 * Rules:
 * - Yard tokens: only movable on a 6 (brings token to start square).
 * - Track tokens: movable if the destination isn't full — two tokens of one
 *   color already there is a block (see canOccupyTrackSquare); landing on a
 *   single opponent captures it, landing on a single token of your own forms
 *   a new block.
 * - Home column tokens: movable if destination doesn't exceed HOME_COLUMN_LENGTH.
 * - If no valid moves exist, the turn is skipped.
 */
export function getValidMoves(tokens, diceValue, color, allTokens, playerIds, colors) {
    const moves = [];
    const yardCount = tokens.filter((t) => t.zone === 'yard').length;
    // If all tokens are in yard and dice is not 6, no moves
    if (yardCount === tokens.length && diceValue !== 6) {
        return [];
    }
    // Check each token
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.zone === 'yard') {
            // Can only leave yard on a 6
            if (diceValue === 6) {
                const startGlobalPos = getGlobalPosition(color, 0);
                if (canOccupyTrackSquare(startGlobalPos, allTokens, playerIds, colors)) {
                    moves.push({ tokenIndex: i, type: 'yard' });
                }
            }
        }
        else if (token.zone === 'track') {
            const targetTrackPos = token.position + diceValue;
            if (targetTrackPos >= TRACK_LENGTH) {
                // Entering home column
                const homeEntry = targetTrackPos - TRACK_LENGTH;
                if (homeEntry <= HOME_COLUMN_LENGTH) {
                    // Check no friendly token already at this home position
                    const friendlyAtHome = tokens.some((t, j) => j !== i && t.zone === 'home' && t.homePosition === homeEntry);
                    if (!friendlyAtHome) {
                        moves.push({ tokenIndex: i, type: 'home' });
                    }
                }
            }
            else {
                // Moving on track — blocked only if the destination is already a
                // full block (two of one color, own or opponent's).
                const globalPos = getGlobalPosition(color, targetTrackPos);
                if (canOccupyTrackSquare(globalPos, allTokens, playerIds, colors)) {
                    moves.push({ tokenIndex: i, type: 'track' });
                }
            }
        }
        else if (token.zone === 'home') {
            const targetHomePos = token.homePosition + diceValue;
            if (targetHomePos <= HOME_COLUMN_LENGTH) {
                // Check no friendly token at destination
                const friendlyAtHome = tokens.some((t, j) => j !== i && t.zone === 'home' && t.homePosition === targetHomePos);
                if (!friendlyAtHome) {
                    moves.push({ tokenIndex: i, type: 'home' });
                }
            }
        }
    }
    return moves;
}
/**
 * Execute a move for a specific token.
 */
export function executeMove(tokens, tokenIndex, diceValue, color, allTokens, playerIds, colors) {
    const token = tokens[tokenIndex];
    const newTokens = tokens.map((t) => ({ ...t }));
    const target = newTokens[tokenIndex];
    const captured = [];
    let stepsMoved = 0;
    let enteredHome = false;
    let reachedHome = false;
    if (target.zone === 'yard' && diceValue === 6) {
        // Bring token out of yard to start square
        target.zone = 'track';
        target.position = 0;
        stepsMoved = 0; // stepping onto start square
    }
    else if (target.zone === 'track') {
        const targetTrackPos = target.position + diceValue;
        if (targetTrackPos >= TRACK_LENGTH) {
            // Entering home column
            const homeEntry = targetTrackPos - TRACK_LENGTH;
            target.zone = 'home';
            target.homePosition = homeEntry;
            enteredHome = true;
            reachedHome = homeEntry >= HOME_COLUMN_LENGTH;
            stepsMoved = diceValue;
        }
        else {
            // Moving on track
            target.position = targetTrackPos;
            stepsMoved = diceValue;
            // Check for capture
            const globalPos = getGlobalPosition(color, target.position);
            if (!isSafeSquare(globalPos)) {
                // Check all opponent tokens
                for (const oppId of playerIds) {
                    if (oppId === undefined)
                        continue;
                    const oppColor = colors[oppId];
                    if (oppColor === undefined || oppColor === color)
                        continue;
                    const oppTokens = allTokens[oppId];
                    if (!oppTokens)
                        continue;
                    for (let j = 0; j < oppTokens.length; j++) {
                        const oppToken = oppTokens[j];
                        if (oppToken.zone === 'track' &&
                            getGlobalPosition(oppColor, oppToken.position) === globalPos) {
                            // Capture! Send opponent token back to yard
                            oppToken.zone = 'yard';
                            oppToken.position = 0;
                            oppToken.homePosition = 0;
                            captured.push({ playerId: oppId, tokenIndex: j });
                        }
                    }
                }
            }
        }
    }
    else if (target.zone === 'home') {
        const targetHomePos = target.homePosition + diceValue;
        target.homePosition = targetHomePos;
        stepsMoved = diceValue;
        reachedHome = targetHomePos >= HOME_COLUMN_LENGTH;
    }
    return { tokens: newTokens, stepsMoved, captured, enteredHome, reachedHome };
}
// --- Match state ------------------------------------------------------------
/**
 * Create initial match state.
 */
export function createInitialState(seatCount, playerIds) {
    const colors = assignColors(playerIds, seatCount);
    const tokens = {};
    const totalSteps = {};
    for (const id of playerIds) {
        tokens[id] = createTokens();
        totalSteps[id] = 0;
    }
    return {
        seatCount,
        playerIds,
        colors,
        tokens,
        totalSteps,
        currentPlayerId: playerIds[0],
        phase: 'rolling',
        currentDice: null,
        consecutiveSixes: 0,
        turnNumber: 1,
        disconnectedPlayers: [],
    };
}
/**
 * Get the next player in turn order.
 */
export function getNextPlayer(currentPlayerId, playerIds) {
    const currentIndex = playerIds.indexOf(currentPlayerId);
    return playerIds[(currentIndex + 1) % playerIds.length];
}
/**
 * Check if the match is over (any player has all 4 tokens home).
 * Returns the winner's userId, or null if not over.
 */
export function checkMatchEnd(state) {
    for (const id of state.playerIds) {
        if (allTokensHome(state.tokens[id])) {
            return id;
        }
    }
    return null;
}
/**
 * Rank all players by total steps moved (more steps = higher rank).
 * Tied players share the same rank.
 * Forfeit players are excluded.
 */
export function rankPlayers(state, forfeitedPlayers) {
    const active = state.playerIds.filter((id) => !forfeitedPlayers.includes(id));
    const ranked = active
        .map((id) => ({ playerId: id, totalSteps: state.totalSteps[id] ?? 0 }))
        .sort((a, b) => b.totalSteps - a.totalSteps);
    let currentRank = 1;
    const result = [];
    for (let i = 0; i < ranked.length; i++) {
        const entry = ranked[i];
        if (i > 0 && entry.totalSteps === ranked[i - 1].totalSteps) {
            result.push({ playerId: entry.playerId, rank: result[i - 1].rank, totalSteps: entry.totalSteps });
        }
        else {
            result.push({ playerId: entry.playerId, rank: currentRank, totalSteps: entry.totalSteps });
            currentRank++;
        }
    }
    return result;
}
/**
 * Calculate payout weights from rankings and seat count.
 * Returns an array of { userId, weight } for paid places only.
 * Ties are handled by splitting that place's share evenly.
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
/**
 * Process a dice roll and determine the turn outcome.
 */
export function processDiceRoll(state) {
    const diceValue = (Math.floor(Math.random() * 6) + 1);
    const newState = { ...state, currentDice: diceValue };
    const playerTokens = state.tokens[state.currentPlayerId];
    const color = state.colors[state.currentPlayerId];
    const validMoves = getValidMoves(playerTokens, diceValue, color, state.tokens, state.playerIds, state.colors);
    // Three consecutive 6s = lose turn, no move
    let mustPass = false;
    if (diceValue === 6) {
        newState.consecutiveSixes = state.consecutiveSixes + 1;
        if (newState.consecutiveSixes >= MAX_CONSECUTIVE_SIXES) {
            mustPass = true;
            newState.consecutiveSixes = 0;
        }
    }
    else {
        newState.consecutiveSixes = 0;
    }
    return { state: newState, diceValue, validMoves, mustPass };
}
/**
 * Process a token move after dice roll.
 */
export function processTokenMove(state, tokenIndex) {
    const playerId = state.currentPlayerId;
    const color = state.colors[playerId];
    const diceValue = state.currentDice;
    const playerTokens = [...(state.tokens[playerId].map((t) => ({ ...t })))];
    const moveResult = executeMove(playerTokens, tokenIndex, diceValue, color, state.tokens, state.playerIds, state.colors);
    // Update tokens and total steps
    const newTokens = { ...state.tokens, [playerId]: moveResult.tokens };
    const newTotalSteps = {
        ...state.totalSteps,
        [playerId]: (state.totalSteps[playerId] ?? 0) + moveResult.stepsMoved,
    };
    const newState = {
        ...state,
        tokens: newTokens,
        totalSteps: newTotalSteps,
        currentDice: null,
    };
    // Check for match winner
    const matchWinner = checkMatchEnd(newState);
    // Determine extra turn or next player
    let getsExtraTurn = false;
    let nextPlayerId;
    if (matchWinner) {
        newState.phase = 'match_over';
        nextPlayerId = state.currentPlayerId;
    }
    else if (diceValue === 6 && state.consecutiveSixes < MAX_CONSECUTIVE_SIXES) {
        // Extra turn on rolling a 6 (unless it was the 3rd consecutive six,
        // which is already handled as a turn forfeit in processDiceRoll)
        getsExtraTurn = true;
        nextPlayerId = state.currentPlayerId;
    }
    else {
        nextPlayerId = getNextPlayer(state.currentPlayerId, state.playerIds);
    }
    newState.currentPlayerId = nextPlayerId;
    newState.turnNumber = state.turnNumber + 1;
    return { state: newState, result: moveResult, matchWinner, nextPlayerId, getsExtraTurn };
}
/**
 * Process a turn pass (no valid moves or 3 consecutive 6s).
 */
export function processTurnPass(state) {
    const nextPlayerId = getNextPlayer(state.currentPlayerId, state.playerIds);
    return {
        state: {
            ...state,
            currentDice: null,
            consecutiveSixes: 0,
            // Always return to the 'rolling' phase so the next player can roll.
            // Without this, a turn pass (e.g. on move/roll timeout) left phase ===
            // 'moving', and the next player's ROLL_DICE hit the "Not the rolling
            // phase" guard, surfacing a fatal "Not the moving phase" error.
            phase: 'rolling',
            currentPlayerId: nextPlayerId,
            turnNumber: state.turnNumber + 1,
        },
        nextPlayerId,
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