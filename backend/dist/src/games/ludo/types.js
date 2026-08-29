/**
 * Ludo game types.
 *
 * The match's `gameState` JSON column holds a LudoState.
 * Move records live in a separate table for reconnect catch-up
 * and after-the-fact result display.
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
/**
 * Standard Ludo track positions (0–50):
 *   - Position 0 is the start square for each color (safe)
 *   - Positions 1–50: the main path
 *   - Position 50 is the gate to the home column (not a track position per se;
 *     a token needs exact roll to enter home)
 *
 * Safe squares (protect from capture):
 *   - Start squares: positions 0 for each color (indices 0, 13, 26, 39 on the
 *     global track for Red, Green, Yellow, Blue respectively)
 *   - Star squares: positions 8, 21, 34, 47 on the global track
 *
 * Home column: 6 squares (positions 1–6), accessed after passing position 50.
 * A token needs an exact roll to enter the home column and travel through it.
 */
/** Number of track squares between start positions of consecutive colors. */
export const TRACK_SEGMENT = 13;
/** Safe squares on the global track (0-indexed). */
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
/** Start position offset for each color on the global 52-square track. */
export const COLOR_START_OFFSET = {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39,
};
/** Home column length (squares to reach final home). */
export const HOME_COLUMN_LENGTH = 6;
/** Total track length before entering home column. */
export const TRACK_LENGTH = 52;
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
    DICE_ROLLED: 'ludo:dice:rolled',
    TOKEN_MOVED: 'ludo:token:moved',
    TURN_START: 'ludo:turn:start',
    MATCH_RESULT: 'ludo:match:result',
    OPPONENT_DISCONNECTED: 'ludo:opponent:disconnect',
    OPPONENT_RECONNECTED: 'ludo:opponent:reconnect',
    ERROR: 'ludo:error',
};
//# sourceMappingURL=types.js.map