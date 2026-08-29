/**
 * Mine Catcher engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs and easy to unit-test.
 * This file never touches the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G03-Mine-Catcher.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4)
 */
// --- Constants ---------------------------------------------------------------
export const MINE_COUNT = 10;
export const PLACEMENT_TIMEOUT_MS = 30_000;
export const ATTACK_TIMEOUT_MS = 15_000;
export const MAX_LIVES = 3;
export const VALID_BOARD_SIZES = [25, 49, 81, 100];
// --- Board helpers -----------------------------------------------------------
/**
 * Create an empty player board with no mines placed.
 */
export function createEmptyBoard(boardSize) {
    return {
        mines: new Set(),
        revealed: Array.from({ length: boardSize }, () => 'hidden'),
        foundCount: 0,
    };
}
/**
 * Create the initial match state for two players.
 */
export function createInitialState(boardSize, playerIds) {
    return {
        boardSize,
        totalMines: MINE_COUNT,
        phase: 'placement',
        boards: {
            [playerIds[0]]: createEmptyBoard(boardSize),
            [playerIds[1]]: createEmptyBoard(boardSize),
        },
        foundCounts: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
        lives: { [playerIds[0]]: MAX_LIVES, [playerIds[1]]: MAX_LIVES },
        breakCounts: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
        currentAttacker: null,
        turnStartedAt: null,
        placementStartedAt: Date.now(),
        disconnectedPlayers: [],
        readyPlayers: [],
        winnerId: null,
        endCause: null,
    };
}
// --- Mine placement ----------------------------------------------------------
/**
 * Validate and apply mine placements for a player.
 * Returns the updated board, or null if the placement is invalid.
 */
export function placeMines(board, cellIndices, boardSize) {
    if (cellIndices.length !== MINE_COUNT)
        return null;
    // Validate all indices are within bounds and unique
    const unique = new Set(cellIndices);
    if (unique.size !== MINE_COUNT)
        return null;
    for (const idx of unique) {
        if (idx < 0 || idx >= boardSize)
            return null;
    }
    return {
        ...board,
        mines: unique,
    };
}
/**
 * Auto-place remaining mines randomly for a player who timed out.
 * Places mines on random empty cells that aren't already mined.
 */
export function autoPlaceMines(board, boardSize) {
    const existing = new Set(board.mines);
    const available = [];
    for (let i = 0; i < boardSize; i++) {
        if (!existing.has(i))
            available.push(i);
    }
    // Shuffle and pick remaining mines
    const remaining = MINE_COUNT - existing.size;
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = available[i];
        available[i] = available[j];
        available[j] = temp;
    }
    const newMines = new Set(existing);
    for (let i = 0; i < remaining && i < available.length; i++) {
        const cell = available[i];
        if (cell !== undefined)
            newMines.add(cell);
    }
    return {
        ...board,
        mines: newMines,
    };
}
/**
 * Resolve an attack on a cell of the opponent's board.
 * Returns the result and updates the board state.
 */
export function resolveAttack(attackerId, targetUserId, cellIndex, state) {
    if (state.phase === 'match_over') {
        return { result: { type: 'game_over' }, state };
    }
    if (state.currentAttacker !== attackerId) {
        return { result: { type: 'not_your_turn' }, state };
    }
    const targetBoard = state.boards[targetUserId];
    if (!targetBoard)
        return null;
    // Validate cell index
    if (cellIndex < 0 || cellIndex >= state.boardSize)
        return null;
    // Check if already revealed
    if (targetBoard.revealed[cellIndex] !== 'hidden') {
        return { result: { type: 'already_revealed' }, state };
    }
    const newRevealed = [...targetBoard.revealed];
    const isMine = targetBoard.mines.has(cellIndex);
    const newFoundCounts = { ...state.foundCounts };
    const newBreakCounts = { ...state.breakCounts };
    if (isMine) {
        newRevealed[cellIndex] = 'blast';
        newFoundCounts[attackerId] = (newFoundCounts[attackerId] ?? 0) + 1;
    }
    else {
        newRevealed[cellIndex] = 'break';
        newBreakCounts[attackerId] = (newBreakCounts[attackerId] ?? 0) + 1;
    }
    const newBoard = {
        ...targetBoard,
        revealed: newRevealed,
        foundCount: isMine ? (targetBoard.foundCount + 1) : targetBoard.foundCount,
    };
    // Alternate turn
    const attackerIds = Object.keys(state.boards);
    const otherPlayer = attackerIds.find((id) => id !== attackerId) ?? attackerId;
    const newState = {
        ...state,
        boards: { ...state.boards, [targetUserId]: newBoard },
        foundCounts: newFoundCounts,
        breakCounts: newBreakCounts,
        currentAttacker: otherPlayer,
        turnStartedAt: Date.now(),
    };
    const result = isMine
        ? { type: 'blast', cellIndex, foundCount: newFoundCounts[attackerId] ?? 0 }
        : { type: 'break', cellIndex };
    return { result, state: newState };
}
// --- Race end detection ------------------------------------------------------
/**
 * Check if a player has found all opponent mines (race won).
 * Returns the winner's userId if so, null otherwise.
 */
