/**
 * Trumpcard game types.
 *
 * The match's `gameState` JSON column holds a TrumpcardState. Each player
 * holds an equal-sized pile of cards; the current leader picks a stat from
 * their top card, all active players' top cards are compared on it, and the
 * single highest value takes every other active player's card.
 *
 * References:
 *   - Gambling_Docs/Games/G04-Trumpcard.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1-4, with the Ludo/Trumpcard
 *     Rule 2 exception)
 */
/**
 * Six flavor stats, 1-99 each. No character-art pipeline exists in this repo
 * (Trumpcard.png is a single hub-tile promo image, not per-card art), so cards
 * are a generic stat-card rather than a character roster — see the game doc's
 * Reference table, which only specifies "6 stats" without naming them.
 */
export const STAT_KEYS = ['power', 'speed', 'defense', 'intellect', 'stamina', 'luck'];
// --- Socket events -----------------------------------------------------------
export const TRUMPCARD_EVENTS = {
    // Client -> Server
    CREATE_MATCH: 'trumpcard:create',
    JOIN_MATCH: 'trumpcard:join',
    LIST_MATCHES: 'trumpcard:list',
    LEAVE_LOBBY: 'trumpcard:leave',
    CHOOSE_STAT: 'trumpcard:choose_stat',
    // Server -> Client
    MATCH_CREATED: 'trumpcard:created',
    MATCHES_LIST: 'trumpcard:matches',
    MATCH_STATE: 'trumpcard:state',
    LEADER_TURN_START: 'trumpcard:leader:start',
    ROUND_REVEAL: 'trumpcard:round:reveal',
    LIVES_UPDATE: 'trumpcard:lives:update',
    PLAYER_ELIMINATED: 'trumpcard:player:eliminated',
    MATCH_RESULT: 'trumpcard:match:result',
    OPPONENT_DISCONNECTED: 'trumpcard:opponent:disconnect',
    OPPONENT_RECONNECTED: 'trumpcard:opponent:reconnect',
    ERROR: 'trumpcard:error',
    // Deliberately no REMATCH_* events — the game doc states Rematch is not
    // covered for 3+ seat matches (Rule 4's Rematch path is 2-player only).
};
//# sourceMappingURL=types.js.map