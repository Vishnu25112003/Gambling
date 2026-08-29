/**
 * Mine Catcher game types.
 *
 * The match's `gameState` JSON column holds a MineCatcherState.
 * Each player hides 10 mines on their own board, then takes turns
 * attacking the opponent's board. First to find all 10 wins instantly.
 */
/** Grid dimensions for a given board size. */
export function gridDimensions(size) {
    switch (size) {
        case 25: return { rows: 5, cols: 5 };
        case 49: return { rows: 7, cols: 7 };
        case 81: return { rows: 9, cols: 9 };
        case 100: return { rows: 10, cols: 10 };
    }
}
// --- Socket events -----------------------------------------------------------
export const MC_EVENTS = {
    // Client → Server
    JOIN_MATCH: 'mc:join',
    CREATE_MATCH: 'mc:create',
    LIST_MATCHES: 'mc:list',
    PLACE_MINES: 'mc:place',
    READY_UP: 'mc:ready',
    ATTACK_CELL: 'mc:attack',
    REMATCH_REQUEST: 'mc:rematch:request',
    // Server → Client
    MATCH_STATE: 'mc:state',
    MATCH_CREATED: 'mc:created',
    MATCHES_LIST: 'mc:matches',
    PLACEMENT_STARTED: 'mc:placement:started',
    MINES_PLACED: 'mc:mines:placed',
    PLAYER_READY: 'mc:player:ready',
    ATTACK_STARTED: 'mc:attack:started',
    ATTACK_RESULT: 'mc:attack:result',
    TURN_START: 'mc:turn:start',
    MATCH_RESULT: 'mc:match:result',
    LIVES_UPDATE: 'mc:lives:update',
    TIMER_TICK: 'mc:timer:tick',
    OPPONENT_DISCONNECTED: 'mc:opponent:disconnect',
    OPPONENT_RECONNECTED: 'mc:opponent:reconnect',
    REMATCH_WAITING: 'mc:rematch:waiting',
    REMATCH_OFFERED: 'mc:rematch:offered',
    ERROR: 'mc:error',
};
//# sourceMappingURL=types.js.map