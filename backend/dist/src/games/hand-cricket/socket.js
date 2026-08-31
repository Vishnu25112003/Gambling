/**
 * Hand Cricket socket handlers — realtime game flow.
 *
 * Manages the full lifecycle of a hand-cricket match via socket.io:
 *   join -> innings 1 -> innings 2 -> [Super Over] -> match_end
 *
 * Timers run server-side and broadcast state to both clients.
 * The game never imports User, LedgerEntry, Match, or treasury — all money
 * behaviour comes from the escrow adapter.
 */
import { escrow } from '../../escrow/index.js';
import { prisma } from '../../config/db.js';
import { createLogger } from '../../lib/logger.js';
import { Decimal } from '../../lib/money.js';
import { createInitialState, startNewBall, submitPick, bothPicksIn, resolveBall, checkInningsEnd, advanceInnings, checkMatchEnd, startSuperOver, decrementLife, markDisconnected, markReconnected, currentInnings, PICK_TIMEOUT_MS, VALID_BALLS_PER_INNINGS, } from './engine.js';
import { HC_EVENTS } from './types.js';
const log = createLogger('game:hand-cricket');
const matches = new Map();
// --- Rematch (Rule 4's third discovery path) --------------------------------
const REMATCH_WINDOW_MS = 2 * 60 * 1000;
const pendingRematches = new Map();
const publicMatches = new Map();
// Same rationale as coin-flip/socket.ts and mine-catcher/socket.ts: give a
// host's listing a grace period before delisting on disconnect, so a normal
// tab refresh or a Friends Play code that hasn't been shared yet doesn't
// instantly vanish.
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
// --- Helpers ------------------------------------------------------------------
function getOtherPlayer(match, userId) {
    return match.playerIds[0] === userId ? match.playerIds[1] : match.playerIds[0];
}
let ioRef = null;
function getIoRef() {
    return ioRef;
}
function broadcastToMatch(match, event, payload) {
    for (const socketId of Object.values(match.socketIds)) {
        const io = getIoRef();
        if (io)
            io.to(socketId).emit(event, payload);
    }
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
    if (match.timers.ball) {
        clearTimeout(match.timers.ball);
        match.timers.ball = null;
    }
}
// --- Ball lifecycle -----------------------------------------------------------
function startBall(match) {
    match.state = startNewBall(match.state);
    const innings = currentInnings(match.state);
    broadcastToMatch(match, HC_EVENTS.BALL_STARTED, {
        ballNumber: (innings?.ballsBowled ?? 0) + 1,
        ballStartedAt: match.state.pendingBall?.ballStartedAt,
        batterId: innings?.batterId,
        bowlerId: innings?.bowlerId,
    });
    match.timers.ball = setTimeout(() => guardSync('ball timeout', () => handleBallTimeout(match), { matchId: match.matchId }), PICK_TIMEOUT_MS);
}
function handleBallTimeout(match) {
    const innings = currentInnings(match.state);
    const pending = match.state.pendingBall;
    if (!innings || !pending)
        return;
    const missing = [innings.batterId, innings.bowlerId].filter((id) => pending.picks[id] === undefined);
    for (const userId of missing) {
        const { state: newState, lifeLost, gameOver, winnerId } = decrementLife(match.state, userId);
        match.state = newState;
        if (lifeLost) {
            broadcastToMatch(match, HC_EVENTS.LIVES_UPDATE, { userId, lives: match.state.lives[userId] });
        }
        if (gameOver) {
            if (winnerId) {
                guard('settle', settleMatch(match, [winnerId], [1], { forfeited: true }), { matchId: match.matchId });
            }
            else {
                handleDualUnreachable(match);
            }
            return;
        }
    }
    // Match continues — the stalled ball is discarded and retried from scratch.
    startBall(match);
}
/**
 * Runs the innings/match-end pipeline right after a ball resolves.
 * Advances to the next innings, starts a Super Over, or ends the match.
 */
