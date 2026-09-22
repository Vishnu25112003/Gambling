/**
 * Ludo Engine — pure game rules with no I/O.
 * ------------------------------------------------------------------
 * Server-authoritative, framework-agnostic game logic for a 2-4
 * player Ludo match. All functions are deterministic given their
 * inputs and easy to unit-test. This file never touches the
 * database, sockets, or timers.
 *
 * BOARD MODEL (relative position per token):
 *   0        → yard (not on the board)
 *   1–51     → on the shared 52-cell outer track (1-indexed steps)
 *   52–56    → private home column (immune to capture)
 *   57       → finished (center)
 *
 * A token leaves the yard only on a roll of 6 (moves to position 1).
 * A token must land on EXACTLY 57 to finish; overshooting is illegal.
 *
 * GLOBAL CELL CONVERSION
 *   globalCell = (START_OFFSET[color] + relativePosition - 1) % 52
 *   Only valid for positions 1–51 (on shared track).
 *
 * References:
 *   - Gambling_Docs/Games/G02-Ludo.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4, with Rule 2 exception)
 */

import type {
  LudoColor,
  LudoState,
  Token,
  DiceValue,
  MoveCause,
  LudoMoveRecord,
  PlayerRecord,
} from './types.js';
import {
  COLOR_ORDER,
  TWO_PLAYER_COLORS,
  HOME_COLUMN_LENGTH,
  TRACK_LENGTH,
  FINISH,
  HOME_ENTRY,
  SAFE_CELLS,
  COLOR_START_OFFSET,
} from './types.js';

// --- Constants --------------------------------------------------------------

/** Max consecutive 6s allowed before the turn is forfeited. */
export const MAX_CONSECUTIVE_SIXES = 3;

/** Timeout for a player to roll the dice (ms). */
export const ROLL_TIMEOUT_MS = 15_000;

/** Timeout for a player to choose which token to move after rolling (ms). */
export const MOVE_TIMEOUT_MS = 10_000;

/** Lives a player starts a match with; missing a 15s roll window costs one. */
export const MAX_LIVES = 3;

/** Points economy: +1/step, +10 capturing / -10 captured, +50 reaching home. */
export const POINTS_PER_CAPTURE = 10;
export const POINTS_PER_HOME = 50;

// --- Payout table -----------------------------------------------------------

/**
 * Paid places and percentage splits by seated player count.
 * After Rule 1's 5% fee is deducted from the pot.
 */
export const PAYOUT_TABLE: Record<number, { paidPlaces: number; splits: number[] }> = {
  2: { paidPlaces: 1, splits: [100] },
  3: { paidPlaces: 2, splits: [70, 30] },
  4: { paidPlaces: 3, splits: [50, 30, 20] },
};

// --- Color assignment -------------------------------------------------------

const TWO_PLAYER: LudoColor[] = ['red', 'yellow'];
const THREE_PLAYER: LudoColor[] = ['red', 'green', 'yellow'];
const FOUR_PLAYER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

export function getColorSet(seatCount: number): LudoColor[] {
  switch (seatCount) {
    case 2: return TWO_PLAYER;
    case 3: return THREE_PLAYER;
    case 4: return FOUR_PLAYER;
    default: throw new Error(`Invalid seat count: ${seatCount}`);
  }
}

export function assignColors(playerIds: string[], seatCount: number): Record<string, LudoColor> {
  const colors = getColorSet(seatCount);
  const assignment: Record<string, LudoColor> = {};
  for (let i = 0; i < playerIds.length; i++) {
    assignment[playerIds[i]!] = colors[i]!;
  }
  return assignment;
}

// --- Token helpers ----------------------------------------------------------

/** Create 4 tokens in the yard for a new player. */
export function createTokens(): Token[] {
  return [
    { position: 0 },
    { position: 0 },
    { position: 0 },
    { position: 0 },
  ];
}

/** Returns true if this token is still in the yard. */
export function isInYard(token: Token): boolean {
  return token.position === 0;
}

/** Returns true if this token has finished (reached center). */
export function isFinished(token: Token): boolean {
  return token.position === FINISH;
}

