/**
 * Trumpcard socket handlers — realtime game flow.
 *
 * Manages the full lifecycle of a Trumpcard match via socket.io:
 *   create -> join (lobby fill) -> leader picks a stat -> reveal -> (next
 *   leader | match_end)
 *
 * Timers run server-side and broadcast state to all clients.
 * The game never imports User, LedgerEntry, Match, or treasury — all money
 * behaviour comes from the escrow adapter.
 *
 * References:
 *   - Gambling_Docs/Games/G04-Trumpcard.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1-4, with the Ludo/Trumpcard
 *     Rule 2 exception)
 */

import type { Namespace, Socket } from 'socket.io';
import { escrow } from '../../escrow/index.js';
import { prisma } from '../../config/db.js';
import { createLogger } from '../../lib/logger.js';
import { Decimal } from '../../lib/money.js';
import {
  CARD_LIMITS,
  ROUND_REVEAL_DELAY_MS,
  STAT_CHOICE_TIMEOUT_MS,
  calculatePayoutWeights,
  checkMatchEnd,
  createInitialState,
  decrementLife,
  getCardById,
  getNextLeader,
  markDisconnected,
  markReconnected,
  rankFinalStandings,
  resolveRound,
} from './engine.js';
import type { LifeLossCause } from './engine.js';
import type { StatKey, TrumpcardState } from './types.js';
import { STAT_KEYS, TRUMPCARD_EVENTS } from './types.js';

const log = createLogger('game:trumpcard');

const VALID_DURATIONS = [5, 10, 15, 20];

// --- In-memory match state ---------------------------------------------------

interface ActiveMatch {
  matchId: string;
  playerIds: string[];
  seatCount: number;
  cardsPerPlayer: number;
  durationMinutes: number;
  state: TrumpcardState;
  /** Socket IDs for each player. */
  socketIds: Record<string, string>;
  timers: {
    leaderChoice: NodeJS.Timeout | null;
    reveal: NodeJS.Timeout | null;
    /** userId -> pending reconnect-grace timer for a disconnected player. */
    disconnect: Record<string, NodeJS.Timeout>;
  };
}

/** matchId -> active match. */
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

/** roomCode -> matchId */
const roomCodes = new Map<string, string>();

interface LobbyInfo {
  matchId: string;
  hostUserId: string;
  hostSocketId: string;
  hostName: string;
  seatCount: number;
  cardsPerPlayer: number;
  durationMinutes: number;
  stake: number;
  betMode: 'fixed' | 'free';
  minBet: number | null;
  discovery: 'random' | 'friends';
  createdAt: number;
  /** userId -> the stake THEY locked in for. Fixed mode: everyone maps to
   * `stake` above. Free mode: each joiner picks their own (>= minBet). */
  stakes: Map<string, number>;
}

/** matchId -> lobby info (for Random Play listings and Friends Play host tracking). */
const lobbyInfo = new Map<string, LobbyInfo>();

/** socketId -> matchId (for disconnect handling). */
const socketToMatch = new Map<string, string>();

// A published listing survives a brief host refresh/reconnect rather than
// vanishing on the first disconnect event — same rationale as
// mine-catcher/socket.ts and coin-flip/socket.ts: 2 minutes is comfortably
// longer than socket.io's own worst-case disconnect-detection latency.
const LISTING_GRACE_MS = 2 * 60 * 1000;
const listingGraceTimers = new Map<string, NodeJS.Timeout>();

// --- Helpers ----------------------------------------------------------------

let ioRef: Namespace | null = null;

function getIoRef(): Namespace | null {
  return ioRef;
}

function broadcastToMatch(match: ActiveMatch, event: string, payload: unknown): void {
  const io = getIoRef();
  if (!io) return;
  for (const socketId of Object.values(match.socketIds)) {
    if (socketId) io.to(socketId).emit(event, payload);
  }
}

/**
 * Per-player snapshot: only the recipient's own top card is included, plus
 * everyone's hand counts and lives. Full hands are never sent to a client —
 * the physical "you only see your top card" Top Trumps rule, and it keeps
 * payloads small.
 */
