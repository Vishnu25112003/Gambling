/**
 * Coin Flip game types.
 *
 * The match's `gameState` JSON column holds a CoinFlipState. Round records
 * live in a separate table for reconnect catch-up and after-the-fact
 * verification (see G01-Coin-Flip.md "The Round Record").
 */

// --- Seat assignment --------------------------------------------------------

export type Seat = 'spinner' | 'caller';

/** Round 1 seat draw: committed before the match starts. */
export interface SeatAssignment {
  userId: string;
  seat: Seat;
}

// --- Coin result ------------------------------------------------------------

export type CoinSide = 'heads' | 'tails';

// --- Round cause ------------------------------------------------------------

export type RoundCause =
  | 'correct_call'   // caller's call matched the result
  | 'wrong_call'     // caller's call did not match
  | 'no_spin'        // spinner timed out (10s)
  | 'no_call';       // caller timed out (10s)

// --- Per-round record -------------------------------------------------------

export interface CoinFlipRoundRecord {
  roundNumber: number;
  commitHash: string;       // hash(seed || value) published before action
  seed: string | null;      // revealed only after action completes
  result: CoinSide | null;  // the coin result (or seat assignment for round 1 record)
  call: CoinSide | null;    // what the caller called, null on timeout
  cause: RoundCause | null;
  spinnerId: string;
  callerId: string;
}

// --- Match state (stored in Match.gameState JSON) ---------------------------

export type MatchPhase =
  | 'seat_draw'       // Round 1: committed draw, about to reveal
  | 'waiting_spin'    // spinner has 10s to spin
  | 'waiting_call'    // spin started, caller has 10s to call
  | 'revealing'       // result revealed, showing coin
  | 'round_over'      // round finished, updating scores
  | 'match_over';     // a player clinched

export interface CoinFlipState {
  /** Total rounds (odd: 3, 5, 7, 9, 11, 13, 15). */
  totalRounds: number;
  /** Current round number (1-indexed). */
  currentRound: number;
  /** Clinch threshold: floor(totalRounds / 2) + 1. */
  clinchThreshold: number;

  /** userId → round wins. */
  scores: Record<string, number>;

  /** Seat assignments for the current round. */
  seats: Record<string, Seat>;
  /** userId → seat for the match (for display). */
  matchSeats: SeatAssignment[];

  /** Current round's coin result (set by server before spin). */
  currentResult: CoinSide | null;
  /** Commitment hash for the current round. */
  currentCommitHash: string | null;
  /** Seed for the current round (written only at reveal). */
  currentSeed: string | null;

  /** The call made by the caller, if any. */
  currentCall: CoinSide | null;

  /** Phase of the current round. */
  phase: MatchPhase;

  /** Timestamps for timer management. */
  spinStartedAt: number | null;
  callStartedAt: number | null;

  /** IDs of players who disconnected mid-match. */
  disconnectedPlayers: string[];
}

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
} as const;
