/**
 * Mine Catcher game types.
 *
 * The match's `gameState` JSON column holds a MineCatcherState.
 * Each player hides 10 mines on their own board, then takes turns
 * attacking the opponent's board. First to find all 10 wins instantly.
 */

// --- Board sizes -------------------------------------------------------------

export type BoardSize = 25 | 49 | 81 | 100;

/** Grid dimensions for a given board size. */
export function gridDimensions(size: BoardSize): { rows: number; cols: number } {
  switch (size) {
    case 25:  return { rows: 5, cols: 5 };
    case 49:  return { rows: 7, cols: 7 };
    case 81:  return { rows: 9, cols: 9 };
    case 100: return { rows: 10, cols: 10 };
  }
}

// --- Match phase -------------------------------------------------------------

export type MatchPhase =
  | 'placement'      // both players placing mines (30s timer)
  | 'attacking'      // turns attacking opponent's board
  | 'match_over';    // a player found all 10 or opponent ran out of lives

// --- Cell state --------------------------------------------------------------

export type CellState =
  | 'hidden'    // unattacked cell on opponent's board
  | 'break'     // attacked empty cell (miss)
  | 'blast';    // attacked mine cell (hit)

// --- Player board (one per player) -------------------------------------------

export interface PlayerBoard {
  /** Set of cell indices where mines are placed (0-indexed). */
  mines: Set<number>;
  /** Cell states as seen by the opponent attacking this board. */
  revealed: CellState[];
  /** Number of mines found by the opponent. */
  foundCount: number;
}

// --- Match state (stored in Match.gameState JSON) ----------------------------

export interface MineCatcherState {
  boardSize: BoardSize;
  totalMines: number;   // always 10
  phase: MatchPhase;

  /** userId → board that this player owns (mines they placed). */
  boards: Record<string, PlayerBoard>;

  /** userId → found mine count (how many of opponent's mines they found). */
  foundCounts: Record<string, number>;

  /** userId → lives remaining (starts at 3). */
  lives: Record<string, number>;

  /** userId → number of "break" (miss) results. Stat only, never decides outcome. */
  breakCounts: Record<string, number>;

  /** Whose turn it is to attack (userId). */
  currentAttacker: string | null;

  /** Timestamp when the current attack turn started (for 15s timer). */
  turnStartedAt: number | null;

  /** Timestamp when the placement phase started (for 30s timer). */
  placementStartedAt: number | null;

  /** IDs of players who have disconnected. */
  disconnectedPlayers: string[];

  /** IDs of players who have readied up during placement. */
  readyPlayers: string[];

  /** Winner userId, set when match ends. */
  winnerId: string | null;

  /** How the match ended. */
  endCause: 'race_won' | 'lives_forfeit' | 'dual_unreachable' | null;
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
  STAKE_REQUIRED: 'mc:stake:required',
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
} as const;
