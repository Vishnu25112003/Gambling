/**
 * Hand Cricket game types.
 *
 * The match's `gameState` JSON column holds a HandCricketState. Each player
 * bats one innings; every ball both players simultaneously pick 1-6 — a
 * match is an out, otherwise the batter scores that many runs. Most runs
 * across both innings wins; a tie goes to a 6-ball Super Over.
 */

// --- Innings -----------------------------------------------------------------

export interface BallLogEntry {
  ball: number;
  batterPick: number;
  bowlerPick: number;
  runsScored: number;
  out: boolean;
}

/** One completed or in-progress innings. Roles swap explicitly per innings. */
export interface InningsRecord {
  batterId: string;
  bowlerId: string;
  ballsPerInnings: number;
  ballsBowled: number;
  runs: number;
  isOut: boolean;
  ballLog: BallLogEntry[];
}

// --- Match phase ---------------------------------------------------------------

export type MatchPhase =
  | 'batting'      // main-match innings 1 or 2 in progress
  | 'super_over'   // tie-break innings in progress
  | 'match_over';

// --- Pending ball (simultaneous pick) -----------------------------------------

export interface PendingBall {
  ballStartedAt: number;
  /** userId -> pick. Both batter and bowler must pick before the ball resolves. */
  picks: Partial<Record<string, number>>;
}

// --- Match state (stored in Match.gameState JSON) -----------------------------

export interface HandCricketState {
  ballsPerInnings: number;
  phase: MatchPhase;

  /** userId -> lives remaining (starts at 3). Shared pool for stalls + disconnects. */
  lives: Record<string, number>;

  /** Index into `innings` of the currently-live innings, or null once the match is over. */
  currentInningsIndex: number | null;
  innings: InningsRecord[];

  /** The ball currently awaiting both picks, or null between balls / at match end. */
  pendingBall: PendingBall | null;

  /** IDs of players who have disconnected. */
  disconnectedPlayers: string[];

  /** Winner userId, or null (dual-unreachable, or an even-split Super-Over tie). */
  winnerId: string | null;

  endCause:
    | 'runs_higher'
    | 'super_over_decided'
    | 'lives_forfeit'
    | 'super_over_tied_split'
    | 'dual_unreachable'
    | null;
}

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
} as const;
