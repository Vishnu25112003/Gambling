/**
 * Coin Flip socket handlers — realtime game flow.
 *
 * Manages the full lifecycle of a coin-flip match via socket.io:
 *   join → seat_draw → spin → call → reveal → round_result → (next round | match_end)
 *
 * Timers run server-side and broadcast state to both clients.
 * The game never imports User, LedgerEntry, Match, or treasury — all money
 * behaviour comes from the escrow adapter.
 */

import type { Namespace, Socket } from 'socket.io';
import { escrow } from '../../escrow/index.js';
import { prisma } from '../../config/db.js';
import { createLogger } from '../../lib/logger.js';
import {
  generateSeatDraw,
  generateCoinResult,
  computeCommitHash,
  createInitialState,
  revealSeatDraw,
  startSpin,
  resolveCall,
  resolveSpinTimeout,
  advanceRound,
  SPIN_TIMEOUT_MS,
  CALL_TIMEOUT_MS,
  VALID_ROUND_COUNTS,
} from './engine.js';
import type {
  CoinFlipState,
  CoinFlipRoundRecord,
  CoinSide,
  Seat,
} from './types.js';
import { CF_EVENTS } from './types.js';

const log = createLogger('game:coin-flip');

// --- In-memory match state --------------------------------------------------

/** The settings a match was created with — carried over unchanged into a Rematch. */
interface MatchSettings {
  rounds: number;
  betMode: string;
  minBet: number | null;
  /** Both players lock the same amount today — see JOIN_MATCH. */
  stake: number;
}

interface ActiveMatch {
  matchId: string;
  playerIds: [string, string];
  state: CoinFlipState;
  /** Seeded seat draw, revealed to clients. */
  seatDraw: { seed: string; commitHash: string; assignment: string };
  /** Per-round records (written to DB at reveal). */
  roundRecords: CoinFlipRoundRecord[];
  /** Socket IDs for each player. */
  socketIds: Record<string, string>;
  /** Timer handles. */
  timers: {
    spin: NodeJS.Timeout | null;
    call: NodeJS.Timeout | null;
  };
  settings: MatchSettings;
}

/** matchId → active match. */
const matches = new Map<string, ActiveMatch>();

// --- Rematch (Rule 4's third discovery path) --------------------------------

/** How long a finished match's rematch offer stays open before it expires. */
const REMATCH_WINDOW_MS = 2 * 60 * 1000;

interface PendingRematch {
  playerIds: [string, string];
  settings: MatchSettings;
  /** userIds who have clicked Rematch so far — starts empty. */
  confirmed: Set<string>;
  /** Refreshed every time a player acts, so a stale tab doesn't strand the other. */
  socketIds: Record<string, string>;
  expiry: NodeJS.Timeout;
}

/** Keyed by the match that just finished — not the (not yet created) next one. */
const pendingRematches = new Map<string, PendingRematch>();

// --- Matchmaking queue ------------------------------------------------------

interface WaitingPlayer {
  userId: string;
  socketId: string;
  stake: number;
  roundCount: number;
  joinedAt: number;
}

/** stake (string) → waiting player. One player per stake level. */
const waitingQueue = new Map<string, WaitingPlayer>();

// --- Public match list (Random Play) -----------------------------------------

interface PublicMatch {
  matchId: string;
  hostUserId: string;
  hostSocketId: string;
  hostName: string;
  stake: number;
  rounds: number;
  betMode: 'fixed' | 'free';
  minBet: number | null;
  createdAt: number;
  /** Friends Play: tracked here for the host's socket id, but never listed. */
  private: boolean;
}

/** matchId → public match listing. */
const publicMatches = new Map<string, PublicMatch>();

// --- Room codes (Friends Play) -----------------------------------------------

const CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** roomCode → matchId */
const roomCodes = new Map<string, string>();

/** socketId → matchId (for disconnect handling). */
const socketToMatch = new Map<string, string>();

// --- Helpers ----------------------------------------------------------------

function getOtherPlayer(match: ActiveMatch, userId: string): string {
  return match.playerIds[0] === userId ? match.playerIds[1] : match.playerIds[0];
}