/** Returns true if this token is on the shared outer track (positions 1–51). */
export function isOnTrack(token: Token): boolean {
  return token.position >= 1 && token.position <= HOME_ENTRY;
}

/** Returns true if this token is in the private home column (positions 52–57). */
export function isInHomeColumn(token: Token): boolean {
  return token.position > HOME_ENTRY;
}

/** Check if all 4 tokens are finished. */
export function allTokensHome(tokens: Token[]): boolean {
  return tokens.every((t) => isFinished(t));
}

/**
 * Convert a relative position (1–51) to an absolute global cell (0–51).
 * Returns null if the token is in yard or past HOME_ENTRY (home column / finished).
 */
export function toGlobalCell(color: LudoColor, relativePosition: number): number | null {
  if (relativePosition < 1 || relativePosition > HOME_ENTRY) return null;
  return (COLOR_START_OFFSET[color]! + relativePosition - 1) % TRACK_LENGTH;
}

/**
 * Check if a global cell is a safe square (no captures here).
 */
export function isSafeCell(globalCell: number): boolean {
  return (SAFE_CELLS as readonly number[]).includes(globalCell);
}

// --- Move validation --------------------------------------------------------

export interface ValidMove {
  tokenIndex: number;
  /** Position the token will land on after this move. */
  to: number;
  /** 'yard' = leaving yard (6 required), 'track' = moving on outer track, 'home' = moving in home column. */
  type: 'yard' | 'track' | 'home';
}

/**
 * Get all valid moves for a player given the current dice roll.
 *
 * Rules:
 * - Yard tokens: only movable on a 6 → moves to position 1.
 * - Track tokens: target must not exceed HOME_ENTRY+HOME_COLUMN_LENGTH(=FINISH).
 *   Overshoot (target > 57) is illegal for that token.
 * - A token must land on EXACTLY 57 to finish.
 * - If no valid moves exist, the turn is passed automatically.
 */
export function getValidMoves(
  tokens: Token[],
  diceValue: DiceValue,
  color: LudoColor,
  allTokens: Record<string, Token[]>,
  playerIds: string[],
  colors: Record<string, LudoColor>,
): ValidMove[] {
  const moves: ValidMove[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (isFinished(token)) continue;

    if (isInYard(token)) {
      // Can only leave yard on a 6
      if (diceValue === 6) {
        moves.push({ tokenIndex: i, to: 1, type: 'yard' });
      }
      continue;
    }

    const target = token.position + diceValue;

    // Overshoot past finish is illegal
    if (target > FINISH) continue;

    const type: 'track' | 'home' = token.position <= HOME_ENTRY ? 'track' : 'home';
    moves.push({ tokenIndex: i, to: target, type });
  }

  return moves;
}

// --- Capture logic ----------------------------------------------------------

/**
 * After a token moves to a new relative position, check if it lands on
 * an opponent token on the shared outer track and capture it.
 * Tokens in the home column (position > HOME_ENTRY) are immune.
 * Returns array of captured {playerId, tokenIndex} pairs.
 */
export function resolveCapture(
  movedColor: LudoColor,
  newPosition: number,
  allTokens: Record<string, Token[]>,
  playerIds: string[],
  colors: Record<string, LudoColor>,
): { playerId: string; tokenIndex: number }[] {
  const captured: { playerId: string; tokenIndex: number }[] = [];

  // Only captures happen on the shared track (1–51)
  const globalCell = toGlobalCell(movedColor, newPosition);
  if (globalCell === null || isSafeCell(globalCell)) return captured;

  for (const oppId of playerIds) {
    const oppColor = colors[oppId];
    if (!oppColor || oppColor === movedColor) continue;
    const oppTokens = allTokens[oppId];
    if (!oppTokens) continue;

    for (let j = 0; j < oppTokens.length; j++) {
      const oppToken = oppTokens[j]!;
      const oppGlobal = toGlobalCell(oppColor, oppToken.position);
      if (oppGlobal !== null && oppGlobal === globalCell) {
        // Captured — send back to yard
        oppToken.position = 0;
        captured.push({ playerId: oppId, tokenIndex: j });
      }
    }
  }

  return captured;
}