function buildStateSnapshot(match: ActiveMatch, forUserId: string) {
  const state = match.state;
  const myTopCardId = state.hands[forUserId]?.[0];
  return {
    seatCount: state.seatCount,
    cardsPerPlayer: state.cardsPerPlayer,
    activePlayerIds: state.activePlayerIds,
    handCounts: Object.fromEntries(state.playerIds.map((id) => [id, state.hands[id]?.length ?? 0])),
    lives: state.lives,
    poolSize: state.pool.length,
    currentLeaderId: state.currentLeaderId,
    leaderChoiceStartedAt: state.leaderChoiceStartedAt,
    phase: state.phase,
    roundNumber: state.roundNumber,
    matchDeadline: state.matchDeadline,
    myTopCard: myTopCardId ? getCardById(myTopCardId) : null,
  };
}

function broadcastSnapshots(match: ActiveMatch, extra?: Record<string, unknown>): void {
  const io = getIoRef();
  if (!io) return;
  for (const pid of match.playerIds) {
    const sid = match.socketIds[pid];
    if (!sid) continue;
    io.to(sid).emit(TRUMPCARD_EVENTS.MATCH_STATE, { ...buildStateSnapshot(match, pid), ...extra });
  }
}

function listPublicMatches() {
  return [...lobbyInfo.values()]
    .filter((m) => m.discovery === 'random')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((m) => ({
      matchId: m.matchId,
      hostName: m.hostName,
      seatCount: m.seatCount,
      cardsPerPlayer: m.cardsPerPlayer,
      durationMinutes: m.durationMinutes,
      stake: String(m.stake),
      betMode: m.betMode,
      minBet: m.minBet != null ? String(m.minBet) : null,
    }));
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
  if (match.timers.leaderChoice) {
    clearTimeout(match.timers.leaderChoice);
    match.timers.leaderChoice = null;
  }
  if (match.timers.reveal) {
    clearTimeout(match.timers.reveal);
    match.timers.reveal = null;
  }
}

// --- Turn management --------------------------------------------------------

function startLeaderTimer(match: ActiveMatch, leaderId: string): void {
  match.timers.leaderChoice = setTimeout(() => guardSync('leader choice timeout', () => {
    applyLifeLoss(match, leaderId, 'stat_choice_skip');
  }, { matchId: match.matchId, leaderId }), STAT_CHOICE_TIMEOUT_MS);
}

/**
 * Shared path for both ways a life can be lost: a stat-choice skip (always
 * ends that leader's turn) or a failed disconnect-reconnect (only ends a
 * turn if it happens to eliminate the *current* leader — otherwise the
 * active leader-choice timer for whoever the real current leader is stays
 * untouched and keeps running).
 *
 * `escrow.forfeitPlayer` is only called here, at the exact moment lives hit
 * 0 — never on a raw disconnect (see the disconnect handler below for why).
 */
function applyLifeLoss(match: ActiveMatch, userId: string, cause: LifeLossCause): void {
  const wasLeader = match.state.currentLeaderId === userId;

  const { state: afterLife, lifeLost, eliminated } = decrementLife(match.state, userId, cause);
  match.state = afterLife;

  if (lifeLost) {
    broadcastToMatch(match, TRUMPCARD_EVENTS.LIVES_UPDATE, {
      userId,
      lives: match.state.lives[userId] ?? 0,
      cause,
    });
  }

  if (eliminated) {
    broadcastToMatch(match, TRUMPCARD_EVENTS.PLAYER_ELIMINATED, { userId, cause: 'lives' });
    guard(
      'forfeit on lives elimination',
      escrow.forfeitPlayer(match.matchId, userId, 0),
      { matchId: match.matchId, userId },
    );
  }

  const endTrigger = checkMatchEnd(match.state);
  if (endTrigger) {
    clearTimeouts(match);
    guard('settle match', settleMatch(match), { matchId: match.matchId, endTrigger });
    return;
  }

  const mustAdvanceTurn = wasLeader && (cause === 'stat_choice_skip' || eliminated);
  if (!mustAdvanceTurn) {
    if (lifeLost) broadcastSnapshots(match);
    return;
  }

  if (match.timers.leaderChoice) {
    clearTimeout(match.timers.leaderChoice);
    match.timers.leaderChoice = null;
  }

  if (!eliminated) {
    // Skip without elimination — leadership still passes on since the
    // leader failed to act. (When eliminated, decrementLife already
    // reassigned currentLeaderId, since the eliminated player was the leader.)
    match.state = { ...match.state, currentLeaderId: getNextLeader(match.state, userId) };
  }

  match.state = { ...match.state, leaderChoiceStartedAt: Date.now() };
  broadcastSnapshots(match);
  broadcastToMatch(match, TRUMPCARD_EVENTS.LEADER_TURN_START, {
    leaderId: match.state.currentLeaderId,
    roundNumber: match.state.roundNumber,
    startedAt: match.state.leaderChoiceStartedAt,
  });
  startLeaderTimer(match, match.state.currentLeaderId);
}

