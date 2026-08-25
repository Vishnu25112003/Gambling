/**
 * Ludo socket handlers — realtime game flow.
 *
 * Manages the full lifecycle of a Ludo match via socket.io:
 *   create → join (lobby fill) → roll → move → (next turn | match_end)
 *
 * Timers run server-side and broadcast state to all clients.
 * The game never imports User, LedgerEntry, Match, or treasury — all money
 * behaviour comes from the escrow adapter.
 *
 * References:
 *   - Gambling_Docs/Games/G02-Ludo.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1–4, with Rule 2 exception)
 */

import type { Namespace, Socket } from 'socket.io';
import { escrow } from '../../escrow/index.js';
import { prisma } from '../../config/db.js';
import { createLogger } from '../../lib/logger.js';
import { Decimal } from '../../lib/money.js';
import {
  createInitialState,
  processDiceRoll,
  processTokenMove,
  processTurnPass,
  getValidMoves,
  getColorSet,
  allTokensHome,
  rankPlayers,
  calculatePayoutWeights,
  ROLL_TIMEOUT_MS,
  MOVE_TIMEOUT_MS,
} from './engine.js';
import type {
  LudoState,
  LudoMoveRecord,
  LudoColor,
  DiceValue,
} from './types.js';
import { LUDO_EVENTS, COLOR_ORDER } from './types.js';

const log = createLogger('game:ludo');

// --- In-memory match state --------------------------------------------------

interface ActiveMatch {
  matchId: string;
  playerIds: string[];
  seatCount: number;
  state: LudoState;
  /** Move records for this match. */
  moveRecords: LudoMoveRecord[];
  /** Socket IDs for each player. */
  socketIds: Record<string, string>;
  /** Timer handles. */
  timers: {
    roll: NodeJS.Timeout | null;
    move: NodeJS.Timeout | null;
  };
  /** Timestamp when the current turn's action window opened. */
  turnStartedAt: number | null;
  /** Players who have been forfeited. */
  forfeitedPlayers: string[];
}

/** matchId → active match. */
const matches = new Map<string, ActiveMatch>();

// --- Room codes (Friends Play) -----------------------------------------------

const CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
  }
  return code;
}

/** roomCode → matchId */
const roomCodes = new Map<string, string>();

/** matchId → lobby info (for Random Play listings and Friends Play host tracking). */
const lobbyInfo = new Map<string, {
  matchId: string;
  hostUserId: string;
  hostSocketId: string;
  hostName: string;
  seatCount: number;
  stake: number;
  betMode: 'fixed' | 'free';
  discovery: 'random' | 'friends';
  createdAt: number;
}>();

/** socketId → matchId (for disconnect handling). */
const socketToMatch = new Map<string, string>();

// --- Helpers ----------------------------------------------------------------

function getIoRef(): Namespace | null {
  return ioRef;
}

let ioRef: Namespace | null = null;

function broadcastToMatch(match: ActiveMatch, event: string, payload: unknown): void {
  const io = getIoRef();
  if (!io) return;
  for (const socketId of Object.values(match.socketIds)) {
    if (socketId) io.to(socketId).emit(event, payload);
  }
}

function guard(label: string, work: Promise<unknown>, context?: Record<string, unknown>): void {
  void work.catch((err) => {
    log.error(`${label} failed`, { ...context, err });
  });
}

function guardSync(label: string, work: () => void, context?: Record<string, unknown>): void {
  try {
    work();
  } catch (err) {
    log.error(`${label} failed`, { ...context, err });
  }
}

function clearTimeouts(match: ActiveMatch): void {
  if (match.timers.roll) {
    clearTimeout(match.timers.roll);
    match.timers.roll = null;
  }
  if (match.timers.move) {
    clearTimeout(match.timers.move);
    match.timers.move = null;
  }
}

// --- Turn management --------------------------------------------------------