// --- Move execution ---------------------------------------------------------

export interface MoveResult {
  /** Updated tokens for the moving player. */
  tokens: Token[];
  /** Steps moved (0 if came out of yard). */
  stepsMoved: number;
  /** Tokens captured this move. */
  captured: { playerId: string; tokenIndex: number }[];
  /** Whether the token entered the home column this move. */
  enteredHome: boolean;
  /** Whether the token reached the final finish (position 57). */
  reachedHome: boolean;
}

/**
 * Execute a single token move, apply captures, and return the updated state.
 */
export function executeMove(
  tokens: Token[],
  tokenIndex: number,
  diceValue: DiceValue,
  color: LudoColor,
  allTokens: Record<string, Token[]>,
  playerIds: string[],
  colors: Record<string, LudoColor>,
): MoveResult {
  const token = tokens[tokenIndex]!;
  // Deep-copy tokens for immutability
  const newTokens = tokens.map((t) => ({ ...t }));
  // Deep-copy allTokens so captures mutate the copy
  const newAllTokens: Record<string, Token[]> = {};
  for (const id of playerIds) {
    newAllTokens[id] = (allTokens[id] ?? []).map((t) => ({ ...t }));
  }
  // The moved player's copy IS the same reference we'll return
  newAllTokens[playerIds.find((id) => colors[id] === color) ?? ''] = newTokens;

  const target = newTokens[tokenIndex]!;
  let stepsMoved = 0;
  let enteredHome = false;
  let reachedHome = false;

  if (isInYard(target) && diceValue === 6) {
    // Leave yard → start square (position 1)
    target.position = 1;
    stepsMoved = 0; // stepping out of yard doesn't count as a board step
  } else {
    const prevPosition = target.position;
    target.position = prevPosition + diceValue;
    stepsMoved = diceValue;

    // Track → home column transition
    if (prevPosition <= HOME_ENTRY && target.position > HOME_ENTRY) {
      enteredHome = true;
    }

    reachedHome = target.position >= FINISH;
    if (reachedHome) target.position = FINISH;
  }

  // Resolve captures (only on the shared outer track)
  const captured = resolveCapture(color, target.position, newAllTokens, playerIds, colors);

  // Apply captures back to newTokens for opponents
  // (resolveCapture already mutated newAllTokens; now reflect them in allTokens
  // via the returned captured list — caller owns allTokens mutation)

  return { tokens: newTokens, stepsMoved, captured, enteredHome, reachedHome };
}

// --- Match state ------------------------------------------------------------

/** Create initial match state with all tokens in the yard. */
export function createInitialState(
  seatCount: number,
  playerIds: string[],
): LudoState {
  const colors = assignColors(playerIds, seatCount);
  const tokens: Record<string, Token[]> = {};
  const totalSteps: Record<string, number> = {};
  const points: Record<string, number> = {};
  const lives: Record<string, number> = {};

  for (const id of playerIds) {
    tokens[id] = createTokens();
    totalSteps[id] = 0;
    points[id] = 0;
    lives[id] = MAX_LIVES;
  }

  return {
    seatCount,
    playerIds,
    colors,
    tokens,
    totalSteps,
    points,
    lives,
    currentPlayerId: playerIds[0]!,
    phase: 'rolling',
    currentDice: null,
    consecutiveSixes: 0,
    turnNumber: 1,
    disconnectedPlayers: [],
  };
}

/**
 * Get the next player in turn order, skipping forfeited players.
 */
export function getNextPlayer(
  currentPlayerId: string,
  playerIds: string[],
  forfeitedPlayers: string[] = [],
): string {
  const currentIndex = playerIds.indexOf(currentPlayerId);
  const n = playerIds.length;
  for (let step = 1; step <= n; step++) {
    const candidate = playerIds[(currentIndex + step + n) % n]!;
    if (!forfeitedPlayers.includes(candidate)) return candidate;
  }
  return playerIds[(currentIndex + 1) % n]!;
}

