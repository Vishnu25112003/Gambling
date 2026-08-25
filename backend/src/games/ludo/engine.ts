/**
 * Ludo engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs and easy to unit-test.
 * This file never touches the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G02-Ludo.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4, with Rule 2 exception)
 */

import type {
  LudoColor,
  LudoState,
  Token,
  TokenZone,
  DiceValue,
  MoveCause,
  LudoMoveRecord,
  PlayerRecord,
} from './types.js';
import { COLOR_ORDER, TWO_PLAYER_COLORS, HOME_COLUMN_LENGTH, TRACK_LENGTH } from './types.js';

// --- Constants --------------------------------------------------------------

/** Max consecutive 6s allowed before the turn is forfeited (rule: 3 sixes = lose turn). */
export const MAX_CONSECUTIVE_SIXES = 3;

/** Timeout for a player to roll the dice (ms). */
export const ROLL_TIMEOUT_MS = 15_000;

/** Timeout for a player to choose which token to move after rolling (ms). */
export const MOVE_TIMEOUT_MS = 10_000;

// --- Payout table (overrides Rule 2) ----------------------------------------

/**
 * Paid places and percentage splits by seated player count.
 * After Rule 1's 5% fee is deducted from the pot.
 */
export const PAYOUT_TABLE: Record<number, { paidPlaces: number; splits: number[] }> = {
  2: { paidPlaces: 1, splits: [100] },
  3: { paidPlaces: 2, splits: [70, 30] },
  4: { paidPlaces: 3, splits: [50, 30, 20] },
};

// --- Safe squares -----------------------------------------------------------

/** Global track positions that are safe (tokens cannot be captured here). */
export const SAFE_POSITIONS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/**
 * Start position offset for each color on the global track.
 * Red=0, Green=13, Yellow=26, Blue=39.
 */
export const COLOR_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// --- Color assignment -------------------------------------------------------

/** 2-player: fixed Red vs Yellow (opposite pairing). */
const TWO_PLAYER: LudoColor[] = ['red', 'yellow'];

/** 3-player: Red, Green, Yellow (standard subset). */
const THREE_PLAYER: LudoColor[] = ['red', 'green', 'yellow'];

/** 4-player: all four colors. */
const FOUR_PLAYER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

/**
 * Get the color set for a given player count.
 */
export function getColorSet(seatCount: number): LudoColor[] {
  switch (seatCount) {
    case 2: return TWO_PLAYER;
    case 3: return THREE_PLAYER;
    case 4: return FOUR_PLAYER;
    default: throw new Error(`Invalid seat count: ${seatCount}`);
  }
}

/**
 * Assign colors to players in seat order.
 * Player 0 gets the first color, player 1 gets the second, etc.
 */
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
    { zone: 'yard', position: 0, homePosition: 0 },
    { zone: 'yard', position: 0, homePosition: 0 },
    { zone: 'yard', position: 0, homePosition: 0 },
    { zone: 'yard', position: 0, homePosition: 0 },
  ];
}

/** Count how many tokens a player has in each zone. */
export function countTokensByZone(tokens: Token[]): { yard: number; track: number; home: number } {
  let yard = 0, track = 0, home = 0;
  for (const t of tokens) {
    if (t.zone === 'yard') yard++;
    else if (t.zone === 'track') track++;
    else home++;
  }
  return { yard, track, home };
}

/** Check if all 4 tokens are home (match-winning condition). */
export function allTokensHome(tokens: Token[]): boolean {
  return tokens.every((t) => t.zone === 'home' && t.homePosition >= HOME_COLUMN_LENGTH);
}

// --- Board position helpers -------------------------------------------------

/**
 * Get the global track position for a token on the track.
 * Wraps around the 52-square track using the color's offset.
 */
export function getGlobalPosition(color: LudoColor, trackPosition: number): number {
  return (COLOR_OFFSET[color]! + trackPosition) % TRACK_LENGTH;
}

