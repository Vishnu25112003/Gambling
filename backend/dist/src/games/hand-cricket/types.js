/**
 * Hand Cricket game types.
 *
 * The match's `gameState` JSON column holds a HandCricketState. Each player
 * bats one innings; every ball both players simultaneously pick 1-6 — a
 * match is an out, otherwise the batter scores that many runs. Most runs
 * across both innings wins; a tie goes to a 6-ball Super Over.
 */
// --- Socket events -------------------------------------------------------------
export const HC_EVENTS = {
    // Client -> Server
    JOIN_MATCH: 'hc:join',
    CREATE_MATCH: 'hc:create',
    LIST_MATCHES: 'hc:list',
    PICK_NUMBER: 'hc:pick',
    REMATCH_REQUEST: 'hc:rematch:request',
    // Server -> Client
    MATCH_STATE: 'hc:state',
    MATCH_CREATED: 'hc:created',
    MATCHES_LIST: 'hc:matches',
    INNINGS_STARTED: 'hc:innings:started',
    BALL_STARTED: 'hc:ball:started',
    BALL_RESULT: 'hc:ball:result',
    INNINGS_OVER: 'hc:innings:over',
    SUPER_OVER_STARTED: 'hc:superover:started',
    MATCH_RESULT: 'hc:match:result',
    LIVES_UPDATE: 'hc:lives:update',
    OPPONENT_DISCONNECTED: 'hc:opponent:disconnect',
    OPPONENT_RECONNECTED: 'hc:opponent:reconnect',
    REMATCH_WAITING: 'hc:rematch:waiting',
    REMATCH_OFFERED: 'hc:rematch:offered',
    ERROR: 'hc:error',
};
//# sourceMappingURL=types.js.map