// --- Match end / settlement -------------------------------------------------

async function settleMatch(match: ActiveMatch): Promise<void> {
  clearTimeouts(match);
  for (const timer of Object.values(match.timers.disconnect)) clearTimeout(timer);

  const rankings = rankFinalStandings(match.state);
  const payoutWeights = calculatePayoutWeights(rankings, match.seatCount);

  const winnerIds = payoutWeights.map((p) => p.userId);
  const weights = payoutWeights.map((p) => p.weight);

  const resultRankings = rankings.map((r) => ({
    playerId: r.playerId,
    rank: r.rank,
    cardCount: r.cardCount,
    eliminatedAt: r.eliminatedAt,
  }));

  const result = await escrow.settleMatch(
    match.matchId,
    winnerIds.length > 0 ? winnerIds : [match.playerIds[0]!],
    weights.length > 0 ? weights : [1],
    { result: { rankings: resultRankings, seatCount: match.seatCount } },
  );

  broadcastToMatch(match, TRUMPCARD_EVENTS.MATCH_RESULT, {
    rankings: resultRankings,
    seatCount: match.seatCount,
    pot: result.pot.toString(),
    feeCollected: result.feeCollected.toString(),
    payouts: result.payouts.map((p) => ({ userId: p.userId, payout: p.payout.toString() })),
  });

  for (const socketId of Object.values(match.socketIds)) {
    if (socketId) socketToMatch.delete(socketId);
  }
  matches.delete(match.matchId);
  lobbyInfo.delete(match.matchId);

  log.info('match settled', { matchId: match.matchId, seatCount: match.seatCount });
}

// --- Socket event handlers --------------------------------------------------