/**
 * Get the global position a token would land on after moving `diceValue` steps
 * from its current track position. Returns -1 if it would enter the home column.
 */
export function getTargetGlobalPosition(
  color: LudoColor,
  currentPosition: number,
  diceValue: DiceValue,
): number {
  const targetTrackPos = currentPosition + diceValue;
  if (targetTrackPos >= TRACK_LENGTH) {
    return -1; // entering home column
  }
  return getGlobalPosition(color, targetTrackPos);
}

/**
 * Check if a global position is a safe square.
 */
export function isSafeSquare(globalPosition: number): boolean {
  return SAFE_POSITIONS.has(globalPosition);
}

/**
 * Check if a token is on its own start square (always safe).
 */
export function isOnOwnStart(color: LudoColor, trackPosition: number): boolean {
  return trackPosition === 0;
}

// --- Move validation --------------------------------------------------------

export interface ValidMove {
  tokenIndex: number;
  /** 'yard' = bringing a token out, 'track' = moving on track, 'home' = moving in home column. */
  type: 'yard' | 'track' | 'home';
}

/**
 * Get all valid moves for a player given the current dice roll.
 *
 * Rules:
 * - Yard tokens: only movable on a 6 (brings token to start square).
 * - Track tokens: movable if destination is not occupied by a friendly token
 *   (unless destination is the start square, which is always valid to enter).
 * - Home column tokens: movable if destination doesn't exceed HOME_COLUMN_LENGTH.
 * - If no valid moves exist, the turn is skipped.
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
  const yardCount = tokens.filter((t) => t.zone === 'yard').length;

  // If all tokens are in yard and dice is not 6, no moves
  if (yardCount === tokens.length && diceValue !== 6) {
    return [];
  }

  // Check each token
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token.zone === 'yard') {
      // Can only leave yard on a 6
      if (diceValue === 6) {
        // Start square is always safe to enter
        moves.push({ tokenIndex: i, type: 'yard' });
      }
    } else if (token.zone === 'track') {
      const targetTrackPos = token.position + diceValue;

      if (targetTrackPos >= TRACK_LENGTH) {
        // Entering home column
        const homeEntry = targetTrackPos - TRACK_LENGTH;
        if (homeEntry <= HOME_COLUMN_LENGTH) {
          // Check no friendly token already at this home position
          const friendlyAtHome = tokens.some(
            (t, j) => j !== i && t.zone === 'home' && t.homePosition === homeEntry,
          );
          if (!friendlyAtHome) {
            moves.push({ tokenIndex: i, type: 'home' });
          }
        }
      } else {
        // Moving on track
        const globalPos = getGlobalPosition(color, targetTrackPos);

        // Check no friendly token at destination (except own start square which is always valid)
        const friendlyAtDest = tokens.some(
          (t, j) =>
            j !== i &&
            t.zone === 'track' &&
            getGlobalPosition(color, t.position) === globalPos,
        );

        if (!friendlyAtDest) {
          moves.push({ tokenIndex: i, type: 'track' });
        }
      }
    } else if (token.zone === 'home') {
      const targetHomePos = token.homePosition + diceValue;
      if (targetHomePos <= HOME_COLUMN_LENGTH) {
        // Check no friendly token at destination
        const friendlyAtHome = tokens.some(
          (t, j) => j !== i && t.zone === 'home' && t.homePosition === targetHomePos,
        );
        if (!friendlyAtHome) {
          moves.push({ tokenIndex: i, type: 'home' });
        }
      }
    }
  }

  return moves;
}

// --- Move execution ---------------------------------------------------------

export interface MoveResult {
  /** Updated tokens for the moving player. */
  tokens: Token[];
  /** Steps moved (0 if no move). */
  stepsMoved: number;
  /** Whether a capture occurred. */
  captured: { playerId: string; tokenIndex: number }[];
  /** Whether the token entered home. */
  enteredHome: boolean;
  /** Whether the token reached final home (all 6 squares). */
  reachedHome: boolean;
}