function broadcastToMatch(match: ActiveMatch, event: string, payload: unknown): void {
  for (const socketId of Object.values(match.socketIds)) {
    // Emit to the specific socket
    const io = getIoRef();
    if (io) {
      io.to(socketId).emit(event, payload);
    }
  }
}

// We need a reference to the io server — set during registerSocket.
let ioRef: Namespace | null = null;

function getIoRef(): Namespace | null {
  return ioRef;
}

/**
 * Error boundary for fire-and-forget async work.
 *
 * Socket handlers, timer callbacks and `void`-ed promises all run outside any
 * request/response cycle, so a rejection there is an UNHANDLED rejection — and
 * Node kills the process on those. One player's match hitting a missing row or
 * a momentary DB error would otherwise take the whole server down for everybody.
 *
 * Nothing here is recoverable in-band, so the contract is: log it, keep serving.
 */
function guard(label: string, work: Promise<unknown>, context?: Record<string, unknown>): void {
  void work.catch((err) => {
    log.error(`${label} failed`, { ...context, err });
  });
}

/** Same boundary for synchronous timer callbacks. */
function guardSync(label: string, work: () => void, context?: Record<string, unknown>): void {
  try {
    work();
  } catch (err) {
    log.error(`${label} failed`, { ...context, err });
  }
}

function clearTimeouts(match: ActiveMatch): void {
  if (match.timers.spin) {
    clearTimeout(match.timers.spin);
    match.timers.spin = null;
  }
  if (match.timers.call) {
    clearTimeout(match.timers.call);
    match.timers.call = null;
  }
}

// --- Timer management -------------------------------------------------------

function startSpinTimer(match: ActiveMatch, spinnerId: string): void {
  match.timers.spin = setTimeout(() => guardSync('spin timeout', () => {
    // Spinner timed out — auto-forfeit round to caller
    log.info('spin timeout', { matchId: match.matchId, spinnerId });
    const callerId = getOtherPlayer(match, spinnerId);

    const { state: newState, record } = resolveSpinTimeout(match.state, spinnerId, callerId);

    match.state = newState;
    match.roundRecords.push(record);

    broadcastToMatch(match, CF_EVENTS.ROUND_RESULT, {
      roundNumber: record.roundNumber,
      winnerId: callerId,
      cause: 'no_spin',
      result: record.result,
      call: null,
      scores: match.state.scores,
    });

    guard('round end', handleRoundEnd(match, callerId), { matchId: match.matchId });
  }, { matchId: match.matchId }), SPIN_TIMEOUT_MS);
}

function startCallTimer(match: ActiveMatch, callerId: string): void {
  match.timers.call = setTimeout(() => guardSync('call timeout', () => {
    // Caller timed out — auto-forfeit round to spinner
    log.info('call timeout', { matchId: match.matchId, callerId });
    const spinnerId = getOtherPlayer(match, callerId);
    const result = match.state.currentResult!;

    const { state: newState, record } = resolveCall(
      match.state,
      null, // no call
      result,
      spinnerId,
      callerId,
    );

    match.state = newState;
    match.roundRecords.push(record);

    broadcastToMatch(match, CF_EVENTS.ROUND_RESULT, {
      roundNumber: record.roundNumber,
      winnerId: spinnerId,
      cause: 'no_call',
      result,
      call: null,
      scores: match.state.scores,
    });

    guard('round end', handleRoundEnd(match, spinnerId), { matchId: match.matchId });
  }, { matchId: match.matchId }), CALL_TIMEOUT_MS);
}

// --- Round end / match end --------------------------------------------------

