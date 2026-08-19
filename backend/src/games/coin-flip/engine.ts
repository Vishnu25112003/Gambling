/**
 * Coin Flip engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs and easy to unit-test.
 * This file never touches the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G01-Coin-Flip.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4)
 */

import { createHash, randomBytes } from 'node:crypto';
import type {
  CoinFlipState,
  CoinFlipRoundRecord,
  CoinSide,
  MatchPhase,
  RoundCause,
  Seat,
  SeatAssignment,
} from './types.js';

// --- Constants --------------------------------------------------------------

/** Odd round counts allowed by the spec. */
export const VALID_ROUND_COUNTS = [3, 5, 7, 9, 11, 13, 15] as const;

/** Spinner has 10 seconds to initiate the spin. */
export const SPIN_TIMEOUT_MS = 10_000;

/** Caller has 10 seconds to call Head or Tail. */
export const CALL_TIMEOUT_MS = 10_000;

// --- Commit-reveal helpers --------------------------------------------------

/**
 * Generate a random seed (hex string).
 * Used for both the seat draw and each coin result.
 */
export function generateSeed(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Compute the commitment hash: sha256(seed || value).
 * value is lowercased before hashing for case-insensitive comparison.
 */
export function computeCommitHash(seed: string, value: string): string {
  return createHash('sha256')
    .update(seed)
    .update(value.toLowerCase())
    .digest('hex');
}

/**
 * Verify a commitment: does hash(seed || value) === commitHash?
 */
export function verifyCommit(seed: string, value: string, commitHash: string): boolean {
  return computeCommitHash(seed, value) === commitHash;
}

// --- Seat assignment --------------------------------------------------------

/**
 * Generate a fair seat assignment for Round 1.
 * Returns the seats and the commit info for the seat draw.
 */
export function generateSeatDraw(
  playerIds: [string, string],
): { seats: Record<string, Seat>; seed: string; commitHash: string; assignment: string } {
  const seed = generateSeed();
  // Randomly assign: 'ab' means player[0]=spinner, player[1]=caller
  // 'ba' means player[0]=caller, player[1]=spinner
  const assignment = Math.random() < 0.5 ? 'ab' : 'ba';
  const commitHash = computeCommitHash(seed, assignment);

  const seats: Record<string, Seat> = {};
  if (assignment === 'ab') {
    seats[playerIds[0]] = 'spinner';
    seats[playerIds[1]] = 'caller';
  } else {
    seats[playerIds[0]] = 'caller';
    seats[playerIds[1]] = 'spinner';
  }

  return { seats, seed, commitHash, assignment };
}

/**
 * Determine seats for Round 2+.
 * The previous round's winner becomes the spinner; the loser becomes the caller.
 */
export function getNextSeats(
  previousWinner: string,
  previousLoser: string,
): Record<string, Seat> {
  return {
    [previousWinner]: 'spinner',
    [previousLoser]: 'caller',
  };
}

// --- Coin result ------------------------------------------------------------

/**
 * Generate a coin result for a round. Returns the result and commit info.
 */
export function generateCoinResult(): {
  result: CoinSide;
  seed: string;
  commitHash: string;
} {
  const result: CoinSide = Math.random() < 0.5 ? 'heads' : 'tails';
  const seed = generateSeed();
  const commitHash = computeCommitHash(seed, result);
  return { result, seed, commitHash };
}

// --- Round resolution -------------------------------------------------------

/**
 * Determine the round winner based on the caller's call and the coin result.
 * Returns the winner userId and the cause.
 */
export function resolveRound(
  call: CoinSide | null,
  result: CoinSide,
  spinnerId: string,
  callerId: string,
): { winnerId: string; cause: RoundCause } {
  if (call === null) {
    // Caller timed out — spinner wins
    return { winnerId: spinnerId, cause: 'no_call' };
  }
  if (call === result) {
    // Caller matched — caller wins
    return { winnerId: callerId, cause: 'correct_call' };
  }
  // Caller mismatched — spinner wins
  return { winnerId: spinnerId, cause: 'wrong_call' };
}

// --- Match state ------------------------------------------------------------

/**
 * Compute the clinch threshold for a given round count.
 * floor(rounds / 2) + 1
 */
export function clinchThreshold(totalRounds: number): number {
  return Math.floor(totalRounds / 2) + 1;
}

/**
 * Create initial match state.
 */
export function createInitialState(
  totalRounds: number,
  playerIds: [string, string],
): CoinFlipState {
  return {
    totalRounds,
    currentRound: 1,
    clinchThreshold: clinchThreshold(totalRounds),
    scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
    seats: {},
    matchSeats: [],
    currentResult: null,
    currentCommitHash: null,
    currentSeed: null,
    currentCall: null,
    phase: 'seat_draw',
    spinStartedAt: null,
    callStartedAt: null,
    disconnectedPlayers: [],
  };
}

/**
 * Check if a player has clinched the match.
 * Returns the winner's userId if someone has clinched, null otherwise.
 */
export function checkClinch(scores: Record<string, number>, threshold: number): string | null {
  for (const [userId, wins] of Object.entries(scores)) {
    if (wins >= threshold) return userId;
  }
  return null;
}

/**
 * Update scores after a round and check for clinch.
 */
export function updateScores(
  scores: Record<string, number>,
  winnerId: string,
  threshold: number,
): { scores: Record<string, number>; winner: string | null } {
  const newScores = { ...scores };
  newScores[winnerId] = (newScores[winnerId] ?? 0) + 1;
  const winner = checkClinch(newScores, threshold);
  return { scores: newScores, winner };
}

// --- State transitions ------------------------------------------------------

/**
 * Transition from seat_draw phase: reveal the seat assignment.
 */
export function revealSeatDraw(
  state: CoinFlipState,
  seed: string,
  assignment: string,
  playerIds: [string, string],
): CoinFlipState {
  const seats: Record<string, Seat> = {};
  if (assignment === 'ab') {
    seats[playerIds[0]] = 'spinner';
    seats[playerIds[1]] = 'caller';
  } else {
    seats[playerIds[0]] = 'caller';
    seats[playerIds[1]] = 'spinner';
  }

  return {
    ...state,
    seats,
    matchSeats: [
      { userId: playerIds[0], seat: seats[playerIds[0]]! },
      { userId: playerIds[1], seat: seats[playerIds[1]]! },
    ],
    phase: 'waiting_spin',
    spinStartedAt: Date.now(),
    callStartedAt: null,
    currentCall: null,
    currentResult: null,
    currentSeed: null,
    currentCommitHash: null,
  };
}

/**
 * Transition from waiting_spin: spinner has initiated the spin.
 */
export function startSpin(state: CoinFlipState): CoinFlipState {
  return {
    ...state,
    phase: 'waiting_call',
    callStartedAt: Date.now(),
  };
}

/**
 * Transition from waiting_call: caller has called or timed out.
 * Returns the new state plus the round record.
 */
export function resolveCall(
  state: CoinFlipState,
  call: CoinSide | null,
  result: CoinSide,
  spinnerId: string,
  callerId: string,
): { state: CoinFlipState; record: CoinFlipRoundRecord } {
  const { winnerId, cause } = resolveRound(call, result, spinnerId, callerId);

  const roundRecord: CoinFlipRoundRecord = {
    roundNumber: state.currentRound,
    commitHash: state.currentCommitHash!,
    seed: state.currentSeed,
    result,
    call,
    cause,
    spinnerId,
    callerId,
  };

  const { scores: newScores, winner } = updateScores(
    state.scores,
    winnerId,
    state.clinchThreshold,
  );

  const nextPhase: MatchPhase = winner ? 'match_over' : 'round_over';

  return {
    state: {
      ...state,
      scores: newScores,
      phase: nextPhase,
      currentCall: call,
    },
    record: roundRecord,
  };
}

/**
 * Advance to the next round after round_over.
 */
export function advanceRound(
  state: CoinFlipState,
  previousWinnerId: string,
  previousLoserId: string,
): CoinFlipState {
  const nextSeats = getNextSeats(previousWinnerId, previousLoserId);
  return {
    ...state,
    currentRound: state.currentRound + 1,
    seats: nextSeats,
    currentResult: null,
    currentCommitHash: null,
    currentSeed: null,
    currentCall: null,
    phase: 'waiting_spin',
    spinStartedAt: Date.now(),
    callStartedAt: null,
  };
}

/**
 * Check if a timer has expired.
 */
export function isTimerExpired(startedAt: number | null, timeoutMs: number): boolean {
  if (startedAt === null) return false;
  return Date.now() - startedAt >= timeoutMs;
}
