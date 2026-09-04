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

// --- Player color / seat ----------------------------------------------------

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export const COLOR_ORDER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

/** 2-player fixed pairing: Red vs Yellow. */
export const TWO_PLAYER_COLORS: LudoColor[] = ['red', 'yellow'];

/** Full 4-player color set. */
export const FOUR_PLAYER_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

// --- Token state ------------------------------------------------------------

/** Where a token can be. */
export type TokenZone = 'yard' | 'track' | 'home';

export interface Token {
  zone: TokenZone;
  /** Track position 0–50 (0 = start square, 50 = home entry). Only meaningful when zone === 'track'. */
  position: number;
  /** Home column position 1–6. Only meaningful when zone === 'home'. */
  homePosition: number;
}

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
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47] as const;

/** Start position offset for each color on the global 52-square track. */
export const COLOR_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/** Home column length (squares to reach final home). */
export const HOME_COLUMN_LENGTH = 6;

/** Total track length before entering home column. */
export const TRACK_LENGTH = 52;

// --- Dice -------------------------------------------------------------------

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface DiceRoll {
  value: DiceValue;
  /** Commit hash for provably-fair verification (future). */
  commitHash?: string;
  seed?: string;
}

// --- Match phase ------------------------------------------------------------

export type LudoPhase =
  | 'waiting_for_players'    // lobby, not all seats filled
  | 'rolling'                // current player's turn to roll
  | 'moving'                 // dice rolled, player choosing which token to move
  | 'extra_turn'             // rolled a 6, about to grant extra turn
  | 'match_over';            // someone got all 4 tokens home

// --- Move record ------------------------------------------------------------

export interface LudoMoveRecord {
  turnNumber: number;
  playerId: string;
  color: LudoColor;
  diceValue: DiceValue;
  /** The token index (0–3) that was moved, or null if no move was possible. */
  movedToken: number | null;
  /** 'roll' | 'capture' | 'home_entry' | 'extra_turn' | 'no_move' | 'forfeit' */
  cause: MoveCause;
  /** Tokens captured this turn, if any. */
  captured: { playerId: string; tokenIndex: number }[];
}

export type MoveCause =
  | 'roll'
  | 'capture'
  | 'home_entry'
  | 'extra_turn'
  | 'no_move'
  | 'forfeit'
  | 'token_entered'
  | 'token_captured';

// --- Per-player match record ------------------------------------------------

export interface PlayerRecord {
  userId: string;
  color: LudoColor;
  totalSteps: number;
  /** Scoring economy: +1 per step moved, ±10 on a capture, +50 on reaching home. Ranking/payouts use this, not totalSteps. */
  points: number;
  tokensHome: number;
  /** Token states at match end. */
  tokens: Token[];
}

// --- Match state (stored in Match.gameState JSON) ---------------------------

export interface LudoState {
  /** Total seated players (2, 3, or 4). */
  seatCount: number;
  /** Player IDs in seat order (index 0 = first seat, etc.). */
  playerIds: string[];
  /** userId → assigned color. */
  colors: Record<string, LudoColor>;
  /** userId → 4 tokens. */
  tokens: Record<string, Token[]>;
  /** userId → total steps moved across all 4 tokens. */
  totalSteps: Record<string, number>;
  /** userId → scoring economy total: +1/step, ±10/capture, +50/home. Basis for ranking & payouts. */
  points: Record<string, number>;
  /** userId → remaining lives (starts at MAX_LIVES, -1 per missed 15s roll window). */
  lives: Record<string, number>;

  /** Current turn player's userId. */
  currentPlayerId: string;
  /** Current phase. */
  phase: LudoPhase;
  /** Current dice roll (set after roll, consumed after move). */
  currentDice: DiceValue | null;
  /** Number of consecutive 6s rolled (max 3 before turn ends). */
  consecutiveSixes: number;
  /** Turn counter (monotonically increasing). */
  turnNumber: number;

  /** IDs of players who disconnected mid-match. */
  disconnectedPlayers: string[];
}

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
  DICE_ROLLED: 'ludo:dice:rolled',
  TOKEN_MOVED: 'ludo:token:moved',
  TURN_START: 'ludo:turn:start',
  LIVES_UPDATE: 'ludo:lives:update',
  MATCH_RESULT: 'ludo:match:result',
  OPPONENT_DISCONNECTED: 'ludo:opponent:disconnect',
  OPPONENT_RECONNECTED: 'ludo:opponent:reconnect',
  ERROR: 'ludo:error',
} as const;