function afterBallResolved(match) {
    if (!checkInningsEnd(match.state)) {
        startBall(match);
        return;
    }
    const finishedInnings = currentInnings(match.state);
    broadcastToMatch(match, HC_EVENTS.INNINGS_OVER, {
        inningsIndex: match.state.currentInningsIndex,
        finalRuns: finishedInnings?.runs,
        cause: finishedInnings?.isOut ? 'out' : 'balls_used',
    });
    if (match.state.innings.length === 1) {
        match.state = advanceInnings(match.state);
        const innings = currentInnings(match.state);
        broadcastToMatch(match, HC_EVENTS.INNINGS_STARTED, {
            inningsId: 'second',
            batterId: innings?.batterId,
            bowlerId: innings?.bowlerId,
            ballsPerInnings: innings?.ballsPerInnings,
        });
        startBall(match);
        return;
    }
    if (match.state.innings.length === 3) {
        match.state = advanceInnings(match.state);
        const innings = currentInnings(match.state);
        broadcastToMatch(match, HC_EVENTS.INNINGS_STARTED, {
            inningsId: 'super_second',
            batterId: innings?.batterId,
            bowlerId: innings?.bowlerId,
            ballsPerInnings: innings?.ballsPerInnings,
        });
        startBall(match);
        return;
    }
    const result = checkMatchEnd(match.state);
    if (!result.over) {
        // Main match tied after both innings -> Super Over.
        match.state = startSuperOver(match.state);
        const innings = currentInnings(match.state);
        broadcastToMatch(match, HC_EVENTS.SUPER_OVER_STARTED, {
            batterId: innings?.batterId,
            bowlerId: innings?.bowlerId,
            ballsPerInnings: innings?.ballsPerInnings,
        });
        startBall(match);
        return;
    }
    match.state = { ...match.state, phase: 'match_over', winnerId: result.winnerId, endCause: result.endCause };
    if (result.endCause === 'super_over_tied_split') {
        guard('settle', settleMatch(match, match.playerIds, [1, 1]), { matchId: match.matchId });
    }
    else if (result.winnerId) {
        guard('settle', settleMatch(match, [result.winnerId], [1]), { matchId: match.matchId });
    }
}
// --- Match end -----------------------------------------------------------------
async function settleMatch(match, winners, weights, opts = {}) {
    clearTimeouts(match);
    const result = await escrow.settleMatch(match.matchId, winners, weights, {
        result: {
            winners,
            endCause: match.state.endCause,
            innings: match.state.innings,
            lives: match.state.lives,
        },
    });
    broadcastToMatch(match, HC_EVENTS.MATCH_RESULT, {
        matchId: match.matchId,
        winnerId: winners.length === 1 ? winners[0] : null,
        split: winners.length > 1,
        innings: match.state.innings,
        lives: match.state.lives,
        endCause: match.state.endCause,
        pot: result.pot.toString(),
        feeCollected: result.feeCollected.toString(),
        payouts: result.payouts.map((p) => ({ userId: p.userId, payout: p.payout.toString() })),
    });
    // Rule 4 Rematch: offered on every match except forfeit.
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
    for (const socketId of Object.values(match.socketIds))
        socketToMatch.delete(socketId);
    matches.delete(match.matchId);
    log.info('match settled', {
        matchId: match.matchId,
        winners,
        endCause: match.state.endCause,
        rematchOffered: !opts.forfeited,
    });
}
function handleDualUnreachable(match) {
    clearTimeouts(match);
    match.state = { ...match.state, phase: 'match_over', winnerId: null, endCause: 'dual_unreachable' };
    broadcastToMatch(match, HC_EVENTS.MATCH_RESULT, {
        matchId: match.matchId,
        winnerId: null,
        split: false,
        innings: match.state.innings,
        lives: match.state.lives,
        endCause: 'dual_unreachable',
        pot: null,
        feeCollected: null,
        payouts: [],
        message: 'Both players unreachable — platform retains the pot.',
    });
    for (const socketId of Object.values(match.socketIds))
        socketToMatch.delete(socketId);
    matches.delete(match.matchId);
    log.info('match ended: dual-unreachable', { matchId: match.matchId });
}
// --- Match start -----------------------------------------------------------------
async function beginMatch(matchId, playerIds, settings, socketIds) {
    const players = await prisma.user.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, username: true },
    });
    const nameMap = new Map(players.map((p) => [p.id, p.username ?? 'Player']));
    const state = createInitialState(settings.ballsPerInnings, playerIds);
    const newActiveMatch = {
        matchId,
        playerIds,
        state,
        socketIds: { ...socketIds },
        timers: { ball: null },
        settings,
    };
    for (const sid of Object.values(newActiveMatch.socketIds))
        socketToMatch.set(sid, matchId);
    matches.set(matchId, newActiveMatch);
    for (const sid of Object.values(newActiveMatch.socketIds)) {
        const io = getIoRef();
        if (io) {
            io.to(sid).emit(HC_EVENTS.MATCH_STATE, {
                matchId,
                players: playerIds.map((id) => ({ id, displayName: nameMap.get(id) })),
                ballsPerInnings: settings.ballsPerInnings,
                stake: settings.stake,
            });
        }
    }
    const innings = currentInnings(newActiveMatch.state);
    broadcastToMatch(newActiveMatch, HC_EVENTS.INNINGS_STARTED, {
        inningsId: 'first',
        batterId: innings?.batterId,
        bowlerId: innings?.bowlerId,
        ballsPerInnings: innings?.ballsPerInnings,
    });
    startBall(newActiveMatch);
    log.info('match started', { matchId, playerIds, stake: settings.stake, ballsPerInnings: settings.ballsPerInnings });
}
// --- Socket event handlers --------------------------------------------------
export function registerHandCricketSocket(namespace, socket) {
    const userId = socket.data.userId;
    ioRef = namespace;
    // Refresh host socket id for any listings owned by this user.
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
    socket.on(HC_EVENTS.LIST_MATCHES, async () => {
        const listed = [...publicMatches.values()]
            .filter((m) => !m.private)
            .filter((m) => m.hostUserId !== userId)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 20)
            .map((m) => ({
            matchId: m.matchId,
            hostName: m.hostName,
            stake: String(m.stake),
            ballsPerInnings: m.ballsPerInnings,
            betMode: m.betMode,
            minBet: m.minBet != null ? String(m.minBet) : null,
        }));
        socket.emit(HC_EVENTS.MATCHES_LIST, { matches: listed });
    });
    // --- CREATE_MATCH ---
    socket.on(HC_EVENTS.CREATE_MATCH, async (data) => {
        try {
            const ballsPerInnings = data.ballsPerInnings ?? 6;
            const stakeAmount = data.stake ?? 0.1;
            const mode = data.betMode ?? 'fixed';
            const discovery = data.discovery ?? 'random';
            if (!VALID_BALLS_PER_INNINGS.includes(ballsPerInnings)) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Invalid balls-per-innings — must be 6, 8, 10, or 12' });
                return;
            }
            if (stakeAmount <= 0) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Stake must be positive' });
                return;
            }
            const matchId = await escrow.createMatch({
                gameType: 'hand-cricket',
                mode: 'pooled',
                gameState: { ballsPerInnings, betMode: mode, minBet: data.minBet ?? null },
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
                    ballsPerInnings,
                    betMode: mode,
                    minBet: data.minBet ?? null,
                    createdAt: Date.now(),
                    private: false,
                });
                socket.emit(HC_EVENTS.MATCH_CREATED, { matchId });
                log.info('random match created', { matchId, host: userId, stake: stakeAmount, ballsPerInnings });
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
                    ballsPerInnings,
                    betMode: mode,
                    minBet: data.minBet ?? null,
                    createdAt: Date.now(),
                    private: true,
                });
                socket.emit(HC_EVENTS.MATCH_CREATED, { matchId, roomCode: code });
                log.info('friends match created', { matchId, host: userId, code, stake: stakeAmount });
            }
        }
        catch (err) {
            log.error('create_match error', { userId, err });
            socket.emit(HC_EVENTS.ERROR, { message: 'Failed to create match' });
        }
    });
    // --- JOIN_MATCH ---
    socket.on(HC_EVENTS.JOIN_MATCH, async (data) => {
        try {
            let matchId;
            let usedRoomCode;
            if (data.roomCode) {
                usedRoomCode = data.roomCode.toUpperCase();
                matchId = roomCodes.get(usedRoomCode);
                if (!matchId) {
                    socket.emit(HC_EVENTS.ERROR, { message: 'Invalid room code' });
                    return;
                }
            }
            else if (data.matchId) {
                matchId = data.matchId;
            }
            if (!matchId) {
                socket.emit(HC_EVENTS.ERROR, { message: 'No match specified' });
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
                    broadcastToMatch(activeMatch, HC_EVENTS.OPPONENT_RECONNECTED, { userId });
                }
                socket.emit(HC_EVENTS.MATCH_STATE, { state: activeMatch.state, message: 'Reconnected' });
                return;
            }
            // New join
            const dbMatch = await prisma.match.findUnique({
                where: { id: matchId },
                include: { participants: true },
            });
            if (!dbMatch || dbMatch.gameType !== 'hand-cricket') {
                socket.emit(HC_EVENTS.ERROR, { message: 'Match not found' });
                return;
            }
            if (dbMatch.status !== 'open') {
                socket.emit(HC_EVENTS.ERROR, { message: 'Match already started or finished' });
                return;
            }
            const alreadyParticipant = dbMatch.participants.some((p) => p.userId === userId);
            if (alreadyParticipant) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Already in this match' });
                return;
            }
            if (dbMatch.participants.length >= 2) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Match is full' });
                return;
            }
            const gs = (dbMatch.gameState ?? {});
            const ballsPerInnings = gs.ballsPerInnings ?? 6;
            const stakeAmount = publicMatches.get(matchId)?.stake ?? 0.1;
            const betMode = gs.betMode ?? 'fixed';
            const stakeDecimal = new Decimal(stakeAmount);
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
            const socketIds = {};
            if (hostSocketId)
                socketIds[playerIds[0]] = hostSocketId;
            socketIds[userId] = socket.id;
            await beginMatch(matchId, playerIds, { ballsPerInnings, betMode, minBet: gs.minBet ?? null, stake: stakeAmount }, socketIds);
            log.info('match joined', { matchId, playerIds, stake: stakeAmount });
        }
        catch (err) {
            log.error('join_match error', { userId, err });
            socket.emit(HC_EVENTS.ERROR, { message: 'Failed to join match' });
        }
    });
    // --- PICK_NUMBER: player submits their 1-6 pick for the ball in progress ---
    socket.on(HC_EVENTS.PICK_NUMBER, async (data) => {
        try {
            const matchId = socketToMatch.get(socket.id);
            if (!matchId) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Not in a match' });
                return;
            }
            const match = matches.get(matchId);
            if (!match) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Match not active' });
                return;
            }
            if (match.state.phase === 'match_over') {
                socket.emit(HC_EVENTS.ERROR, { message: 'Match is over' });
                return;
            }
            if (!match.state.pendingBall) {
                socket.emit(HC_EVENTS.ERROR, { message: 'No ball in progress' });
                return;
            }
            const innings = currentInnings(match.state);
            if (!innings || (userId !== innings.batterId && userId !== innings.bowlerId)) {
                socket.emit(HC_EVENTS.ERROR, { message: 'You are not in this match' });
                return;
            }
            const pick = data.pick;
            if (pick === undefined || pick === null || !Number.isInteger(pick) || pick < 1 || pick > 6) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Pick must be a number 1-6' });
                return;
            }
            if (match.state.pendingBall.picks[userId] !== undefined) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Pick already submitted for this ball' });
                return;
            }
            match.state = submitPick(match.state, userId, pick);
            // Never broadcast the picked value — it must stay hidden until both
            // players have picked, otherwise the second mover has a decisive edge.
            socket.emit(HC_EVENTS.MATCH_STATE, { picked: true });
            if (!bothPicksIn(match.state))
                return;
            if (match.timers.ball) {
                clearTimeout(match.timers.ball);
                match.timers.ball = null;
            }
            const resolved = resolveBall(match.state);
            if (!resolved)
                return;
            match.state = resolved.state;
            broadcastToMatch(match, HC_EVENTS.BALL_RESULT, {
                ...resolved.ballResult,
                batterId: innings.batterId,
                bowlerId: innings.bowlerId,
                totalRuns: match.state.innings[match.state.currentInningsIndex]?.runs,
            });
            afterBallResolved(match);
        }
        catch (err) {
            log.error('pick_number error', { userId, err });
            socket.emit(HC_EVENTS.ERROR, { message: 'Failed to submit pick' });
        }
    });
    // --- REMATCH_REQUEST ---
    socket.on(HC_EVENTS.REMATCH_REQUEST, async (data) => {
        try {
            const matchId = data.matchId;
            if (!matchId) {
                socket.emit(HC_EVENTS.ERROR, { message: 'No match specified' });
                return;
            }
            const pending = pendingRematches.get(matchId);
            if (!pending || !pending.playerIds.includes(userId)) {
                socket.emit(HC_EVENTS.ERROR, { message: 'Rematch is no longer available.' });
                return;
            }
            pending.socketIds[userId] = socket.id;
            pending.confirmed.add(userId);
            const otherId = pending.playerIds.find((id) => id !== userId);
            if (pending.confirmed.size < 2) {
                socket.emit(HC_EVENTS.REMATCH_WAITING, { matchId });
                const otherSocketId = pending.socketIds[otherId];
                if (otherSocketId) {
                    getIoRef()?.to(otherSocketId).emit(HC_EVENTS.REMATCH_OFFERED, { matchId });
                }
                return;
            }
            // Both confirmed — start rematch
            clearTimeout(pending.expiry);
            pendingRematches.delete(matchId);
            const newMatchId = await escrow.createMatch({
                gameType: 'hand-cricket',
                mode: 'pooled',
                gameState: {
                    ballsPerInnings: pending.settings.ballsPerInnings,
                    betMode: pending.settings.betMode,
                    minBet: pending.settings.minBet,
                },
            });
            try {
                const stakeDecimal = new Decimal(pending.settings.stake);
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
                        getIoRef()?.to(sid).emit(HC_EVENTS.ERROR, {
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
            socket.emit(HC_EVENTS.ERROR, { message: 'Failed to start rematch' });
        }
    });
    // --- DISCONNECT ---
    socket.on('disconnect', async () => {
        try {
            // Listing grace period for hosts.
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
            delete match.socketIds[userId];
            socketToMatch.delete(socket.id);
            match.state = markDisconnected(match.state, userId);
            broadcastToMatch(match, HC_EVENTS.OPPONENT_DISCONNECTED, { userId });
            const forfeitResult = await escrow.forfeitPlayer(matchId, userId);
            if (forfeitResult.outcome === 'forfeited') {
                const { state: newState, lifeLost, gameOver, winnerId } = decrementLife(match.state, userId);
                match.state = newState;
                if (lifeLost) {
                    broadcastToMatch(match, HC_EVENTS.LIVES_UPDATE, { userId, lives: match.state.lives[userId] });
                }
                if (gameOver) {
                    if (winnerId) {
                        await settleMatch(match, [winnerId], [1], { forfeited: true });
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