function startRollTimer(match: ActiveMatch, playerId: string): void {
  match.turnStartedAt = Date.now();
  match.timers.roll = setTimeout(() => guardSync('roll timeout', () => {
    log.info('roll timeout', { matchId: match.matchId, playerId });

    // Player timed out — pass turn to next player
    const { state: newState, nextPlayerId } = processTurnPass(match.state);
    match.state = newState;

    broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
      currentPlayerId: nextPlayerId,
      turnNumber: newState.turnNumber,
      dice: null,
    });

    startRollTimer(match, nextPlayerId);
  }, { matchId: match.matchId, playerId }), ROLL_TIMEOUT_MS);
}

function startMoveTimer(match: ActiveMatch, playerId: string): void {
  match.turnStartedAt = Date.now();
  match.timers.move = setTimeout(() => guardSync('move timeout', () => {
    log.info('move timeout', { matchId: match.matchId, playerId });

    // Player timed out — pass turn to next player
    const { state: newState, nextPlayerId } = processTurnPass(match.state);
    match.state = newState;

    broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
      currentPlayerId: nextPlayerId,
      turnNumber: newState.turnNumber,
      dice: null,
    });

    startRollTimer(match, nextPlayerId);
  }, { matchId: match.matchId, playerId }), MOVE_TIMEOUT_MS);
}

// --- Match end / settlement -------------------------------------------------

async function settleMatch(match: ActiveMatch, winnerId: string | null): Promise<void> {
  clearTimeouts(match);

  // Rank players by total steps (forfeit players excluded)
  const rankings = rankPlayers(match.state, match.forfeitedPlayers);

  // If there's a winner, ensure they're ranked 1st
  if (winnerId) {
    const winnerRanking = rankings.find((r) => r.playerId === winnerId);
    if (winnerRanking && winnerRanking.rank !== 1) {
      // Winner should always be first
      winnerRanking.rank = 1;
      // Re-rank others
      let currentRank = 2;
      for (const r of rankings) {
        if (r.playerId !== winnerId) {
          r.rank = currentRank++;
        }
      }
    }
  }

  // Calculate payout weights
  const payoutWeights = calculatePayoutWeights(rankings, match.seatCount);

  // Call settleMatch via escrow
  const winnerIds = payoutWeights.map((p) => p.userId);
  const weights = payoutWeights.map((p) => p.weight);

  const result = await escrow.settleMatch(
    match.matchId,
    winnerIds.length > 0 ? winnerIds : [match.playerIds[0]!],
    weights.length > 0 ? weights : [1],
    {
      result: {
        winnerId,
        seatCount: match.seatCount,
        rankings: rankings.map((r) => ({
          playerId: r.playerId,
          rank: r.rank,
          totalSteps: r.totalSteps,
        })),
        forfeitedPlayers: match.forfeitedPlayers,
      },
    },
  );

  // Broadcast match result
  broadcastToMatch(match, LUDO_EVENTS.MATCH_RESULT, {
    winnerId,
    rankings: rankings.map((r) => ({
      playerId: r.playerId,
      rank: r.rank,
      totalSteps: r.totalSteps,
    })),
    seatCount: match.seatCount,
    pot: result.pot.toString(),
    feeCollected: result.feeCollected.toString(),
    payouts: result.payouts.map((p) => ({
      userId: p.userId,
      payout: p.payout.toString(),
    })),
  });

  // Clean up
  for (const socketId of Object.values(match.socketIds)) {
    if (socketId) socketToMatch.delete(socketId);
  }
  matches.delete(match.matchId);
  lobbyInfo.delete(match.matchId);

  log.info('match settled', {
    matchId: match.matchId,
    winnerId,
    seatCount: match.seatCount,
  });
}

// --- Socket event handlers --------------------------------------------------