/**
 * Execute a move for a specific token.
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
  const newTokens = tokens.map((t) => ({ ...t }));
  const target = newTokens[tokenIndex]!;
  const captured: { playerId: string; tokenIndex: number }[] = [];
  let stepsMoved = 0;
  let enteredHome = false;
  let reachedHome = false;

  if (target.zone === 'yard' && diceValue === 6) {
    // Bring token out of yard to start square
    target.zone = 'track';
    target.position = 0;
    stepsMoved = 0; // stepping onto start square
  } else if (target.zone === 'track') {
    const targetTrackPos = target.position + diceValue;

    if (targetTrackPos >= TRACK_LENGTH) {
      // Entering home column
      const homeEntry = targetTrackPos - TRACK_LENGTH;
      target.zone = 'home';
      target.homePosition = homeEntry;
      enteredHome = true;
      reachedHome = homeEntry >= HOME_COLUMN_LENGTH;
      stepsMoved = diceValue;
    } else {
      // Moving on track
      target.position = targetTrackPos;
      stepsMoved = diceValue;

      // Check for capture
      const globalPos = getGlobalPosition(color, target.position);

      if (!isSafeSquare(globalPos)) {
        // Check all opponent tokens
        for (const oppId of playerIds) {
          if (oppId === undefined) continue;
          const oppColor = colors[oppId];
          if (oppColor === undefined || oppColor === color) continue;
          const oppTokens = allTokens[oppId];
          if (!oppTokens) continue;

          for (let j = 0; j < oppTokens.length; j++) {
            const oppToken = oppTokens[j]!;
            if (
              oppToken.zone === 'track' &&
              getGlobalPosition(oppColor, oppToken.position) === globalPos
            ) {
              // Capture! Send opponent token back to yard
              oppToken.zone = 'yard';
              oppToken.position = 0;
              oppToken.homePosition = 0;
              captured.push({ playerId: oppId, tokenIndex: j });
            }
          }
        }
      }
    }
  } else if (target.zone === 'home') {
    const targetHomePos = target.homePosition + diceValue;
    target.homePosition = targetHomePos;
    stepsMoved = diceValue;
    reachedHome = targetHomePos >= HOME_COLUMN_LENGTH;
  }

  return { tokens: newTokens, stepsMoved, captured, enteredHome, reachedHome };
}

// --- Match state ------------------------------------------------------------

/**
 * Create initial match state.
 */
export function createInitialState(
  seatCount: number,
  playerIds: string[],
): LudoState {
  const colors = assignColors(playerIds, seatCount);
  const tokens: Record<string, Token[]> = {};
  const totalSteps: Record<string, number> = {};

  for (const id of playerIds) {
    tokens[id] = createTokens();
    totalSteps[id] = 0;
  }

  return {
    seatCount,
    playerIds,
    colors,
    tokens,
    totalSteps,
    currentPlayerId: playerIds[0]!,
    phase: 'rolling',
    currentDice: null,
    consecutiveSixes: 0,
    turnNumber: 1,
    disconnectedPlayers: [],
  };
}

/**
 * Get the next player in turn order.
 */
export function getNextPlayer(
  currentPlayerId: string,
  playerIds: string[],
): string {
  const currentIndex = playerIds.indexOf(currentPlayerId);
  return playerIds[(currentIndex + 1) % playerIds.length]!;
}

/**
 * Check if the match is over (any player has all 4 tokens home).
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
 * Rank all players by total steps moved (more steps = higher rank).
 * Tied players share the same rank.
 * Forfeit players are excluded.
 */