/**
 * Check if the match is over (any player has all 4 tokens at position 57).
 * Returns the winner's userId, or null if not over.
 */
export function checkMatchEnd(state: LudoState): string | null {
  for (const id of state.playerIds) {
    if (allTokensHome(state.tokens[id]!)) {
      return id;
    }
  }
  return null;
}

/**
 * Rank all active players by points.
 */
export function rankPlayers(
  state: LudoState,
  forfeitedPlayers: string[],
): { playerId: string; rank: number; totalSteps: number; points: number }[] {
  const active = state.playerIds.filter((id) => !forfeitedPlayers.includes(id));
  const ranked = active
    .map((id) => ({ playerId: id, totalSteps: state.totalSteps[id] ?? 0, points: state.points[id] ?? 0 }))
    .sort((a, b) => b.points - a.points);

  let currentRank = 1;
  const result: { playerId: string; rank: number; totalSteps: number; points: number }[] = [];

  for (let i = 0; i < ranked.length; i++) {
    const entry = ranked[i]!;
    if (i > 0 && entry.points === ranked[i - 1]!.points) {
      result.push({ playerId: entry.playerId, rank: result[i - 1]!.rank, totalSteps: entry.totalSteps, points: entry.points });
    } else {
      result.push({ playerId: entry.playerId, rank: currentRank, totalSteps: entry.totalSteps, points: entry.points });
      currentRank++;
    }
  }

  return result;
}

/**
 * Calculate payout weights from rankings and seat count.
 */
export function calculatePayoutWeights(
  rankings: { playerId: string; rank: number }[],
  seatCount: number,
): { userId: string; weight: number }[] {
  const payoutInfo = PAYOUT_TABLE[seatCount];
  if (!payoutInfo) return [];

  const { paidPlaces, splits } = payoutInfo;
  const result: { userId: string; weight: number }[] = [];

  for (let place = 1; place <= paidPlaces; place++) {
    const playersAtPlace = rankings.filter((r) => r.rank === place);
    if (playersAtPlace.length === 0) continue;

    const splitWeight = splits[place - 1] ?? 0;
    const perPlayerWeight = splitWeight / playersAtPlace.length;

    for (const p of playersAtPlace) {
      result.push({ userId: p.playerId, weight: perPlayerWeight });
    }
  }

  return result;
}

// --- Turn processing --------------------------------------------------------

/**
 * Process a dice roll: generate a value, check for 3-sixes forfeit,
 * compute valid moves.
 */
export function processDiceRoll(state: LudoState): {
  state: LudoState;
  diceValue: DiceValue;
  validMoves: ValidMove[];
  mustPass: boolean;
} {
  const diceValue = (Math.floor(Math.random() * 6) + 1) as DiceValue;
  const newState = { ...state, currentDice: diceValue };

  const playerTokens = state.tokens[state.currentPlayerId]!;
  const color = state.colors[state.currentPlayerId]!;

  // Three consecutive 6s = forfeit the turn
  let mustPass = false;
  if (diceValue === 6) {
    newState.consecutiveSixes = state.consecutiveSixes + 1;
    if (newState.consecutiveSixes >= MAX_CONSECUTIVE_SIXES) {
      mustPass = true;
      newState.consecutiveSixes = 0;
    }
  } else {
    newState.consecutiveSixes = 0;
  }

  const validMoves = mustPass
    ? []
    : getValidMoves(
        playerTokens,
        diceValue,
        color,
        state.tokens,
        state.playerIds,
        state.colors,
      );

  return { state: newState, diceValue, validMoves, mustPass };
}

/**
 * Process a token move after the dice has been rolled.
 * Handles captures, point economy, match-end detection, and extra-turn logic.
 */