export function registerLudoSocket(namespace: Namespace, socket: Socket): void {
  const userId = socket.data.userId as string;

  ioRef = namespace;

  // --- LIST_MATCHES: return public Random Play matches ---
  socket.on(LUDO_EVENTS.LIST_MATCHES, () => {
    const listed = [...lobbyInfo.values()]
      .filter((m) => m.discovery === 'random')
      .filter((m) => m.hostUserId !== userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((m) => ({
        matchId: m.matchId,
        hostName: m.hostName,
        seatCount: m.seatCount,
        stake: String(m.stake),
        betMode: m.betMode,
      }));
    socket.emit(LUDO_EVENTS.MATCHES_LIST, { matches: listed });
  });

  // --- CREATE_MATCH: host creates a new lobby ---
  socket.on(LUDO_EVENTS.CREATE_MATCH, async (data: {
    discovery?: 'random' | 'friends';
    seatCount?: number;
    betMode?: 'fixed' | 'free';
    stake?: number;
  }) => {
    try {
      const seatCount = data.seatCount ?? 2;
      const stakeAmount = data.stake ?? 0.1;
      const mode = data.betMode ?? 'fixed';
      const discovery = data.discovery ?? 'random';

      if (seatCount < 2 || seatCount > 4) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Seat count must be 2, 3, or 4' });
        return;
      }
      if (stakeAmount <= 0) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Stake must be positive' });
        return;
      }

      // Create match in DB
      const matchId = await escrow.createMatch({
        gameType: 'ludo',
        mode: 'pooled',
        gameState: { seatCount, betMode: mode, stake: stakeAmount },
      });

      // Add host as participant (not locked yet — reserved per Rule 4)
      await prisma.matchParticipant.create({
        data: { matchId, userId, lockedAmount: 0, stakeTotal: 0, status: 'active' },
      });

      // Get host display name
      const hostUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      const hostName = hostUser?.username ?? 'Player';

      if (discovery === 'random') {
        // List publicly
        lobbyInfo.set(matchId, {
          matchId,
          hostUserId: userId,
          hostSocketId: socket.id,
          hostName,
          seatCount,
          stake: stakeAmount,
          betMode: mode,
          discovery: 'random',
          createdAt: Date.now(),
        });

        socket.emit(LUDO_EVENTS.MATCH_CREATED, { matchId });
        log.info('random match created', {
          matchId, host: userId, stake: stakeAmount, seatCount,
        });
      } else {
        // Friends Play — generate room code
        let code = generateRoomCode();
        while (roomCodes.has(code)) code = generateRoomCode();
        roomCodes.set(code, matchId);

        lobbyInfo.set(matchId, {
          matchId,
          hostUserId: userId,
          hostSocketId: socket.id,
          hostName,
          seatCount,
          stake: stakeAmount,
          betMode: mode,
          discovery: 'friends',
          createdAt: Date.now(),
        });

        socket.emit(LUDO_EVENTS.MATCH_CREATED, { matchId, roomCode: code });
        log.info('friends match created', {
          matchId, host: userId, code, stake: stakeAmount,
        });
      }
    } catch (err) {
      log.error('create_match error', { userId, err });
      socket.emit(LUDO_EVENTS.ERROR, { message: 'Failed to create match' });
    }
  });

  // --- JOIN_MATCH: join an existing lobby ---
  socket.on(LUDO_EVENTS.JOIN_MATCH, async (data: { matchId?: string; roomCode?: string }) => {
    try {
      let matchId: string | undefined;
      let usedRoomCode: string | undefined;

      // Resolve matchId from either source
      if (data.roomCode) {
        usedRoomCode = data.roomCode.toUpperCase();
        matchId = roomCodes.get(usedRoomCode);
        if (!matchId) {
          socket.emit(LUDO_EVENTS.ERROR, { message: 'Invalid room code' });
          return;
        }
      } else if (data.matchId) {
        matchId = data.matchId;
      }

      if (!matchId) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'No match specified' });
        return;
      }

      // Check if this is a reconnection to an active match
      const activeMatch = matches.get(matchId);
      if (activeMatch && activeMatch.playerIds.includes(userId)) {
        socketToMatch.set(socket.id, matchId);
        activeMatch.socketIds[userId] = socket.id;
        if (activeMatch.state.disconnectedPlayers.includes(userId)) {
          activeMatch.state.disconnectedPlayers =
            activeMatch.state.disconnectedPlayers.filter((id) => id !== userId);
          await escrow.cancelForfeit(matchId, userId);
          broadcastToMatch(activeMatch, LUDO_EVENTS.OPPONENT_RECONNECTED, { userId });
        }
        socket.emit(LUDO_EVENTS.MATCH_STATE, {
          state: activeMatch.state,
          moveRecords: activeMatch.moveRecords,
          message: 'Reconnected',
        });
        return;
      }

      // New join: look up the match from DB
      const dbMatch = await prisma.match.findUnique({
        where: { id: matchId },
        include: { participants: true },
      });
      if (!dbMatch || dbMatch.gameType !== 'ludo') {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Match not found' });
        return;
      }
      if (dbMatch.status !== 'open') {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Match already started or finished' });
        return;
      }

      // Check not already a participant
      if (dbMatch.participants.some((p) => p.userId === userId)) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Already in this match' });
        return;
      }

      // Get game settings from gameState
      const gs = (dbMatch.gameState ?? {}) as {
        seatCount?: number;
        betMode?: string;
        stake?: number;
      };
      const seatCount = gs.seatCount ?? 2;
      const stakeAmount = gs.stake ?? lobbyInfo.get(matchId)?.stake ?? 0.1;

      // Check match isn't full
      if (dbMatch.participants.length >= seatCount) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Match is full' });
        return;
      }

      // Add joiner as participant
      await prisma.matchParticipant.create({
        data: { matchId, userId, lockedAmount: 0, stakeTotal: 0, status: 'active' },
      });

      // Collect all player IDs (host first, joiners in join order)
      const allParticipantIds = dbMatch.participants.map((p) => p.userId);
      allParticipantIds.push(userId);

      // Check if lobby is now full
      const isLobbyFull = allParticipantIds.length >= seatCount;

      if (!isLobbyFull) {
        // Lobby not full yet — send updated lobby state to host
        const lobby = lobbyInfo.get(matchId);
        if (lobby) {
          const io = getIoRef();
          if (io) {
            io.to(lobby.hostSocketId).emit(LUDO_EVENTS.MATCH_STATE, {
              matchId,
              phase: 'waiting_for_players',
              currentPlayers: allParticipantIds.length,
              seatCount,
              message: `Player joined (${allParticipantIds.length}/${seatCount})`,
            });
          }
        }

        // Notify the joiner
        socket.emit(LUDO_EVENTS.MATCH_CREATED, {
          matchId,
          phase: 'waiting_for_players',
          currentPlayers: allParticipantIds.length,
          seatCount,
        });

        log.info('player joined lobby', {
          matchId, userId, players: allParticipantIds.length, seatCount,
        });
        return;
      }

      // --- Lobby is full — start the match! ---

      // Lock all stakes via escrow
      const stakeDecimal = new Decimal(stakeAmount);
      for (const pid of allParticipantIds) {
        await escrow.lockBalance(pid, stakeDecimal, matchId);
      }

      // Assign colors and initialize game state
      const playerIds = allParticipantIds as string[];
      const state = createInitialState(seatCount, playerIds);

      // Create active match
      const newActiveMatch: ActiveMatch = {
        matchId,
        playerIds,
        seatCount,
        state,
        moveRecords: [],
        socketIds: {},
        timers: { roll: null, move: null },
        turnStartedAt: null,
        forfeitedPlayers: [],
      };

      // Wire up socket IDs for all connected players
      const lobby = lobbyInfo.get(matchId);
      if (lobby) {
        newActiveMatch.socketIds[lobby.hostUserId] = lobby.hostSocketId;
        socketToMatch.set(lobby.hostSocketId, matchId);
      }
      newActiveMatch.socketIds[userId] = socket.id;
      socketToMatch.set(socket.id, matchId);

      matches.set(matchId, newActiveMatch);

      // Get player names
      const players = await prisma.user.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, username: true },
      });
      const nameMap = new Map(players.map((p) => [p.id, p.username ?? 'Player']));

      // Broadcast match start to all players
      broadcastToMatch(newActiveMatch, LUDO_EVENTS.MATCH_STATE, {
        matchId,
        players: playerIds.map((id) => ({
          id,
          displayName: nameMap.get(id),
          color: state.colors[id],
        })),
        seatCount,
        stake: stakeAmount,
        totalRounds: 'infinite',
      });

      // Start first player's turn
      broadcastToMatch(newActiveMatch, LUDO_EVENTS.TURN_START, {
        currentPlayerId: state.currentPlayerId,
        turnNumber: state.turnNumber,
        dice: null,
      });

      // Start roll timer for first player
      startRollTimer(newActiveMatch, state.currentPlayerId);

      // Clean up lobby
      lobbyInfo.delete(matchId);
      if (usedRoomCode) roomCodes.delete(usedRoomCode);

      // Remove joiner from any waiting queue
      // (Ludo doesn't use a waiting queue like coin-flip, but for safety)

      log.info('match started', {
        matchId, playerIds, seatCount, stake: stakeAmount,
      });
    } catch (err) {
      log.error('join_match error', { userId, err });
      socket.emit(LUDO_EVENTS.ERROR, { message: 'Failed to join match' });
    }
  });

  // --- ROLL_DICE: current player rolls the dice ---
  socket.on(LUDO_EVENTS.ROLL_DICE, () => {
    try {
      const matchId = socketToMatch.get(socket.id);
      if (!matchId) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Not in a match' });
        return;
      }

      const match = matches.get(matchId);
      if (!match) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Match not active' });
        return;
      }

      if (match.state.phase !== 'rolling') {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Not the rolling phase' });
        return;
      }

      if (match.state.currentPlayerId !== userId) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Not your turn' });
        return;
      }

      // Clear roll timer
      if (match.timers.roll) {
        clearTimeout(match.timers.roll);
        match.timers.roll = null;
      }

      // Process dice roll
      const { state: newState, diceValue, validMoves, mustPass } = processDiceRoll(match.state);

      match.state = newState;

      // Broadcast dice roll to all players
      broadcastToMatch(match, LUDO_EVENTS.DICE_ROLLED, {
        playerId: userId,
        diceValue,
        color: match.state.colors[userId],
      });

      if (mustPass) {
        // Three consecutive 6s — lose turn
        log.info('three consecutive sixes', { matchId, playerId: userId });

        const { state: afterPass, nextPlayerId } = processTurnPass(match.state);
        match.state = afterPass;

        broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
          currentPlayerId: nextPlayerId,
          turnNumber: afterPass.turnNumber,
          dice: null,
          reason: 'three_sixes',
        });

        startRollTimer(match, nextPlayerId);
        return;
      }

      if (validMoves.length === 0) {
        // No valid moves — pass turn
        log.info('no valid moves', { matchId, playerId: userId, diceValue });

        const { state: afterPass, nextPlayerId } = processTurnPass(match.state);
        match.state = afterPass;

        broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
          currentPlayerId: nextPlayerId,
          turnNumber: afterPass.turnNumber,
          dice: null,
          reason: 'no_moves',
        });

        startRollTimer(match, nextPlayerId);
        return;
      }

      if (validMoves.length === 1) {
        // Auto-move if only one valid option
        const move = validMoves[0]!;
        const { state: moveState, result, matchWinner, nextPlayerId, getsExtraTurn } =
          processTokenMove(match.state, move.tokenIndex);

        match.state = moveState;

        // Record the move
        match.moveRecords.push({
          turnNumber: moveState.turnNumber - 1,
          playerId: userId,
          color: match.state.colors[userId]!,
          diceValue,
          movedToken: move.tokenIndex,
          cause: result.enteredHome ? 'home_entry' : result.captured.length > 0 ? 'capture' : 'roll',
          captured: result.captured,
        });

        // Broadcast move
        broadcastToMatch(match, LUDO_EVENTS.TOKEN_MOVED, {
          playerId: userId,
          tokenIndex: move.tokenIndex,
          diceValue,
          newPosition: moveState.tokens[userId]![move.tokenIndex],
          totalSteps: moveState.totalSteps[userId],
          captures: result.captured,
        });

        if (matchWinner) {
          // Match over!
          guard('settle match', settleMatch(match, matchWinner), { matchId });
          return;
        }

        if (getsExtraTurn) {
          broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
            currentPlayerId: userId,
            turnNumber: moveState.turnNumber,
            dice: null,
            reason: 'extra_turn',
          });
          startRollTimer(match, userId);
        } else {
          broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
            currentPlayerId: nextPlayerId,
            turnNumber: moveState.turnNumber,
            dice: null,
          });
          startRollTimer(match, nextPlayerId);
        }
        return;
      }

      // Multiple valid moves — enter 'moving' phase, let player choose
      match.state.phase = 'moving';

      // Send valid moves to the current player
      const io = getIoRef();
      if (io) {
        const playerSocket = match.socketIds[userId];
        if (playerSocket) {
          io.to(playerSocket).emit(LUDO_EVENTS.MATCH_STATE, {
            phase: 'moving',
            diceValue,
            validMoves,
            message: 'Choose which token to move',
          });
        }
      }

      // Start move timer
      startMoveTimer(match, userId);
    } catch (err) {
      log.error('roll_dice error', { userId, err });
      socket.emit(LUDO_EVENTS.ERROR, { message: 'Failed to roll dice' });
    }
  });

  // --- MOVE_TOKEN: player chooses which token to move ---
  socket.on(LUDO_EVENTS.MOVE_TOKEN, (data: { tokenIndex?: number }) => {
    try {
      const matchId = socketToMatch.get(socket.id);
      if (!matchId) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Not in a match' });
        return;
      }

      const match = matches.get(matchId);
      if (!match) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Match not active' });
        return;
      }

      if (match.state.phase !== 'moving') {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Not the moving phase' });
        return;
      }

      if (match.state.currentPlayerId !== userId) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Not your turn' });
        return;
      }

      const tokenIndex = data.tokenIndex;
      if (tokenIndex === undefined || tokenIndex < 0 || tokenIndex > 3) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Invalid token index (0-3)' });
        return;
      }

      // Verify this is a valid move
      const playerTokens = match.state.tokens[userId]!;
      const color = match.state.colors[userId]!;
      const diceValue = match.state.currentDice!;

      const validMoves = getValidMoves(
        playerTokens,
        diceValue,
        color,
        match.state.tokens,
        match.state.playerIds,
        match.state.colors,
      );

      if (!validMoves.some((m) => m.tokenIndex === tokenIndex)) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Invalid move for that token' });
        return;
      }

      // Clear move timer
      if (match.timers.move) {
        clearTimeout(match.timers.move);
        match.timers.move = null;
      }

      // Execute the move
      const { state: moveState, result, matchWinner, nextPlayerId, getsExtraTurn } =
        processTokenMove(match.state, tokenIndex);

      match.state = moveState;

      // Record the move
      match.moveRecords.push({
        turnNumber: moveState.turnNumber - 1,
        playerId: userId,
        color: match.state.colors[userId]!,
        diceValue,
        movedToken: tokenIndex,
        cause: result.enteredHome ? 'home_entry' : result.captured.length > 0 ? 'capture' : 'roll',
        captured: result.captured,
      });

      // Broadcast move
      broadcastToMatch(match, LUDO_EVENTS.TOKEN_MOVED, {
        playerId: userId,
        tokenIndex,
        diceValue,
        newPosition: moveState.tokens[userId]![tokenIndex],
        totalSteps: moveState.totalSteps[userId],
        captures: result.captured,
      });

      if (matchWinner) {
        // Match over!
        guard('settle match', settleMatch(match, matchWinner), { matchId });
        return;
      }

      if (getsExtraTurn) {
        match.state.phase = 'rolling';
        broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
          currentPlayerId: userId,
          turnNumber: moveState.turnNumber,
          dice: null,
          reason: 'extra_turn',
        });
        startRollTimer(match, userId);
      } else {
        match.state.phase = 'rolling';
        broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
          currentPlayerId: nextPlayerId,
          turnNumber: moveState.turnNumber,
          dice: null,
        });
        startRollTimer(match, nextPlayerId);
      }
    } catch (err) {
      log.error('move_token error', { userId, err });
      socket.emit(LUDO_EVENTS.ERROR, { message: 'Failed to move token' });
    }
  });

  // --- LEAVE_LOBBY: player leaves before match starts ---
  socket.on(LUDO_EVENTS.LEAVE_LOBBY, async (data: { matchId?: string }) => {
    try {
      const matchId = data.matchId ?? socketToMatch.get(socket.id);
      if (!matchId) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'No match specified' });
        return;
      }

      // Only works for lobby phase, not active matches
      if (matches.has(matchId)) {
        socket.emit(LUDO_EVENTS.ERROR, { message: 'Match already started' });
        return;
      }

      // Remove from DB participants
      await prisma.matchParticipant.deleteMany({
        where: { matchId, userId },
      });

      // Remove from lobby info if host
      const lobby = lobbyInfo.get(matchId);
      if (lobby && lobby.hostUserId === userId) {
        lobbyInfo.delete(matchId);
        // Also clean up room code
        for (const [code, mid] of roomCodes) {
          if (mid === matchId) roomCodes.delete(code);
        }
      }

      socketToMatch.delete(socket.id);
      socket.emit(LUDO_EVENTS.MATCH_CREATED, { matchId, message: 'Left lobby' });
    } catch (err) {
      log.error('leave_lobby error', { userId, err });
      socket.emit(LUDO_EVENTS.ERROR, { message: 'Failed to leave lobby' });
    }
  });

  // --- DISCONNECT: handle player disconnecting ---
  socket.on('disconnect', async () => {
    try {
      // Clean up lobby info owned by this user
      for (const [matchId, info] of lobbyInfo) {
        if (info.hostUserId === userId || info.hostSocketId === socket.id) {
          lobbyInfo.delete(matchId);
          for (const [code, mid] of roomCodes) {
            if (mid === matchId) roomCodes.delete(code);
          }
        }
      }

      const matchId = socketToMatch.get(socket.id);
      if (!matchId) return;

      const match = matches.get(matchId);
      if (!match) return;

      // Remove this socket
      delete match.socketIds[userId];
      socketToMatch.delete(socket.id);

      // Mark as disconnected
      if (!match.state.disconnectedPlayers.includes(userId)) {
        match.state.disconnectedPlayers.push(userId);
      }

      broadcastToMatch(match, LUDO_EVENTS.OPPONENT_DISCONNECTED, { userId });

      // Start the forfeit grace period via escrow
      const forfeitResult = await escrow.forfeitPlayer(matchId, userId);

      if (forfeitResult.outcome === 'forfeited') {
        // Player was forfeited — add to forfeited list
        match.forfeitedPlayers.push(userId);

        // If it was their turn, pass to next player
        if (match.state.currentPlayerId === userId) {
          clearTimeouts(match);
          const { state: newState, nextPlayerId } = processTurnPass(match.state);
          match.state = newState;

          broadcastToMatch(match, LUDO_EVENTS.TURN_START, {
            currentPlayerId: nextPlayerId,
            turnNumber: newState.turnNumber,
            dice: null,
          });

          startRollTimer(match, nextPlayerId);
        }

        // Check if only one player remains — that player wins
        const activePlayers = match.playerIds.filter(
          (id) => !match.forfeitedPlayers.includes(id),
        );

        if (activePlayers.length <= 1) {
          const winnerId = activePlayers[0] ?? null;
          await settleMatch(match, winnerId);
        }
      } else if (forfeitResult.outcome === 'reconnected') {
        // They reconnected — cancel forfeit (handled in JOIN_MATCH)
      }
    } catch (err) {
      log.error('disconnect cleanup failed', { userId, socketId: socket.id, err });
    }
  });
}