export function rankPlayers(
  state: LudoState,
  forfeitedPlayers: string[],
): { playerId: string; rank: number; totalSteps: number }[] {
  const active = state.playerIds.filter((id) => !forfeitedPlayers.includes(id));
  const ranked = active
    .map((id) => ({ playerId: id, totalSteps: state.totalSteps[id] ?? 0 }))
    .sort((a, b) => b.totalSteps - a.totalSteps);

  let currentRank = 1;
  const result: { playerId: string; rank: number; totalSteps: number }[] = [];

  for (let i = 0; i < ranked.length; i++) {
    const entry = ranked[i]!;
    if (i > 0 && entry.totalSteps === ranked[i - 1]!.totalSteps) {
      result.push({ playerId: entry.playerId, rank: result[i - 1]!.rank, totalSteps: entry.totalSteps });
    } else {
      result.push({ playerId: entry.playerId, rank: currentRank, totalSteps: entry.totalSteps });
      currentRank++;
    }
  }

  return result;
}

/**
 * Calculate payout weights from rankings and seat count.
 * Returns an array of { userId, weight } for paid places only.
 * Ties are handled by splitting that place's share evenly.
 */
export function calculatePayoutWeights(
  rankings: { playerId: string; rank: number; totalSteps: number }[],
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

/**
 * Process a dice roll and determine the turn outcome.
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

  const validMoves = getValidMoves(
    playerTokens,
    diceValue,
    color,
    state.tokens,
    state.playerIds,
    state.colors,
  );

  // Three consecutive 6s = lose turn, no move
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

  return { state: newState, diceValue, validMoves, mustPass };
}

/**
 * Process a token move after dice roll.
 */
export function processTokenMove(
  state: LudoState,
  tokenIndex: number,
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
  const playerTokens = [...(state.tokens[playerId]!.map((t) => ({ ...t })))];

  const moveResult = executeMove(
    playerTokens,
    tokenIndex,
    diceValue,
    color,
    state.tokens,
    state.playerIds,
    state.colors,
  );

  // Update tokens and total steps
  const newTokens = { ...state.tokens, [playerId]: moveResult.tokens };
  const newTotalSteps = {
    ...state.totalSteps,
    [playerId]: (state.totalSteps[playerId] ?? 0) + moveResult.stepsMoved,
  };

  const newState: LudoState = {
    ...state,
    tokens: newTokens,
    totalSteps: newTotalSteps,
    currentDice: null,
  };

  // Check for match winner
  const matchWinner = checkMatchEnd(newState);

  // Determine extra turn or next player
  let getsExtraTurn = false;
  let nextPlayerId: string;

  if (matchWinner) {
    newState.phase = 'match_over';
    nextPlayerId = state.currentPlayerId;
  } else if (diceValue === 6 && state.consecutiveSixes < MAX_CONSECUTIVE_SIXES - 1) {
    // Extra turn on rolling a 6 (unless it was the 3rd consecutive)
    getsExtraTurn = true;
    nextPlayerId = state.currentPlayerId;
  } else {
    nextPlayerId = getNextPlayer(state.currentPlayerId, state.playerIds);
  }

  newState.currentPlayerId = nextPlayerId;
  newState.turnNumber = state.turnNumber + 1;

  return { state: newState, result: moveResult, matchWinner, nextPlayerId, getsExtraTurn };
}

/**
 * Process a turn pass (no valid moves or 3 consecutive 6s).
 */
export function processTurnPass(state: LudoState): {
  state: LudoState;
  nextPlayerId: string;
} {
  const nextPlayerId = getNextPlayer(state.currentPlayerId, state.playerIds);
  return {
    state: {
      ...state,
      currentDice: null,
      consecutiveSixes: 0,
      currentPlayerId: nextPlayerId,
      turnNumber: state.turnNumber + 1,
    },
    nextPlayerId,
  };
}

/**
 * Check if a timer has expired.
 */
export function isTimerExpired(startedAt: number | null, timeoutMs: number): boolean {
  if (startedAt === null) return false;
  return Date.now() - startedAt >= timeoutMs;
}
