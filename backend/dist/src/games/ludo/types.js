/**
 * Ludo game types.
 *
 * The match's `gameState` JSON column holds a LudoState.
 * Move records live in a separate table for reconnect catch-up
 * and after-the-fact result display.
 *
 * BOARD MODEL (relative position):
 *   0        → still in the yard (not on the board)
 *   1–51     → on the shared 52-cell outer track (1-indexed relative steps)
 *   52–56    → in that color's private home column (safe from capture)
 *   57       → reached the center = token finished
 *
 * References:
 *   - Gambling_Docs/Games/G02-Ludo.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4, with Rule 2 exception)
 */
export const COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];
/** 2-player fixed pairing: Red vs Yellow. */
export const TWO_PLAYER_COLORS = ['red', 'yellow'];
/** Full 4-player color set. */
export const FOUR_PLAYER_COLORS = ['red', 'green', 'yellow', 'blue'];
// --- Board geometry ---------------------------------------------------------
/** Number of cells on the shared outer track. */
export const TRACK_CELLS = 52;
/** Relative position at which a token enters the home column. */
export const HOME_ENTRY = 51;
/** Relative position a token must land on EXACTLY to finish. */
export const FINISH = 57;
/** Tokens per player. */
export const TOKENS_PER_PLAYER = 4;
/** Home column length (52..56 = 5 squares, then 57 = finish). */
export const HOME_COLUMN_LENGTH = 6;
/** Legacy alias kept for compatibility with socket.ts imports. */
export const TRACK_LENGTH = TRACK_CELLS;
/** Number of track squares between consecutive color start points. */
export const TRACK_SEGMENT = 13;
/**
 * Absolute start offset for each color on the 52-cell shared track.
 * Used to convert a relative position to a global (absolute) cell.
 */
export const COLOR_START_OFFSET = {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39,
};
/**
 * Safe global cells — no captures happen here.
 * Each color's entry cell plus one star cell partway around from each start.
 */
export const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];
/** Legacy alias kept for socket.ts compatibility. */
export const SAFE_SQUARES = SAFE_CELLS;
// --- Socket events ----------------------------------------------------------
export const LUDO_EVENTS = {
    // Client → Server
    CREATE_MATCH: 'ludo:create',
    JOIN_MATCH: 'ludo:join',
    LIST_MATCHES: 'ludo:list',
    ROLL_DICE: 'ludo:roll',
    MOVE_TOKEN: 'ludo:move',
    LEAVE_LOBBY: 'ludo:leave',
    // Server → Client
    MATCH_STATE: 'ludo:state',
    MATCH_CREATED: 'ludo:created',
    MATCHES_LIST: 'ludo:matches',
    STAKE_REQUIRED: 'ludo:stake:required',
    DICE_ROLLING: 'ludo:dice:rolling',
    DICE_ROLLED: 'ludo:dice:rolled',
    TOKEN_MOVED: 'ludo:token:moved',
    TURN_START: 'ludo:turn:start',
    LIVES_UPDATE: 'ludo:lives:update',
    MATCH_RESULT: 'ludo:match:result',
    OPPONENT_DISCONNECTED: 'ludo:opponent:disconnect',
    OPPONENT_RECONNECTED: 'ludo:opponent:reconnect',
    ERROR: 'ludo:error',
};
//# sourceMappingURL=types.js.map