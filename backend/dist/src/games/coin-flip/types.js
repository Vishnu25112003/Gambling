/**
 * Coin Flip game types.
 *
 * The match's `gameState` JSON column holds a CoinFlipState. Round records
 * live in a separate table for reconnect catch-up and after-the-fact
 * verification (see G01-Coin-Flip.md "The Round Record").
 */
// --- Socket events ----------------------------------------------------------
export const CF_EVENTS = {
    // Client → Server
    JOIN_MATCH: 'cf:join',
    CREATE_MATCH: 'cf:create',
    LIST_MATCHES: 'cf:list',
    SPIN: 'cf:spin',
    CALL: 'cf:call',
    REMATCH_REQUEST: 'cf:rematch:request',
    // Server → Client
    STAKE_REQUIRED: 'cf:stake:required',
    MATCH_STATE: 'cf:state',
    REMATCH_WAITING: 'cf:rematch:waiting',
    REMATCH_OFFERED: 'cf:rematch:offered',
    MATCH_CREATED: 'cf:created',
    MATCHES_LIST: 'cf:matches',
    ROUND_START: 'cf:round:start',
    COMMIT_HASH: 'cf:commit',
    SPIN_STARTED: 'cf:spin:started',
    CALL_MADE: 'cf:call:made',
    REVEAL: 'cf:reveal',
    ROUND_RESULT: 'cf:round:result',
    MATCH_RESULT: 'cf:match:result',
    TIMER_TICK: 'cf:timer:tick',
    OPPONENT_DISCONNECTED: 'cf:opponent:disconnect',
    OPPONENT_RECONNECTED: 'cf:opponent:reconnect',
    ERROR: 'cf:error',
};
//# sourceMappingURL=types.js.map