async function handleRoundEnd(match: ActiveMatch, roundWinnerId: string): Promise<void> {
  clearTimeouts(match);

  if (match.state.phase === 'match_over') {
    // A player clinched — settle the match
    await settleMatch(match, roundWinnerId);
    return;
  }

  // Write the round record to DB
  const latestRecord = match.roundRecords[match.roundRecords.length - 1];
  if (latestRecord) {
    await writeRoundRecord(match.matchId, latestRecord);
  }

  // Advance to next round
  const loserId = getOtherPlayer(match, roundWinnerId);
  match.state = advanceRound(match.state, roundWinnerId, loserId);

  // Generate coin result for the next round and commit
  const { result, seed, commitHash } = generateCoinResult();
  match.state.currentResult = result;
  match.state.currentSeed = seed;
  match.state.currentCommitHash = commitHash;

  // Update gameState in DB
  await prisma.match.update({
    where: { id: match.matchId },
    data: { gameState: match.state as unknown as never },
  });

  // Send commit hash to both clients
  broadcastToMatch(match, CF_EVENTS.COMMIT_HASH, {
    roundNumber: match.state.currentRound,
    commitHash,
  });

  // Start the spin timer
  const spinnerId = Object.entries(match.state.seats).find(
    ([, seat]) => seat === 'spinner',
  )?.[0];

  if (spinnerId) {
    match.state.phase = 'waiting_spin';
    match.state.spinStartedAt = Date.now();

    broadcastToMatch(match, CF_EVENTS.ROUND_START, {
      roundNumber: match.state.currentRound,
      totalRounds: match.state.totalRounds,
      spinnerId,
      callerId: getOtherPlayer(match, spinnerId),
      scores: match.state.scores,
      seats: match.state.seats,
    });

    startSpinTimer(match, spinnerId);
  }
}

async function settleMatch(
  match: ActiveMatch,
  winnerId: string,
  opts: { forfeited?: boolean } = {},
): Promise<void> {
  clearTimeouts(match);

  // Write the final round record
  const latestRecord = match.roundRecords[match.roundRecords.length - 1];
  if (latestRecord) {
    await writeRoundRecord(match.matchId, latestRecord);
  }

  // Settle via escrow (pooled mode, 1v1 winner-take-all)
  const result = await escrow.settleMatch(
    match.matchId,
    [winnerId],
    [1],
    {
      result: {
        winnerId,
        scores: match.state.scores,
        totalRounds: match.state.totalRounds,
        roundsPlayed: match.state.currentRound,
      },
    },
  );

  broadcastToMatch(match, CF_EVENTS.MATCH_RESULT, {
    matchId: match.matchId,
    winnerId,
    scores: match.state.scores,
    totalRounds: match.state.totalRounds,
    roundsPlayed: match.state.currentRound,
    pot: result.pot.toString(),
    feeCollected: result.feeCollected.toString(),
    payouts: result.payouts.map((p) => ({
      userId: p.userId,
      payout: p.payout.toString(),
    })),
  });

  /**
   * Rule 4's Rematch path: offered on every match, "however it started" —
   * except one that ended by forfeit, since the opponent is gone and there is
   * nobody left to confirm. Keyed by the match that just finished; consumed
   * (or left to expire) the moment both sides have confirmed — see
   * REMATCH_REQUEST below.
   */
  if (!opts.forfeited) {
    const expiry = setTimeout(() => {
      pendingRematches.delete(match.matchId);
    }, REMATCH_WINDOW_MS);
    pendingRematches.set(match.matchId, {
      playerIds: match.playerIds,
      settings: match.settings,
      confirmed: new Set(),
      socketIds: { ...match.socketIds },
      expiry,
    });
  }

  // Clean up
  for (const socketId of Object.values(match.socketIds)) {
    socketToMatch.delete(socketId);
  }
  matches.delete(match.matchId);

  log.info('match settled', {
    matchId: match.matchId,
    winnerId,
    roundsPlayed: match.state.currentRound,
    rematchOffered: !opts.forfeited,
  });
}

