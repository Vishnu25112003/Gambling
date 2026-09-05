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

// --- Deck model ---------------------------------------------------------------

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/** 11=Jack, 12=Queen, 13=King, 14=Ace. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/**
 * Six flavor stats, 1-99 each. No character-art pipeline exists in this repo
 * (Trumpcard.png is a single hub-tile promo image, not per-card art), so cards
 * are a generic stat-card rather than a character roster — see the game doc's
 * Reference table, which only specifies "6 stats" without naming them.
 */
export const STAT_KEYS = ['power', 'speed', 'defense', 'intellect', 'stamina', 'luck'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface TrumpCard {
  /** `${suit}-${rank}`, stable and unique across the fixed 52-card deck. */
  id: string;
  suit: Suit;
  rank: Rank;
  stats: Record<StatKey, number>;
}

// --- Match phase ----------------------------------------------------------

export type TrumpcardPhase =
  | 'leader_choosing' // current leader has 10s to pick a stat
  | 'reveal'          // comparison broadcast, auto-advance delay running
  | 'match_over';

export type EliminationCause = 'cards' | 'lives';

export interface EliminationRecord {
  userId: string;
  cause: EliminationCause;
  /** 1 = first eliminated (worst placement). */
  order: number;
}

// --- Match state (stored in Match.gameState JSON) --------------------------

export interface TrumpcardState {
  seatCount: number;
  cardsPerPlayer: number;
  /** Original seat order, fixed for the life of the match. */
  playerIds: string[];
  /** playerIds minus eliminated players, in seat-rotation order. */
  activePlayerIds: string[];
  /** userId -> ordered card ids, index 0 = top of pile. */
  hands: Record<string, string[]>;
  lives: Record<string, number>;
  /** Tied cards carried forward, claimed by the next round's winner. */
  pool: string[];
  currentLeaderId: string;
  /** Date.now() when the current leader's 10s stat-choice window began. */
  leaderChoiceStartedAt: number;
  phase: TrumpcardPhase;
  roundNumber: number;
  disconnectedPlayers: string[];
  /** Push order == elimination order. */
  eliminations: EliminationRecord[];
  /** Date.now() deadline for the match's overall timer. */
  matchDeadline: number;
}

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
  STAKE_REQUIRED: 'trumpcard:stake:required',
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
} as const;