export function processTokenMove(
  state: LudoState,
  tokenIndex: number,
  forfeitedPlayers: string[] = [],
): {
  state: LudoState;
  result: MoveResult;
  matchWinner: string | null;
  nextPlayerId: string;
  getsExtraTurn: boolean;
} {
  const playerId = state.currentPlayerId;
  const color = state.colors[playerId]!;
  const diceValue = state.currentDice!;

  // Deep-copy token arrays for all players before mutation
  const tokensCopy: Record<string, Token[]> = {};
  for (const id of state.playerIds) {
    tokensCopy[id] = (state.tokens[id] ?? []).map((t) => ({ ...t }));
  }

  const playerTokensCopy = tokensCopy[playerId]!;

  const moveResult = executeMove(
    playerTokensCopy,
    tokenIndex,
    diceValue,
    color,
    tokensCopy,
    state.playerIds,
    state.colors,
  );

  // Apply capture mutations back into tokensCopy
  for (const cap of moveResult.captured) {
    const capTokens = tokensCopy[cap.playerId];
    if (capTokens) capTokens[cap.tokenIndex]!.position = 0;
  }
  // Apply the moved token's new position
  tokensCopy[playerId] = moveResult.tokens;

  // Points economy
  const newPoints = { ...state.points };
  newPoints[playerId] = (newPoints[playerId] ?? 0) + moveResult.stepsMoved;
  for (const cap of moveResult.captured) {
    newPoints[playerId] = (newPoints[playerId] ?? 0) + POINTS_PER_CAPTURE;
    newPoints[cap.playerId] = (newPoints[cap.playerId] ?? 0) - POINTS_PER_CAPTURE;
  }
  if (moveResult.reachedHome) {
    newPoints[playerId] = (newPoints[playerId] ?? 0) + POINTS_PER_HOME;
  }

  // Total steps
  const newTotalSteps = {
    ...state.totalSteps,
    [playerId]: (state.totalSteps[playerId] ?? 0) + moveResult.stepsMoved,
  };

  const newState: LudoState = {
    ...state,
    tokens: tokensCopy,
    totalSteps: newTotalSteps,
    points: newPoints,
    currentDice: null,
  };

  const matchWinner = checkMatchEnd(newState);

  // Extra turn: roll 6, capture, or finish a token (house rule)
  const getsExtraTurn =
    !matchWinner &&
    (diceValue === 6 || moveResult.captured.length > 0 || moveResult.reachedHome) &&
    state.consecutiveSixes < MAX_CONSECUTIVE_SIXES;

  let nextPlayerId: string;
  if (matchWinner) {
    newState.phase = 'match_over';
    nextPlayerId = state.currentPlayerId;
  } else if (getsExtraTurn) {
    nextPlayerId = state.currentPlayerId;
  } else {
    nextPlayerId = getNextPlayer(state.currentPlayerId, state.playerIds, forfeitedPlayers);
  }

  newState.currentPlayerId = nextPlayerId;
  newState.turnNumber = state.turnNumber + 1;

  return { state: newState, result: moveResult, matchWinner, nextPlayerId, getsExtraTurn };
}

/**
 * Process a turn pass (no valid moves or 3 consecutive 6s).
 */
export function processTurnPass(
  state: LudoState,
  forfeitedPlayers: string[] = [],
): {
  state: LudoState;
  nextPlayerId: string;
} {
  const nextPlayerId = getNextPlayer(state.currentPlayerId, state.playerIds, forfeitedPlayers);
  return {
    state: {
      ...state,
      currentDice: null,
      consecutiveSixes: 0,
      phase: 'rolling',
      currentPlayerId: nextPlayerId,
      turnNumber: state.turnNumber + 1,
    },
    nextPlayerId,
  };
}

/**
 * A 6 was rolled but yields zero valid moves — keep the same player's turn
 * so they aren't penalized for a roll they had no legal use for.
 */
export function processSixNoMoves(state: LudoState): LudoState {
  return {
    ...state,
    currentDice: null,
    phase: 'rolling',
    turnNumber: state.turnNumber + 1,
  };
}

/**
 * Check if a timer has expired.
 */
export function isTimerExpired(startedAt: number | null, timeoutMs: number): boolean {
  if (startedAt === null) return false;
  return Date.now() - startedAt >= timeoutMs;
}
