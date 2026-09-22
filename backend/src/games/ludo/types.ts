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

// --- Player color / seat ----------------------------------------------------

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export const COLOR_ORDER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

/** 2-player fixed pairing: Red vs Yellow. */
export const TWO_PLAYER_COLORS: LudoColor[] = ['red', 'yellow'];

/** Full 4-player color set. */
export const FOUR_PLAYER_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

// --- Token state ------------------------------------------------------------

/**
 * Relative position of a token:
 *   0     = yard (not yet on the board)
 *   1–51  = on the shared outer track
 *   52–56 = in this color's private home column
 *   57    = finished (center)
 */
export interface Token {
  /** Relative position: 0=yard, 1-51=track, 52-56=home column, 57=finished. */
  position: number;
}

// Convenience zone helpers (used by socket.ts for cause labels)
export type TokenZone = 'yard' | 'track' | 'home';

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
export const COLOR_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/**
 * Safe global cells — no captures happen here.
 * Each color's entry cell plus one star cell partway around from each start.
 */
export const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47] as const;

/** Legacy alias kept for socket.ts compatibility. */
export const SAFE_SQUARES = SAFE_CELLS;

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
  /** userId → 4 tokens (each with a relative position 0-57). */
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
  DICE_ROLLING: 'ludo:dice:rolling',
  DICE_ROLLED: 'ludo:dice:rolled',
  TOKEN_MOVED: 'ludo:token:moved',
  TURN_START: 'ludo:turn:start',
  LIVES_UPDATE: 'ludo:lives:update',
  MATCH_RESULT: 'ludo:match:result',
  OPPONENT_DISCONNECTED: 'ludo:opponent:disconnect',
  OPPONENT_RECONNECTED: 'ludo:opponent:reconnect',
  ERROR: 'ludo:error',
} as const;
