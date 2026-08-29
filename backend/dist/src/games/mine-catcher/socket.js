/**
 * Mine Catcher socket handlers — realtime game flow.
 *
 * Manages the full lifecycle of a mine-catcher match via socket.io:
 *   join → placement → attack turns → match_end
 *
 * Timers run server-side and broadcast state to both clients.
 * The game never imports User, LedgerEntry, Match, or treasury — all money
 * behaviour comes from the escrow adapter.
 */
import { escrow } from '../../escrow/index.js';
import { prisma } from '../../config/db.js';
import { createLogger } from '../../lib/logger.js';
import { createInitialState, placeMines, autoPlaceMines, resolveAttack, checkRaceEnd, decrementLife, markDisconnected, markReconnected, markReady, bothReady, startAttackPhase, PLACEMENT_TIMEOUT_MS, ATTACK_TIMEOUT_MS, VALID_BOARD_SIZES, } from './engine.js';
import { MC_EVENTS } from './types.js';
const log = createLogger('game:mine-catcher');
const matches = new Map();
// --- Rematch (Rule 4's third discovery path) --------------------------------
const REMATCH_WINDOW_MS = 2 * 60 * 1000;
const pendingRematches = new Map();
const waitingQueue = new Map();
const publicMatches = new Map();
// See the matching constant in coin-flip/socket.ts for the full rationale:
// 20s is shorter than socket.io's own worst-case disconnect-detection
// latency plus the time it takes to actually share and redeem a Friends
// Play code, so codes were routinely invalidated before anyone used them.
const LISTING_GRACE_MS = 2 * 60 * 1000;
const listingGraceTimers = new Map();
// --- Room codes (Friends Play) -----------------------------------------------
const CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
}
const roomCodes = new Map();
const socketToMatch = new Map();
// --- Helpers ----------------------------------------------------------------
function getOtherPlayer(match, userId) {
    return match.playerIds[0] === userId ? match.playerIds[1] : match.playerIds[0];
}
function broadcastToMatch(match, event, payload) {
    for (const socketId of Object.values(match.socketIds)) {
        const io = getIoRef();
        if (io) {
            io.to(socketId).emit(event, payload);
        }
    }
}
let ioRef = null;
function getIoRef() {
    return ioRef;
}
function guard(label, work, context) {
    void work.catch((err) => {
        log.error(`${label} failed`, { ...context, err });
    });
}
function guardSync(label, work, context) {
    try {
        work();
    }
    catch (err) {
        log.error(`${label} failed`, { ...context, err });
    }
}
function clearTimeouts(match) {
    if (match.timers.placement) {
        clearTimeout(match.timers.placement);
        match.timers.placement = null;
    }
    if (match.timers.turn) {
        clearTimeout(match.timers.turn);
        match.timers.turn = null;
    }
}
// --- Timer management -------------------------------------------------------
function startPlacementTimer(match) {
    match.timers.placement = setTimeout(() => guardSync('placement timeout', () => {
        log.info('placement timeout', { matchId: match.matchId });
        // Auto-place mines for any player who hasn't readied
        for (const playerId of match.playerIds) {
            if (!match.state.readyPlayers.includes(playerId)) {
                const board = match.state.boards[playerId];
                if (board && board.mines.size < match.state.totalMines) {
                    match.state.boards[playerId] = autoPlaceMines(board, match.state.boardSize);
                }
                match.state = markReady(match.state, playerId);
            }
        }
        // Both are now ready — start attack phase
        if (bothReady(match.state)) {
            match.state = startAttackPhase(match.state);
            broadcastToMatch(match, MC_EVENTS.ATTACK_STARTED, {
                currentAttacker: match.state.currentAttacker,
                turnStartedAt: match.state.turnStartedAt,
            });
            startTurnTimer(match, match.state.currentAttacker);
        }
    }, { matchId: match.matchId }), PLACEMENT_TIMEOUT_MS);
}
function startTurnTimer(match, attackerId) {
    match.timers.turn = setTimeout(() => guardSync('turn timeout', () => {
        log.info('turn timeout', { matchId: match.matchId, attackerId });
        // Decrement life for the timed-out attacker
        const { state: newState, lifeLost, gameOver, winnerId } = decrementLife(match.state, attackerId);
        match.state = newState;
        if (lifeLost) {
            broadcastToMatch(match, MC_EVENTS.LIVES_UPDATE, {
                userId: attackerId,
                lives: match.state.lives[attackerId],
            });
        }
        if (gameOver) {
            if (winnerId) {
                guard('settle', settleMatch(match, winnerId, { forfeited: true }), { matchId: match.matchId });
            }
            else {
                // Dual-unreachable — platform keeps pot
                handleDualUnreachable(match);
            }
            return;
        }
        // Alternate to the other player
        const opponent = getOtherPlayer(match, attackerId);
        if (opponent) {
            match.state.currentAttacker = opponent;
            match.state.turnStartedAt = Date.now();
            broadcastToMatch(match, MC_EVENTS.TURN_START, {
                currentAttacker: opponent,
                turnStartedAt: match.state.turnStartedAt,
            });
            startTurnTimer(match, opponent);
        }
    }, { matchId: match.matchId }), ATTACK_TIMEOUT_MS);
}
// --- Match end --------------------------------------------------------------
async function settleMatch(match, winnerId, opts = {}) {
    clearTimeouts(match);
    const result = await escrow.settleMatch(match.matchId, [winnerId], [1], {
        result: {
            winnerId,
            foundCounts: match.state.foundCounts,
            breakCounts: match.state.breakCounts,
            lives: match.state.lives,
            endCause: match.state.endCause,
        },
    });
    broadcastToMatch(match, MC_EVENTS.MATCH_RESULT, {
        matchId: match.matchId,
        winnerId,
        foundCounts: match.state.foundCounts,
        breakCounts: match.state.breakCounts,
        lives: match.state.lives,
        endCause: match.state.endCause,
        pot: result.pot.toString(),
        feeCollected: result.feeCollected.toString(),
        payouts: result.payouts.map((p) => ({
            userId: p.userId,
            payout: p.payout.toString(),
        })),
    });
    // Rule 4 Rematch: offered on every match except forfeit
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
    for (const socketId of Object.values(match.socketIds)) {
        socketToMatch.delete(socketId);
    }
    matches.delete(match.matchId);
    log.info('match settled', {
        matchId: match.matchId,
        winnerId,
        endCause: match.state.endCause,
        rematchOffered: !opts.forfeited,
    });
}
function handleDualUnreachable(match) {
    clearTimeouts(match);
    match.state.phase = 'match_over';
    match.state.winnerId = null;
    match.state.endCause = 'dual_unreachable';
    broadcastToMatch(match, MC_EVENTS.MATCH_RESULT, {
        matchId: match.matchId,
        winnerId: null,
        foundCounts: match.state.foundCounts,
        breakCounts: match.state.breakCounts,
        lives: match.state.lives,
        endCause: 'dual_unreachable',
        pot: null,
        feeCollected: null,
        payouts: [],
        message: 'Both players unreachable — platform retains the pot.',
    });
    for (const socketId of Object.values(match.socketIds)) {
        socketToMatch.delete(socketId);
    }
    matches.delete(match.matchId);
    log.info('match ended: dual-unreachable', { matchId: match.matchId });
}
// --- Match start ------------------------------------------------------------
async function beginMatch(matchId, playerIds, settings, socketIds) {
    const players = await prisma.user.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, username: true },
    });
    const nameMap = new Map(players.map((p) => [p.id, p.username ?? 'Player']));
    const state = createInitialState(settings.boardSize, playerIds);
    const newActiveMatch = {
        matchId,
        playerIds,
        state,
        socketIds: { ...socketIds },
        timers: { placement: null, turn: null },
        settings,
    };
    for (const sid of Object.values(newActiveMatch.socketIds)) {
        socketToMatch.set(sid, matchId);
    }
    matches.set(matchId, newActiveMatch);
    // Notify both players
    for (const sid of Object.values(newActiveMatch.socketIds)) {
        const io = getIoRef();
        if (io) {
            io.to(sid).emit(MC_EVENTS.MATCH_STATE, {
                matchId,
                players: playerIds.map((id) => ({ id, displayName: nameMap.get(id) })),
                boardSize: settings.boardSize,
                stake: settings.stake,
            });
        }
    }
    // Start placement timer
    broadcastToMatch(newActiveMatch, MC_EVENTS.PLACEMENT_STARTED, {
        boardSize: settings.boardSize,
        totalMines: state.totalMines,
        placementTimeout: PLACEMENT_TIMEOUT_MS,
        placementStartedAt: state.placementStartedAt,
    });
    startPlacementTimer(newActiveMatch);
    log.info('match started', { matchId, playerIds, stake: settings.stake, boardSize: settings.boardSize });
}
// --- Socket event handlers --------------------------------------------------
export function registerMineCatcherSocket(namespace, socket) {
    const userId = socket.data.userId;
    ioRef = namespace;
    // Refresh host socket id for any listings owned by this user
    for (const listing of publicMatches.values()) {
        if (listing.hostUserId === userId) {
            listing.hostSocketId = socket.id;
            const graceTimer = listingGraceTimers.get(listing.matchId);
            if (graceTimer) {
                clearTimeout(graceTimer);
                listingGraceTimers.delete(listing.matchId);
            }
        }
    }
    // --- LIST_MATCHES ---
    socket.on(MC_EVENTS.LIST_MATCHES, async () => {
        const listed = [...publicMatches.values()]
            .filter((m) => !m.private)
            .filter((m) => m.hostUserId !== userId)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 20)
            .map((m) => ({
            matchId: m.matchId,
            hostName: m.hostName,
            stake: String(m.stake),
            boardSize: m.boardSize,
            betMode: m.betMode,
            minBet: m.minBet != null ? String(m.minBet) : null,
        }));
        socket.emit(MC_EVENTS.MATCHES_LIST, { matches: listed });
    });
    // --- CREATE_MATCH ---
    socket.on(MC_EVENTS.CREATE_MATCH, async (data) => {
        try {
            const boardSize = (data.boardSize ?? 25);
            const stakeAmount = data.stake ?? 0.1;
            const mode = data.betMode ?? 'fixed';
            const discovery = data.discovery ?? 'random';
            if (!VALID_BOARD_SIZES.includes(boardSize)) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Invalid board size — must be 25, 49, 81, or 100' });
                return;
            }
            if (stakeAmount <= 0) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Stake must be positive' });
                return;
            }
            const matchId = await escrow.createMatch({
                gameType: 'mine-catcher',
                mode: 'pooled',
                gameState: { boardSize, betMode: mode, minBet: data.minBet ?? null },
            });
            await prisma.matchParticipant.create({
                data: { matchId, userId, lockedAmount: 0, stakeTotal: 0, status: 'active' },
            });
            const hostUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
            const hostName = hostUser?.username ?? 'Player';
            if (discovery === 'random') {
                publicMatches.set(matchId, {
                    matchId,
                    hostUserId: userId,
                    hostSocketId: socket.id,
                    hostName,
                    stake: stakeAmount,
                    boardSize,
                    betMode: mode,
                    minBet: data.minBet ?? null,
                    createdAt: Date.now(),
                    private: false,
                });
                socket.emit(MC_EVENTS.MATCH_CREATED, { matchId });
                log.info('random match created', { matchId, host: userId, stake: stakeAmount, boardSize });
            }
            else {
                let code = generateRoomCode();
                while (roomCodes.has(code))
                    code = generateRoomCode();
                roomCodes.set(code, matchId);
                publicMatches.set(matchId, {
                    matchId,
                    hostUserId: userId,
                    hostSocketId: socket.id,
                    hostName,
                    stake: stakeAmount,
                    boardSize,
                    betMode: mode,
                    minBet: data.minBet ?? null,
                    createdAt: Date.now(),
                    private: true,
                });
                socket.emit(MC_EVENTS.MATCH_CREATED, { matchId, roomCode: code });
                log.info('friends match created', { matchId, host: userId, code, stake: stakeAmount });
            }
        }
        catch (err) {
            log.error('create_match error', { userId, err });
            socket.emit(MC_EVENTS.ERROR, { message: 'Failed to create match' });
        }
    });
    // --- JOIN_MATCH ---
    socket.on(MC_EVENTS.JOIN_MATCH, async (data) => {
        try {
            let matchId;
            let usedRoomCode;
            if (data.roomCode) {
                usedRoomCode = data.roomCode.toUpperCase();
                matchId = roomCodes.get(usedRoomCode);
                if (!matchId) {
                    socket.emit(MC_EVENTS.ERROR, { message: 'Invalid room code' });
                    return;
                }
            }
            else if (data.matchId) {
                matchId = data.matchId;
            }
            if (!matchId) {
                socket.emit(MC_EVENTS.ERROR, { message: 'No match specified' });
                return;
            }
            // Reconnection check
            const activeMatch = matches.get(matchId);
            if (activeMatch && activeMatch.playerIds.includes(userId)) {
                socketToMatch.set(socket.id, matchId);
                activeMatch.socketIds[userId] = socket.id;
                if (activeMatch.state.disconnectedPlayers.includes(userId)) {
                    activeMatch.state = markReconnected(activeMatch.state, userId);
                    await escrow.cancelForfeit(matchId, userId);
                    broadcastToMatch(activeMatch, MC_EVENTS.OPPONENT_RECONNECTED, { userId });
                }
                socket.emit(MC_EVENTS.MATCH_STATE, {
                    state: {
                        ...activeMatch.state,
                        boards: Object.fromEntries(Object.entries(activeMatch.state.boards).map(([k, v]) => [
                            k,
                            { ...v, mines: [...v.mines] },
                        ])),
                    },
                    message: 'Reconnected',
                });
                return;
            }
            // New join
            const dbMatch = await prisma.match.findUnique({
                where: { id: matchId },
                include: { participants: true },
            });
            if (!dbMatch || dbMatch.gameType !== 'mine-catcher') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Match not found' });
                return;
            }
            if (dbMatch.status !== 'open') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Match already started or finished' });
                return;
            }
            const alreadyParticipant = dbMatch.participants.some((p) => p.userId === userId);
            if (alreadyParticipant) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Already in this match' });
                return;
            }
            if (dbMatch.participants.length >= 2) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Match is full' });
                return;
            }
            const gs = (dbMatch.gameState ?? {});
            const boardSize = (gs.boardSize ?? 25);
            const stakeAmount = Number(dbMatch.participants[0]?.lockedAmount ?? 0) > 0
                ? Number(dbMatch.participants[0]?.stakeTotal ?? 0.1)
                : publicMatches.get(matchId)?.stake ?? 0.1;
            const betMode = gs.betMode ?? 'fixed';
            // Lock stakes
            const stakeDecimal = new (await import('../../lib/money.js')).Decimal(stakeAmount);
            const hostParticipant = dbMatch.participants[0];
            if (hostParticipant) {
                await escrow.lockBalance(hostParticipant.userId, stakeDecimal, matchId);
            }
            await escrow.lockBalance(userId, stakeDecimal, matchId);
            const playerIds = [dbMatch.participants[0]?.userId ?? userId, userId];
            if (dbMatch.participants[0] && dbMatch.participants[0].userId !== playerIds[0]) {
                playerIds.reverse();
            }
            const hostSocketId = publicMatches.get(matchId)?.hostSocketId;
            publicMatches.delete(matchId);
            if (usedRoomCode)
                roomCodes.delete(usedRoomCode);
            const graceTimer = listingGraceTimers.get(matchId);
            if (graceTimer) {
                clearTimeout(graceTimer);
                listingGraceTimers.delete(matchId);
            }
            for (const [key, waiting] of waitingQueue) {
                if (waiting.userId === userId)
                    waitingQueue.delete(key);
            }
            const socketIds = {};
            if (hostSocketId)
                socketIds[playerIds[0]] = hostSocketId;
            socketIds[userId] = socket.id;
            await beginMatch(matchId, playerIds, { boardSize, betMode, minBet: gs.minBet ?? null, stake: stakeAmount }, socketIds);
            log.info('match joined', { matchId, playerIds, stake: stakeAmount });
        }
        catch (err) {
            log.error('join_match error', { userId, err });
            socket.emit(MC_EVENTS.ERROR, { message: 'Failed to join match' });
        }
    });
    // --- PLACE_MINES: player submits their mine placements ---
    socket.on(MC_EVENTS.PLACE_MINES, async (data) => {
        try {
            const matchId = socketToMatch.get(socket.id);
            if (!matchId) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Not in a match' });
                return;
            }
            const match = matches.get(matchId);
            if (!match) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Match not active' });
                return;
            }
            if (match.state.phase !== 'placement') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Not the placement phase' });
                return;
            }
            if (!data.cells || !Array.isArray(data.cells)) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Invalid mine placement' });
                return;
            }
            const board = match.state.boards[userId];
            if (!board) {
                socket.emit(MC_EVENTS.ERROR, { message: 'You are not in this match' });
                return;
            }
            // If already placed, ignore duplicate
            if (board.mines.size === match.state.totalMines) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Mines already placed' });
                return;
            }
            const newBoard = placeMines(board, data.cells, match.state.boardSize);
            if (!newBoard) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Invalid placement — must place exactly 10 mines on valid cells' });
                return;
            }
            match.state.boards[userId] = newBoard;
            broadcastToMatch(match, MC_EVENTS.MINES_PLACED, {
                userId,
                mineCount: newBoard.mines.size,
            });
            log.info('mines placed', { matchId, userId, mineCount: newBoard.mines.size });
        }
        catch (err) {
            log.error('place_mines error', { userId, err });
            socket.emit(MC_EVENTS.ERROR, { message: 'Failed to place mines' });
        }
    });
    // --- READY_UP: player confirms placement is done ---
    socket.on(MC_EVENTS.READY_UP, async () => {
        try {
            const matchId = socketToMatch.get(socket.id);
            if (!matchId) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Not in a match' });
                return;
            }
            const match = matches.get(matchId);
            if (!match) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Match not active' });
                return;
            }
            if (match.state.phase !== 'placement') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Not the placement phase' });
                return;
            }
            // Verify mines are placed
            const board = match.state.boards[userId];
            if (!board || board.mines.size < match.state.totalMines) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Place all 10 mines first' });
                return;
            }
            match.state = markReady(match.state, userId);
            broadcastToMatch(match, MC_EVENTS.PLAYER_READY, { userId });
            // Check if both ready
            if (bothReady(match.state)) {
                if (match.timers.placement) {
                    clearTimeout(match.timers.placement);
                    match.timers.placement = null;
                }
                match.state = startAttackPhase(match.state);
                broadcastToMatch(match, MC_EVENTS.ATTACK_STARTED, {
                    currentAttacker: match.state.currentAttacker,
                    turnStartedAt: match.state.turnStartedAt,
                });
                startTurnTimer(match, match.state.currentAttacker);
            }
            log.info('player ready', { matchId, userId, readyCount: match.state.readyPlayers.length });
        }
        catch (err) {
            log.error('ready_up error', { userId, err });
            socket.emit(MC_EVENTS.ERROR, { message: 'Failed to ready up' });
        }
    });
    // --- ATTACK_CELL: player attacks a cell on opponent's board ---
    socket.on(MC_EVENTS.ATTACK_CELL, async (data) => {
        try {
            const matchId = socketToMatch.get(socket.id);
            if (!matchId) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Not in a match' });
                return;
            }
            const match = matches.get(matchId);
            if (!match) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Match not active' });
                return;
            }
            if (match.state.phase !== 'attacking') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Not the attack phase' });
                return;
            }
            if (data.cellIndex === undefined || data.cellIndex === null) {
                socket.emit(MC_EVENTS.ERROR, { message: 'No cell specified' });
                return;
            }
            const opponentId = getOtherPlayer(match, userId);
            if (!opponentId) {
                socket.emit(MC_EVENTS.ERROR, { message: 'No opponent found' });
                return;
            }
            const result = resolveAttack(userId, opponentId, data.cellIndex, match.state);
            if (!result) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Invalid attack' });
                return;
            }
            if (result.result.type === 'already_revealed') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Cell already revealed' });
                return;
            }
            if (result.result.type === 'not_your_turn') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Not your turn' });
                return;
            }
            if (result.result.type === 'game_over') {
                socket.emit(MC_EVENTS.ERROR, { message: 'Match is over' });
                return;
            }
            // Clear turn timer
            if (match.timers.turn) {
                clearTimeout(match.timers.turn);
                match.timers.turn = null;
            }
            match.state = result.state;
            // Broadcast the attack result
            broadcastToMatch(match, MC_EVENTS.ATTACK_RESULT, {
                attackerId: userId,
                cellIndex: data.cellIndex,
                result: result.result.type, // 'break' or 'blast'
                foundCounts: match.state.foundCounts,
                breakCounts: match.state.breakCounts,
            });
            // Check race end (found all 10)
            const raceWinner = checkRaceEnd(match.state);
            if (raceWinner) {
                match.state.phase = 'match_over';
                match.state.winnerId = raceWinner;
                match.state.endCause = 'race_won';
                guard('settle', settleMatch(match, raceWinner), { matchId });
                return;
            }
            // Start turn timer for next attacker
            if (match.state.currentAttacker) {
                startTurnTimer(match, match.state.currentAttacker);
            }
        }
        catch (err) {
            log.error('attack_cell error', { userId, err });
            socket.emit(MC_EVENTS.ERROR, { message: 'Failed to attack' });
        }
    });
    // --- REMATCH_REQUEST ---
    socket.on(MC_EVENTS.REMATCH_REQUEST, async (data) => {
        try {
            const matchId = data.matchId;
            if (!matchId) {
                socket.emit(MC_EVENTS.ERROR, { message: 'No match specified' });
                return;
            }
            const pending = pendingRematches.get(matchId);
            if (!pending || !pending.playerIds.includes(userId)) {
                socket.emit(MC_EVENTS.ERROR, { message: 'Rematch is no longer available.' });
                return;
            }
            pending.socketIds[userId] = socket.id;
            pending.confirmed.add(userId);
            const otherId = pending.playerIds.find((id) => id !== userId);
            if (pending.confirmed.size < 2) {
                socket.emit(MC_EVENTS.REMATCH_WAITING, { matchId });
                const otherSocketId = pending.socketIds[otherId];
                if (otherSocketId) {
                    getIoRef()?.to(otherSocketId).emit(MC_EVENTS.REMATCH_OFFERED, { matchId });
                }
                return;
            }
            // Both confirmed — start rematch
            clearTimeout(pending.expiry);
            pendingRematches.delete(matchId);
            const newMatchId = await escrow.createMatch({
                gameType: 'mine-catcher',
                mode: 'pooled',
                gameState: {
                    boardSize: pending.settings.boardSize,
                    betMode: pending.settings.betMode,
                    minBet: pending.settings.minBet,
                },
            });
            try {
                const stakeDecimal = new (await import('../../lib/money.js')).Decimal(pending.settings.stake);
                for (const uid of pending.playerIds) {
                    await escrow.lockBalance(uid, stakeDecimal, newMatchId);
                }
            }
            catch (lockErr) {
                log.error('rematch stake lock failed', { previousMatchId: matchId, newMatchId, err: lockErr });
                await escrow.refundMatch(newMatchId, 'Rematch could not be started').catch(() => { });
                for (const uid of pending.playerIds) {
                    const sid = pending.socketIds[uid];
                    if (sid) {
                        getIoRef()?.to(sid).emit(MC_EVENTS.ERROR, {
                            message: 'Rematch failed — one of you no longer has enough balance for this stake.',
                        });
                    }
                }
                return;
            }
            await beginMatch(newMatchId, pending.playerIds, pending.settings, pending.socketIds);
            log.info('rematch started', { previousMatchId: matchId, newMatchId, playerIds: pending.playerIds });
        }
        catch (err) {
            log.error('rematch error', { userId, err });
            socket.emit(MC_EVENTS.ERROR, { message: 'Failed to start rematch' });
        }
    });
    // --- DISCONNECT ---
    socket.on('disconnect', async () => {
        try {
            // Clean up waiting queue
            for (const [key, waiting] of waitingQueue) {
                if (waiting.userId === userId || waiting.socketId === socket.id) {
                    waitingQueue.delete(key);
                }
            }
            // Listing grace period for hosts
            for (const [matchId, listing] of publicMatches) {
                if (listing.hostSocketId === socket.id && !listingGraceTimers.has(matchId)) {
                    const timer = setTimeout(() => {
                        listingGraceTimers.delete(matchId);
                        const current = publicMatches.get(matchId);
                        if (current && current.hostSocketId === socket.id) {
                            publicMatches.delete(matchId);
                            for (const [code, mid] of roomCodes) {
                                if (mid === matchId)
                                    roomCodes.delete(code);
                            }
                        }
                    }, LISTING_GRACE_MS);
                    listingGraceTimers.set(matchId, timer);
                }
            }
            const matchId = socketToMatch.get(socket.id);
            if (!matchId)
                return;
            const match = matches.get(matchId);
            if (!match)
                return;
            // Remove this socket
            delete match.socketIds[userId];
            socketToMatch.delete(socket.id);
            // Mark as disconnected
            match.state = markDisconnected(match.state, userId);
            broadcastToMatch(match, MC_EVENTS.OPPONENT_DISCONNECTED, { userId });
            // Start the forfeit grace period via escrow
            const forfeitResult = await escrow.forfeitPlayer(matchId, userId);
            if (forfeitResult.outcome === 'forfeited') {
                // Decrement life for the forfeited player
                const { state: newState, lifeLost, gameOver, winnerId } = decrementLife(match.state, userId);
                match.state = newState;
                if (lifeLost) {
                    broadcastToMatch(match, MC_EVENTS.LIVES_UPDATE, {
                        userId,
                        lives: match.state.lives[userId],
                    });
                }
                if (gameOver) {
                    if (winnerId) {
                        await settleMatch(match, winnerId, { forfeited: true });
                    }
                    else {
                        handleDualUnreachable(match);
                    }
                }
            }
        }
        catch (err) {
            log.error('disconnect cleanup failed', { userId, socketId: socket.id, err });
        }
    });
}
//# sourceMappingURL=socket.js.map