export function checkRaceEnd(state) {
    for (const [userId, count] of Object.entries(state.foundCounts)) {
        if (count >= state.totalMines)
            return userId;
    }
    return null;
}
// --- Lives system ------------------------------------------------------------
/**
 * Decrement a player's life. Returns the updated state.
 * If lives reach 0, the opponent wins by forfeit.
 */
export function decrementLife(state, userId) {
    const currentLives = state.lives[userId] ?? 0;
    if (currentLives <= 0) {
        return { state, lifeLost: false, gameOver: false, winnerId: null };
    }
    const newLives = { ...state.lives, [userId]: currentLives - 1 };
    const newState = {
        ...state,
        lives: newLives,
    };
    if ((newLives[userId] ?? 0) <= 0) {
        // Check dual-unreachable: is the opponent also disconnected?
        const opponentIds = Object.keys(state.boards).filter((id) => id !== userId);
        const opponent = opponentIds[0];
        const opponentDisconnected = opponent
            ? state.disconnectedPlayers.includes(opponent)
            : false;
        if (opponentDisconnected) {
            // Dual-unreachable: platform keeps the pot
            return {
                state: { ...newState, phase: 'match_over', winnerId: null, endCause: 'dual_unreachable' },
                lifeLost: true,
                gameOver: true,
                winnerId: null,
            };
        }
        // Normal forfeit: opponent wins
        return {
            state: {
                ...newState,
                phase: 'match_over',
                winnerId: opponent ?? null,
                endCause: 'lives_forfeit',
            },
            lifeLost: true,
            gameOver: true,
            winnerId: opponent ?? null,
        };
    }
    return { state: newState, lifeLost: true, gameOver: false, winnerId: null };
}
/**
 * Mark a player as disconnected.
 */
export function markDisconnected(state, userId) {
    if (state.disconnectedPlayers.includes(userId))
        return state;
    return {
        ...state,
        disconnectedPlayers: [...state.disconnectedPlayers, userId],
    };
}
/**
 * Mark a player as reconnected.
 */
export function markReconnected(state, userId) {
    return {
        ...state,
        disconnectedPlayers: state.disconnectedPlayers.filter((id) => id !== userId),
    };
}
/**
 * Mark a player as ready during placement phase.
 */
export function markReady(state, userId) {
    if (state.readyPlayers.includes(userId))
        return state;
    return {
        ...state,
        readyPlayers: [...state.readyPlayers, userId],
    };
}
/**
 * Check if both players are ready (placement phase complete).
 */
export function bothReady(state) {
    return state.readyPlayers.length >= 2;
}
/**
 * Transition from placement to attack phase.
 * Randomly selects who goes first.
 */
export function startAttackPhase(state) {
    const playerIds = Object.keys(state.boards);
    const firstAttacker = playerIds[Math.floor(Math.random() * playerIds.length)] ?? playerIds[0] ?? null;
    return {
        ...state,
        phase: 'attacking',
        currentAttacker: firstAttacker,
        turnStartedAt: Date.now(),
        placementStartedAt: null,
    };
}
/**
 * Get the opponent's userId for a given player.
 */
export function getOpponent(state, userId) {
    const ids = Object.keys(state.boards);
    return ids.find((id) => id !== userId) ?? null;
}
//# sourceMappingURL=engine.js.map