async function writeRoundRecord(
  matchId: string,
  record: CoinFlipRoundRecord,
): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO coin_flip_rounds ("matchId", "roundNumber", "commitHash", seed, result, call, cause, "spinnerId", "callerId")
      VALUES (${matchId}::uuid, ${record.roundNumber}, ${record.commitHash}, ${record.seed}, ${record.result}, ${record.call}, ${record.cause}, ${record.spinnerId}, ${record.callerId})
    `;
  } catch (err) {
    log.error('failed to write round record', { matchId, roundNumber: record.roundNumber, err });
  }
}

/**
 * Everything that happens once two players and their stakes are already
 * settled on a matchId: seat draw, Round 1's commit, and the first
 * ROUND_START. Shared by JOIN_MATCH (a fresh Random/Friends Play match) and
 * the Rematch path below — both start a match the exact same way once they
 * know who's playing and what they staked.
 */
async function beginMatch(
  matchId: string,
  playerIds: [string, string],
  settings: MatchSettings,
  socketIds: Record<string, string>,
): Promise<void> {
  const players = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, username: true },
  });
  const nameMap = new Map(players.map((p) => [p.id, p.username ?? 'Player']));

  const state = createInitialState(settings.rounds, playerIds);
  const seatDraw = generateSeatDraw(playerIds);

  const newActiveMatch: ActiveMatch = {
    matchId,
    playerIds,
    state,
    seatDraw,
    roundRecords: [],
    socketIds: { ...socketIds },
    timers: { spin: null, call: null },
    settings,
  };

  for (const sid of Object.values(newActiveMatch.socketIds)) {
    socketToMatch.set(sid, matchId);
  }
  matches.set(matchId, newActiveMatch);

  // Notify both players
  for (const sid of Object.values(newActiveMatch.socketIds)) {
    const io = getIoRef();
    if (io) io.to(sid).emit(CF_EVENTS.MATCH_STATE, {
      matchId,
      players: playerIds.map((id) => ({ id, displayName: nameMap.get(id) })),
      totalRounds: settings.rounds,
      stake: settings.stake,
    });
  }

  // Commit the seat draw
  broadcastToMatch(newActiveMatch, CF_EVENTS.COMMIT_HASH, {
    roundNumber: 0,
    commitHash: newActiveMatch.seatDraw.commitHash,
    type: 'seat_draw',
  });

  // Reveal the seat draw
  newActiveMatch.state = revealSeatDraw(
    newActiveMatch.state,
    newActiveMatch.seatDraw.seed,
    newActiveMatch.seatDraw.assignment,
    playerIds,
  );

  // Write the seat draw record
  const seatRecord: CoinFlipRoundRecord = {
    roundNumber: 0,
    commitHash: newActiveMatch.seatDraw.commitHash,
    seed: newActiveMatch.seatDraw.seed,
    result: null,
    call: null,
    cause: null,
    spinnerId: playerIds[newActiveMatch.seatDraw.assignment === 'ab' ? 0 : 1],
    callerId: playerIds[newActiveMatch.seatDraw.assignment === 'ab' ? 1 : 0],
  };
  newActiveMatch.roundRecords.push(seatRecord);
  await writeRoundRecord(matchId, seatRecord);

  // Generate coin result for Round 1
  const { result, seed, commitHash } = generateCoinResult();
  newActiveMatch.state.currentResult = result;
  newActiveMatch.state.currentSeed = seed;
  newActiveMatch.state.currentCommitHash = commitHash;

  // Update gameState in DB
  await prisma.match.update({
    where: { id: matchId },
    data: { gameState: newActiveMatch.state as unknown as never },
  });

  // Send commit hash
  broadcastToMatch(newActiveMatch, CF_EVENTS.COMMIT_HASH, {
    roundNumber: 1,
    commitHash,
  });

  // Start Round 1
  const spinnerId = Object.entries(newActiveMatch.state.seats).find(
    ([, seat]) => seat === 'spinner',
  )?.[0];
  const callerId = Object.entries(newActiveMatch.state.seats).find(
    ([, seat]) => seat === 'caller',
  )?.[0];

  if (spinnerId && callerId) {
    newActiveMatch.state.phase = 'waiting_spin';
    newActiveMatch.state.spinStartedAt = Date.now();

    broadcastToMatch(newActiveMatch, CF_EVENTS.ROUND_START, {
      roundNumber: 1,
      totalRounds: newActiveMatch.state.totalRounds,
      spinnerId,
      callerId,
      scores: newActiveMatch.state.scores,
      seats: newActiveMatch.state.seats,
    });

    startSpinTimer(newActiveMatch, spinnerId);
  }

  log.info('match started', { matchId, playerIds, stake: settings.stake });
}

// --- Socket event handlers --------------------------------------------------

export function registerCoinFlipSocket(namespace: Namespace, socket: Socket): void {
  const userId = socket.data.userId as string;

  // Every emit in this module goes through `broadcastToMatch`, which needs the
  // namespace to address a socket by id. Without this line `ioRef` stays null
  // and every server → client event is silently dropped.
  ioRef = namespace;

  // --- LIST_MATCHES: return public Random Play matches ---
  socket.on(CF_EVENTS.LIST_MATCHES, async (data: { gameType?: string }) => {
    const listed = [...publicMatches.values()]
      .filter((m) => !m.private)              // Friends Play is code-only
      .filter((m) => m.hostUserId !== userId) // don't show your own
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((m) => ({
        matchId: m.matchId,
        hostName: m.hostName,
        stake: String(m.stake),
        rounds: m.rounds,
        betMode: m.betMode,
        minBet: m.minBet != null ? String(m.minBet) : null,
      }));
    socket.emit(CF_EVENTS.MATCHES_LIST, { matches: listed });
  });

  // --- CREATE_MATCH: host publishes a new match ---
  socket.on(CF_EVENTS.CREATE_MATCH, async (data: {
    gameType?: string;
    discovery?: 'random' | 'friends';
    rounds?: number;
    betMode?: 'fixed' | 'free';
    stake?: number;
    minBet?: number;
  }) => {
    try {
      const roundCount = data.rounds ?? 3;
      const stakeAmount = data.stake ?? 0.1;
      const mode = data.betMode ?? 'fixed';
      const discovery = data.discovery ?? 'random';

      // Validate rounds
      if (![3, 5, 7, 9, 11, 13, 15].includes(roundCount)) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Invalid round count — must be odd, 3–15' });
        return;
      }
      if (stakeAmount <= 0) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Stake must be positive' });
        return;
      }

      // Create match in DB
      const matchId = await escrow.createMatch({
        gameType: 'coin-flip',
        mode: 'pooled',
        gameState: { totalRounds: roundCount, betMode: mode, minBet: data.minBet ?? null },
      });

      // Add host as participant
      await prisma.matchParticipant.create({
        data: { matchId, userId, lockedAmount: 0, stakeTotal: 0, status: 'active' },
      });

      // Get host display name
      const hostUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      const hostName = hostUser?.username ?? 'Player';

      if (discovery === 'random') {
        // List publicly
        publicMatches.set(matchId, {
          matchId,
          hostUserId: userId,
          hostSocketId: socket.id,
          hostName,
          stake: stakeAmount,
          rounds: roundCount,
          betMode: mode,
          minBet: data.minBet ?? null,
          createdAt: Date.now(),
          private: false,
        });

        socket.emit(CF_EVENTS.MATCH_CREATED, { matchId });
        log.info('random match created', { matchId, host: userId, stake: stakeAmount, rounds: roundCount });
      } else {
        // Friends Play — generate room code
        let code = generateRoomCode();
        while (roomCodes.has(code)) code = generateRoomCode();
        roomCodes.set(code, matchId);

        // Store as public match too (for the host tracking)
        publicMatches.set(matchId, {
          matchId,
          hostUserId: userId,
          hostSocketId: socket.id,
          hostName,
          stake: stakeAmount,
          rounds: roundCount,
          betMode: mode,
          minBet: data.minBet ?? null,
          createdAt: Date.now(),
          private: true,
        });

        socket.emit(CF_EVENTS.MATCH_CREATED, { matchId, roomCode: code });
        log.info('friends match created', { matchId, host: userId, code, stake: stakeAmount });
      }
    } catch (err) {
      log.error('create_match error', { userId, err });
      socket.emit(CF_EVENTS.ERROR, { message: 'Failed to create match' });
    }
  });

  // --- JOIN_MATCH: join an existing match (Random, Friends, or reconnect) ---
  socket.on(CF_EVENTS.JOIN_MATCH, async (data: { matchId?: string; roomCode?: string }) => {
    try {
      let matchId: string | undefined;
      let usedRoomCode: string | undefined;

      // --- Resolve the matchId from either source ---
      if (data.roomCode) {
        // Friends Play: look up room code. The code is only retired once the
        // join actually succeeds — retiring it here would make a rejected join
        // (full match, own match, bad stake) permanently unrecoverable.
        usedRoomCode = data.roomCode.toUpperCase();
        matchId = roomCodes.get(usedRoomCode);
        if (!matchId) {
          socket.emit(CF_EVENTS.ERROR, { message: 'Invalid room code' });
          return;
        }
      } else if (data.matchId) {
        matchId = data.matchId;
      }

      if (!matchId) {
        socket.emit(CF_EVENTS.ERROR, { message: 'No match specified' });
        return;
      }

      // --- Check if this is a reconnection to an active match ---
      const activeMatch = matches.get(matchId);
      if (activeMatch && activeMatch.playerIds.includes(userId)) {
        socketToMatch.set(socket.id, matchId);
        activeMatch.socketIds[userId] = socket.id;
        if (activeMatch.state.disconnectedPlayers.includes(userId)) {
          activeMatch.state.disconnectedPlayers =
            activeMatch.state.disconnectedPlayers.filter((id) => id !== userId);
          await escrow.cancelForfeit(matchId, userId);
          broadcastToMatch(activeMatch, CF_EVENTS.OPPONENT_RECONNECTED, { userId });
        }
        socket.emit(CF_EVENTS.MATCH_STATE, {
          state: activeMatch.state,
          roundRecords: activeMatch.roundRecords,
          message: 'Reconnected',
        });
        return;
      }

      // --- New join: look up the match from DB ---
      const dbMatch = await prisma.match.findUnique({
        where: { id: matchId },
        include: { participants: true },
      });
      if (!dbMatch || dbMatch.gameType !== 'coin-flip') {
        socket.emit(CF_EVENTS.ERROR, { message: 'Match not found' });
        return;
      }
      if (dbMatch.status !== 'open') {
        socket.emit(CF_EVENTS.ERROR, { message: 'Match already started or finished' });
        return;
      }

      // Check not already a participant
      const alreadyParticipant = dbMatch.participants.some((p) => p.userId === userId);
      if (alreadyParticipant) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Already in this match' });
        return;
      }

      // Check match isn't full (max 2 for 1v1)
      if (dbMatch.participants.length >= 2) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Match is full' });
        return;
      }

      // Get game settings from gameState
      const gs = (dbMatch.gameState ?? {}) as { totalRounds?: number; betMode?: string; minBet?: number };
      const roundCount = gs.totalRounds ?? 5;
      const stakeAmount = Number(dbMatch.participants[0]?.lockedAmount ?? 0) > 0
        ? Number(dbMatch.participants[0]?.stakeTotal ?? 0.1)
        : publicMatches.get(matchId)?.stake ?? 0.1;
      const betMode = gs.betMode ?? 'fixed';

      // Validate minimum bet (Free Bet mode)
      if (betMode === 'free' && gs.minBet && Number(gs.minBet) > 0) {
        // Joiner must meet the minimum — check their balance is at least minBet
        // (actual lock validation happens in lockBalance)
      }

      // Lock both stakes
      const stakeDecimal = new (await import('../../lib/money.js')).Decimal(stakeAmount);
      const hostParticipant = dbMatch.participants[0];
      if (hostParticipant) {
        // Host already has a participant row — lock their stake
        await escrow.lockBalance(hostParticipant.userId, stakeDecimal, matchId);
      }
      await escrow.lockBalance(userId, stakeDecimal, matchId);

      // Add joiner as participant (lockBalance does this via upsert)
      const playerIds = [dbMatch.participants[0]?.userId ?? userId, userId] as [string, string];
      // Ensure order: host first, joiner second
      if (dbMatch.participants[0] && dbMatch.participants[0].userId !== playerIds[0]) {
        playerIds.reverse();
      }

      // Grab the host's socket id BEFORE dropping the listing — this map is the
      // only place it lives, so reading it after the delete always yields
      // undefined and the host never gets wired into the match.
      const hostSocketId = publicMatches.get(matchId)?.hostSocketId;

      // Remove from public list, and retire the room code now that the match
      // has a second player.
      publicMatches.delete(matchId);
      if (usedRoomCode) roomCodes.delete(usedRoomCode);

      // Remove joiner from any waiting queue
      for (const [key, waiting] of waitingQueue) {
        if (waiting.userId === userId) waitingQueue.delete(key);
      }

      // Register sockets
      const socketIds: Record<string, string> = {};
      if (hostSocketId) socketIds[playerIds[0]] = hostSocketId;
      socketIds[userId] = socket.id;

      await beginMatch(
        matchId,
        playerIds,
        { rounds: roundCount, betMode, minBet: gs.minBet ?? null, stake: stakeAmount },
        socketIds,
      );

      log.info('match joined', { matchId, playerIds, stake: stakeAmount });
    } catch (err) {
      log.error('join_match error', { userId, err });
      socket.emit(CF_EVENTS.ERROR, { message: 'Failed to join match' });
    }
  });

  // --- REMATCH_REQUEST: Rule 4's third discovery path — same two players,
  // settings carried over unchanged, both must confirm, new match id ---
  socket.on(CF_EVENTS.REMATCH_REQUEST, async (data: { matchId?: string }) => {
    try {
      const matchId = data.matchId;
      if (!matchId) {
        socket.emit(CF_EVENTS.ERROR, { message: 'No match specified' });
        return;
      }

      const pending = pendingRematches.get(matchId);
      if (!pending || !pending.playerIds.includes(userId)) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Rematch is no longer available.' });
        return;
      }

      // Refresh this player's socket (they may be reconnected, or on a
      // different tab, since the result screen), then record their confirm.
      pending.socketIds[userId] = socket.id;
      pending.confirmed.add(userId);

      const otherId = pending.playerIds.find((id) => id !== userId)!;

      if (pending.confirmed.size < 2) {
        socket.emit(CF_EVENTS.REMATCH_WAITING, { matchId });
        const otherSocketId = pending.socketIds[otherId];
        if (otherSocketId) {
          getIoRef()?.to(otherSocketId).emit(CF_EVENTS.REMATCH_OFFERED, { matchId });
        }
        return;
      }

      // Both confirmed — start it. Consume the offer immediately so a
      // duplicate request (double click, a slow retry) can't start it twice.
      clearTimeout(pending.expiry);
      pendingRematches.delete(matchId);

      const newMatchId = await escrow.createMatch({
        gameType: 'coin-flip',
        mode: 'pooled',
        gameState: {
          totalRounds: pending.settings.rounds,
          betMode: pending.settings.betMode,
          minBet: pending.settings.minBet,
        },
      });

      try {
        const stakeDecimal = new (await import('../../lib/money.js')).Decimal(pending.settings.stake);
        for (const uid of pending.playerIds) {
          await escrow.lockBalance(uid, stakeDecimal, newMatchId);
        }
      } catch (lockErr) {
        // One side can no longer cover the stake (they just lost it, most
        // likely). Unwind whatever DID lock rather than leave it stranded —
        // refundMatch is a no-op for a participant that never locked.
        log.error('rematch stake lock failed', { previousMatchId: matchId, newMatchId, err: lockErr });
        await escrow.refundMatch(newMatchId, 'Rematch could not be started').catch(() => {});
        for (const uid of pending.playerIds) {
          const sid = pending.socketIds[uid];
          if (sid) {
            getIoRef()?.to(sid).emit(CF_EVENTS.ERROR, {
              message: 'Rematch failed — one of you no longer has enough balance for this stake.',
            });
          }
        }
        return;
      }

      await beginMatch(newMatchId, pending.playerIds, pending.settings, pending.socketIds);

      log.info('rematch started', { previousMatchId: matchId, newMatchId, playerIds: pending.playerIds });
    } catch (err) {
      log.error('rematch error', { userId, err });
      socket.emit(CF_EVENTS.ERROR, { message: 'Failed to start rematch' });
    }
  });

  socket.on(CF_EVENTS.SPIN, async () => {
    try {
      const matchId = socketToMatch.get(socket.id);
      if (!matchId) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Not in a match' });
        return;
      }

      const match = matches.get(matchId);
      if (!match) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Match not active' });
        return;
      }

      if (match.state.phase !== 'waiting_spin') {
        socket.emit(CF_EVENTS.ERROR, { message: 'Not the spin phase' });
        return;
      }

      // Verify this player is the spinner
      if (match.state.seats[userId] !== 'spinner') {
        socket.emit(CF_EVENTS.ERROR, { message: 'You are not the spinner' });
        return;
      }

      // Clear the spin timer
      if (match.timers.spin) {
        clearTimeout(match.timers.spin);
        match.timers.spin = null;
      }

      match.state = startSpin(match.state);

      // Broadcast spin started
      broadcastToMatch(match, CF_EVENTS.SPIN_STARTED, {
        roundNumber: match.state.currentRound,
        spinnerId: userId,
      });

      // Start the call timer
      const callerId = getOtherPlayer(match, userId);
      startCallTimer(match, callerId);
    } catch (err) {
      log.error('spin error', { userId, err });
      socket.emit(CF_EVENTS.ERROR, { message: 'Failed to spin' });
    }
  });

  socket.on(CF_EVENTS.CALL, async (data: { call: CoinSide }) => {
    try {
      const matchId = socketToMatch.get(socket.id);
      if (!matchId) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Not in a match' });
        return;
      }

      const match = matches.get(matchId);
      if (!match) {
        socket.emit(CF_EVENTS.ERROR, { message: 'Match not active' });
        return;
      }

      if (match.state.phase !== 'waiting_call') {
        socket.emit(CF_EVENTS.ERROR, { message: 'Not the call phase' });
        return;
      }

      // Verify this player is the caller
      if (match.state.seats[userId] !== 'caller') {
        socket.emit(CF_EVENTS.ERROR, { message: 'You are not the caller' });
        return;
      }

      // Validate the call
      if (data.call !== 'heads' && data.call !== 'tails') {
        socket.emit(CF_EVENTS.ERROR, { message: 'Invalid call — must be heads or tails' });
        return;
      }

      // Clear the call timer
      if (match.timers.call) {
        clearTimeout(match.timers.call);
        match.timers.call = null;
      }

      const call = data.call;
      const result = match.state.currentResult!;
      const spinnerId = getOtherPlayer(match, userId);

      // Resolve the round
      const { state: newState, record } = resolveCall(
        match.state,
        call,
        result,
        spinnerId,
        userId,
      );

      match.state = newState;
      match.roundRecords.push(record);

      // Broadcast the call and reveal
      broadcastToMatch(match, CF_EVENTS.CALL_MADE, {
        roundNumber: record.roundNumber,
        callerId: userId,
        call,
      });

      // Small delay before reveal for visual effect
      setTimeout(() => guardSync('reveal', () => {
        broadcastToMatch(match, CF_EVENTS.REVEAL, {
          roundNumber: record.roundNumber,
          result,
          seed: match.state.currentSeed,
          commitHash: match.state.currentCommitHash,
        });

        broadcastToMatch(match, CF_EVENTS.ROUND_RESULT, {
          roundNumber: record.roundNumber,
          winnerId: record.cause === 'correct_call' ? userId : spinnerId,
          cause: record.cause,
          result,
          call,
          scores: match.state.scores,
        });

        guard(
          'round end',
          handleRoundEnd(match, record.cause === 'correct_call' ? userId : spinnerId),
          { matchId: match.matchId },
        );
      }, { matchId: match.matchId }), 2000); // 2 second reveal animation
    } catch (err) {
      log.error('call error', { userId, err });
      socket.emit(CF_EVENTS.ERROR, { message: 'Failed to call' });
    }
  });

  socket.on('disconnect', async () => {
    // Nobody awaits a socket 'disconnect' handler, so anything thrown in here is
    // an unhandled rejection — and that kills the process. The player is already
    // gone; there is nothing to tell them and no reason to take the server down
    // with them.
    try {
      // Clean up waiting queue
      for (const [key, waiting] of waitingQueue) {
        if (waiting.userId === userId || waiting.socketId === socket.id) {
          waitingQueue.delete(key);
        }
      }

      // Clean up public match listings owned by this user
      for (const [matchId, listing] of publicMatches) {
        if (listing.hostUserId === userId || listing.hostSocketId === socket.id) {
          publicMatches.delete(matchId);
          // Also clean up room code if any
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

      broadcastToMatch(match, CF_EVENTS.OPPONENT_DISCONNECTED, { userId });

      // Start the forfeit grace period via escrow
      const forfeitResult = await escrow.forfeitPlayer(matchId, userId);

      if (forfeitResult.outcome === 'forfeited') {
        // Player was forfeited — settle with the remaining player. No
        // rematch is offered: the opponent is gone, so there is nobody left
        // to confirm one (Rule 4's Rematch path).
        const winnerId = getOtherPlayer(match, userId);
        await settleMatch(match, winnerId, { forfeited: true });
      } else if (forfeitResult.outcome === 'reconnected') {
        // They reconnected — cancel forfeit (handled in JOIN_MATCH)
      }
    } catch (err) {
      log.error('disconnect cleanup failed', { userId, socketId: socket.id, err });
    }
  });
}