export function registerTrumpcardSocket(namespace: Namespace, socket: Socket): void {
  const userId = socket.data.userId as string;

  ioRef = namespace;

  // Refresh host socket id for any listings owned by this user (a browser
  // refresh while a lobby waits shouldn't be treated as the host vanishing).
  for (const listing of lobbyInfo.values()) {
    if (listing.hostUserId === userId) {
      listing.hostSocketId = socket.id;
      const graceTimer = listingGraceTimers.get(listing.matchId);
      if (graceTimer) {
        clearTimeout(graceTimer);
        listingGraceTimers.delete(listing.matchId);
      }
    }
  }

  // --- LIST_MATCHES: return public Random Play matches ---
  socket.on(TRUMPCARD_EVENTS.LIST_MATCHES, () => {
    socket.emit(TRUMPCARD_EVENTS.MATCHES_LIST, { matches: listPublicMatches() });
  });

  // --- CREATE_MATCH: host creates a new lobby ---
  socket.on(TRUMPCARD_EVENTS.CREATE_MATCH, async (data: {
    discovery?: 'random' | 'friends';
    seatCount?: number;
    cardsPerPlayer?: number;
    durationMinutes?: number;
    betMode?: 'fixed' | 'free';
    stake?: number;
    minBet?: number;
  }) => {
    try {
      const seatCount = data.seatCount ?? 2;
      if (seatCount < 2 || seatCount > 4) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Seat count must be 2, 3, or 4' });
        return;
      }

      const maxCards = CARD_LIMITS[seatCount as 2 | 3 | 4];
      const cardsPerPlayer = data.cardsPerPlayer ?? maxCards;
      const durationMinutes = data.durationMinutes ?? 10;
      const stakeAmount = data.stake ?? 0.1;
      const mode = data.betMode ?? 'fixed';
      const discovery = data.discovery ?? 'random';
      const minBetValue = data.minBet ?? null;

      if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 1 || cardsPerPlayer > maxCards) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, {
          message: `Cards per player must be between 1 and ${maxCards} for ${seatCount} players`,
        });
        return;
      }
      if (!VALID_DURATIONS.includes(durationMinutes)) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Invalid match duration' });
        return;
      }
      if (stakeAmount <= 0) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Stake must be positive' });
        return;
      }

      const matchId = await escrow.createMatch({
        gameType: 'trumpcard',
        mode: 'pooled',
        gameState: { seatCount, cardsPerPlayer, durationMinutes, betMode: mode, stake: stakeAmount, minBet: minBetValue },
      });

      // Add host as participant (not locked yet — reserved per Rule 4).
      await prisma.matchParticipant.create({
        data: { matchId, userId, lockedAmount: 0, stakeTotal: 0, status: 'active' },
      });

      const hostUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      const hostName = hostUser?.username ?? 'Player';

      if (discovery === 'random') {
        lobbyInfo.set(matchId, {
          matchId, hostUserId: userId, hostSocketId: socket.id, hostName,
          seatCount, cardsPerPlayer, durationMinutes, stake: stakeAmount,
          betMode: mode, minBet: minBetValue, discovery: 'random', createdAt: Date.now(),
          stakes: new Map([[userId, stakeAmount]]),
        });

        socket.emit(TRUMPCARD_EVENTS.MATCH_CREATED, { matchId });
        log.info('random match created', { matchId, host: userId, stake: stakeAmount, seatCount });

        namespace.emit(TRUMPCARD_EVENTS.MATCHES_LIST, { matches: listPublicMatches() });
      } else {
        let code = generateRoomCode();
        while (roomCodes.has(code)) code = generateRoomCode();
        roomCodes.set(code, matchId);

        lobbyInfo.set(matchId, {
          matchId, hostUserId: userId, hostSocketId: socket.id, hostName,
          seatCount, cardsPerPlayer, durationMinutes, stake: stakeAmount,
          betMode: mode, minBet: minBetValue, discovery: 'friends', createdAt: Date.now(),
          stakes: new Map([[userId, stakeAmount]]),
        });

        socket.emit(TRUMPCARD_EVENTS.MATCH_CREATED, { matchId, roomCode: code });
        log.info('friends match created', { matchId, host: userId, code, stake: stakeAmount });
      }
    } catch (err) {
      log.error('create_match error', { userId, err });
      socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Failed to create match' });
    }
  });

  // --- JOIN_MATCH: join an existing lobby (or reconnect to an active one) ---
  socket.on(TRUMPCARD_EVENTS.JOIN_MATCH, async (data: { matchId?: string; roomCode?: string; stake?: number }) => {
    try {
      let matchId: string | undefined;
      let usedRoomCode: string | undefined;

      if (data.roomCode) {
        usedRoomCode = data.roomCode.toUpperCase();
        matchId = roomCodes.get(usedRoomCode);
        if (!matchId) {
          socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Invalid room code' });
          return;
        }
      } else if (data.matchId) {
        matchId = data.matchId;
      }

      if (!matchId) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'No match specified' });
        return;
      }

      // Reconnection to an active match
      const activeMatch = matches.get(matchId);
      if (activeMatch && activeMatch.playerIds.includes(userId)) {
        if (!activeMatch.state.activePlayerIds.includes(userId)) {
          socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'You have been eliminated from this match' });
          return;
        }

        socketToMatch.set(socket.id, matchId);
        activeMatch.socketIds[userId] = socket.id;

        if (activeMatch.state.disconnectedPlayers.includes(userId)) {
          const timer = activeMatch.timers.disconnect[userId];
          if (timer) {
            clearTimeout(timer);
            delete activeMatch.timers.disconnect[userId];
          }
          activeMatch.state = markReconnected(activeMatch.state, userId);
          broadcastToMatch(activeMatch, TRUMPCARD_EVENTS.OPPONENT_RECONNECTED, { userId });
        }

        socket.emit(TRUMPCARD_EVENTS.MATCH_STATE, {
          ...buildStateSnapshot(activeMatch, userId),
          message: 'Reconnected',
        });
        return;
      }

      // New join: look up the match from DB
      const dbMatch = await prisma.match.findUnique({
        where: { id: matchId },
        include: { participants: true },
      });
      if (!dbMatch || dbMatch.gameType !== 'trumpcard') {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Match not found' });
        return;
      }
      if (dbMatch.status !== 'open') {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Match already started or finished' });
        return;
      }
      if (dbMatch.participants.some((p) => p.userId === userId)) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Already in this match' });
        return;
      }

      const gs = (dbMatch.gameState ?? {}) as {
        seatCount?: number;
        cardsPerPlayer?: number;
        durationMinutes?: number;
        betMode?: string;
        stake?: number;
        minBet?: number;
      };
      const seatCount = gs.seatCount ?? 2;
      const cardsPerPlayer = gs.cardsPerPlayer ?? CARD_LIMITS[seatCount as 2 | 3 | 4] ?? 26;
      const durationMinutes = gs.durationMinutes ?? 10;
      const stakeAmount = gs.stake ?? lobbyInfo.get(matchId)?.stake ?? 0.1;
      const betMode = gs.betMode ?? lobbyInfo.get(matchId)?.betMode ?? 'fixed';
      const minBet = gs.minBet ?? lobbyInfo.get(matchId)?.minBet ?? null;

      if (dbMatch.participants.length >= seatCount) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Match is full' });
        return;
      }

      // Free Bet: the joiner picks their own stake before anything is
      // locked or the participant row created — bouncing back here is
      // side-effect-free and safe for the client to repeat with a chosen
      // amount.
      let joinerStake = stakeAmount;
      if (betMode === 'free') {
        const submitted = data.stake;
        if (submitted == null) {
          socket.emit(TRUMPCARD_EVENTS.STAKE_REQUIRED, {
            matchId,
            hostName: lobbyInfo.get(matchId)?.hostName ?? 'Player',
            seatCount,
            minBet: minBet != null ? String(minBet) : null,
          });
          return;
        }
        const chosen = Number(submitted);
        if (!Number.isFinite(chosen) || chosen <= 0) {
          socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Stake must be a positive amount' });
          return;
        }
        if (minBet != null && chosen < minBet) {
          socket.emit(TRUMPCARD_EVENTS.ERROR, { message: `Stake must be at least ${minBet} SOL` });
          return;
        }
        joinerStake = chosen;
      }

      await prisma.matchParticipant.create({
        data: { matchId, userId, lockedAmount: 0, stakeTotal: 0, status: 'active' },
      });

      const lobbyForJoin = lobbyInfo.get(matchId);
      lobbyForJoin?.stakes.set(userId, joinerStake);

      const allParticipantIds = dbMatch.participants.map((p) => p.userId);
      allParticipantIds.push(userId);

      const isLobbyFull = allParticipantIds.length >= seatCount;

      if (!isLobbyFull) {
        const lobby = lobbyInfo.get(matchId);
        if (lobby) {
          const io = getIoRef();
          io?.to(lobby.hostSocketId).emit(TRUMPCARD_EVENTS.MATCH_STATE, {
            matchId,
            phase: 'waiting_for_players',
            currentPlayers: allParticipantIds.length,
            seatCount,
            message: `Player joined (${allParticipantIds.length}/${seatCount})`,
          });
        }

        socket.emit(TRUMPCARD_EVENTS.MATCH_CREATED, {
          matchId,
          phase: 'waiting_for_players',
          currentPlayers: allParticipantIds.length,
          seatCount,
        });

        log.info('player joined lobby', { matchId, userId, players: allParticipantIds.length, seatCount });
        return;
      }

      // --- Lobby is full — start the match! ---

      // Lock each participant's own stake (Fixed mode: all the same; Free
      // mode: whatever each of them individually chose when joining).
      const stakesAtFill = lobbyInfo.get(matchId)?.stakes;
      for (const pid of allParticipantIds) {
        const amount = stakesAtFill?.get(pid) ?? stakeAmount;
        await escrow.lockBalance(pid, new Decimal(amount), matchId);
      }

      const playerIds = allParticipantIds as string[];
      const state = createInitialState(seatCount, cardsPerPlayer, playerIds, durationMinutes * 60_000);

      const newActiveMatch: ActiveMatch = {
        matchId, playerIds, seatCount, cardsPerPlayer, durationMinutes, state,
        socketIds: {},
        timers: { leaderChoice: null, reveal: null, disconnect: {} },
      };

      const lobby = lobbyInfo.get(matchId);
      if (lobby) {
        newActiveMatch.socketIds[lobby.hostUserId] = lobby.hostSocketId;
        socketToMatch.set(lobby.hostSocketId, matchId);
      }
      newActiveMatch.socketIds[userId] = socket.id;
      socketToMatch.set(socket.id, matchId);

      matches.set(matchId, newActiveMatch);

      const players = await prisma.user.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, username: true },
      });
      const nameMap = new Map(players.map((p) => [p.id, p.username ?? 'Player']));

      broadcastSnapshots(newActiveMatch, {
        matchId,
        players: playerIds.map((id) => ({ id, displayName: nameMap.get(id) })),
        seatCount, cardsPerPlayer, durationMinutes, stake: stakeAmount,
      });

      broadcastToMatch(newActiveMatch, TRUMPCARD_EVENTS.LEADER_TURN_START, {
        leaderId: state.currentLeaderId,
        roundNumber: state.roundNumber,
        startedAt: state.leaderChoiceStartedAt,
      });

      startLeaderTimer(newActiveMatch, state.currentLeaderId);

      lobbyInfo.delete(matchId);
      if (usedRoomCode) roomCodes.delete(usedRoomCode);
      const graceTimer = listingGraceTimers.get(matchId);
      if (graceTimer) {
        clearTimeout(graceTimer);
        listingGraceTimers.delete(matchId);
      }

      log.info('match started', { matchId, playerIds, seatCount, cardsPerPlayer, durationMinutes, stake: stakeAmount });
    } catch (err) {
      log.error('join_match error', { userId, err });
      socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Failed to join match' });
    }
  });

  // --- CHOOSE_STAT: current leader picks a stat to compare on ---
  socket.on(TRUMPCARD_EVENTS.CHOOSE_STAT, (data: { statKey?: string }) => {
    try {
      const matchId = socketToMatch.get(socket.id);
      if (!matchId) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Not in a match' });
        return;
      }
      const match = matches.get(matchId);
      if (!match) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Match not active' });
        return;
      }
      if (match.state.phase !== 'leader_choosing') {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Not the stat-choice phase' });
        return;
      }
      if (match.state.currentLeaderId !== userId) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Not your turn' });
        return;
      }

      const statKey = data.statKey;
      if (!statKey || !(STAT_KEYS as readonly string[]).includes(statKey)) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Invalid stat' });
        return;
      }

      if (match.timers.leaderChoice) {
        clearTimeout(match.timers.leaderChoice);
        match.timers.leaderChoice = null;
      }

      const resolvedRoundNumber = match.state.roundNumber;
      const { state: newState, comparison, winnerId, tiedIds, poolClaimedBy, newlyEliminated } =
        resolveRound(match.state, statKey as StatKey);
      match.state = { ...newState, phase: 'reveal' };

      broadcastToMatch(match, TRUMPCARD_EVENTS.ROUND_REVEAL, {
        statKey,
        roundNumber: resolvedRoundNumber,
        comparison: comparison.map((c) => ({
          userId: c.userId,
          card: getCardById(c.cardId),
          value: c.value,
        })),
        winnerId,
        tiedIds,
        poolClaimedBy,
      });

      for (const eliminatedId of newlyEliminated) {
        broadcastToMatch(match, TRUMPCARD_EVENTS.PLAYER_ELIMINATED, { userId: eliminatedId, cause: 'cards' });
      }

      match.timers.reveal = setTimeout(() => guardSync('after round reveal', () => {
        match.timers.reveal = null;

        // Re-checked here (not just right after resolveRound) so the match's
        // overall duration timer firing mid-reveal is still caught.
        const endTrigger = checkMatchEnd(match.state);
        if (endTrigger) {
          guard('settle match', settleMatch(match), { matchId: match.matchId, endTrigger });
          return;
        }

        match.state.phase = 'leader_choosing';
        match.state.leaderChoiceStartedAt = Date.now();
        broadcastSnapshots(match);
        broadcastToMatch(match, TRUMPCARD_EVENTS.LEADER_TURN_START, {
          leaderId: match.state.currentLeaderId,
          roundNumber: match.state.roundNumber,
          startedAt: match.state.leaderChoiceStartedAt,
        });
        startLeaderTimer(match, match.state.currentLeaderId);
      }, { matchId }), ROUND_REVEAL_DELAY_MS);
    } catch (err) {
      log.error('choose_stat error', { userId, err });
      socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Failed to choose stat' });
    }
  });

  // --- LEAVE_LOBBY: player leaves before match starts ---
  socket.on(TRUMPCARD_EVENTS.LEAVE_LOBBY, async (data: { matchId?: string }) => {
    try {
      const matchId = data.matchId ?? socketToMatch.get(socket.id);
      if (!matchId) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'No match specified' });
        return;
      }
      if (matches.has(matchId)) {
        socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Match already started' });
        return;
      }

      await prisma.matchParticipant.deleteMany({ where: { matchId, userId } });

      const lobby = lobbyInfo.get(matchId);
      if (lobby && lobby.hostUserId === userId) {
        lobbyInfo.delete(matchId);
        for (const [code, mid] of roomCodes) {
          if (mid === matchId) roomCodes.delete(code);
        }
      }

      socketToMatch.delete(socket.id);
      socket.emit(TRUMPCARD_EVENTS.MATCH_CREATED, { matchId, message: 'Left lobby' });
    } catch (err) {
      log.error('leave_lobby error', { userId, err });
      socket.emit(TRUMPCARD_EVENTS.ERROR, { message: 'Failed to leave lobby' });
    }
  });

  // --- DISCONNECT: handle player disconnecting ---
  socket.on('disconnect', () => {
    try {
      // Listing grace period for a host (lobby not started yet).
      for (const [matchId, info] of lobbyInfo) {
        if (info.hostSocketId === socket.id && !listingGraceTimers.has(matchId)) {
          const timer = setTimeout(() => {
            listingGraceTimers.delete(matchId);
            const current = lobbyInfo.get(matchId);
            if (current && current.hostSocketId === socket.id) {
              lobbyInfo.delete(matchId);
              for (const [code, mid] of roomCodes) {
                if (mid === matchId) roomCodes.delete(code);
              }
            }
          }, LISTING_GRACE_MS);
          listingGraceTimers.set(matchId, timer);
        }
      }

      const matchId = socketToMatch.get(socket.id);
      if (!matchId) return;

      const match = matches.get(matchId);
      if (!match) return;

      delete match.socketIds[userId];
      socketToMatch.delete(socket.id);

      // Already eliminated — nothing left to disconnect from.
      if (!match.state.activePlayerIds.includes(userId)) return;

      match.state = markDisconnected(match.state, userId);
      broadcastToMatch(match, TRUMPCARD_EVENTS.OPPONENT_DISCONNECTED, { userId });

      // Local reconnect-grace timer — deliberately NOT escrow.forfeitPlayer
      // here. That call starts a real stake-forfeit-to-pot countdown, and
      // firing it on the very first disconnect regardless of remaining lives
      // would contradict the game doc's "the lives system only decides *when*
      // forfeitPlayer() fires, not what it does." escrow.forfeitPlayer is
      // only called from applyLifeLoss, at the exact moment lives hit 0.
      if (match.timers.disconnect[userId]) return;

      const timer = setTimeout(() => guardSync('disconnect timeout', () => {
        delete match.timers.disconnect[userId];
        if (!match.state.disconnectedPlayers.includes(userId)) return; // reconnected already
        applyLifeLoss(match, userId, 'disconnect_timeout');
      }, { matchId, userId }), escrow.RECONNECT_GRACE_MS);

      match.timers.disconnect[userId] = timer;
    } catch (err) {
      log.error('disconnect cleanup failed', { userId, socketId: socket.id, err });
    }
  });
}
