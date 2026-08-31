/**
 * Deep playthrough of Coin Flip Friends Play: host publishes, friend joins,
 * then BOTH sides actually spin + call through to a settled match, and we
 * assert every round record was persisted to coin_flip_rounds (the bug this
 * guards against was a 23502 on insert that dropped all records).
 *
 *   npx tsx scripts/cf-playthrough-e2e.ts
 */
import { io } from 'socket.io-client';
import { prisma } from '../src/config/db.js';
import { issueToken } from '../src/auth/jwt.js';
const URL = process.env.E2E_URL ?? 'http://localhost:4000';
const STAKE = 0.1;
const ROUNDS = 3;
function ok(l) { console.log(`  \x1b[32m✓\x1b[0m ${l}`); }
function fail(l) { console.log(`  \x1b[31m✗ ${l}\x1b[0m`); process.exit(1); }
function waitFor(s, event, ms = 10000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
        s.once(event, (p) => { clearTimeout(t); resolve(p); });
    });
}
async function seedUser(tag) {
    const walletAddress = `PLAY_${tag}_${process.pid}`;
    const username = `play_${tag}_${process.pid}`.toLowerCase().slice(0, 20);
    const user = await prisma.user.create({ data: { walletAddress, username, availableBalance: 5 } });
    return { ...user, token: issueToken(user.id, user.walletAddress) };
}
function connect(token) {
    const s = io(URL, { auth: { token }, transports: ['websocket'] });
    return new Promise((resolve, reject) => { s.once('connect', () => resolve(s)); s.once('connect_error', reject); });
}
async function main() {
    console.log('\nCoin Flip — Friends Play full playthrough\n');
    const host = await seedUser('host');
    const friend = await seedUser('friend');
    const hs = await connect(host.token);
    const fs = await connect(friend.token);
    ok('two authenticated sockets connected');
    // Step 1: host publishes a Friends match
    const created = waitFor(hs, 'cf:created');
    hs.emit('cf:create', { gameType: 'coin-flip', discovery: 'friends', rounds: ROUNDS, betMode: 'fixed', stake: STAKE });
    const c = await created;
    if (!c.roomCode)
        fail('no room code');
    ok(`friends match published, code ${c.roomCode}`);
    // Step 2: friend joins
    const hostState = waitFor(hs, 'cf:state');
    const friendState = waitFor(fs, 'cf:state');
    fs.emit('cf:join', { roomCode: c.roomCode });
    await Promise.all([hostState, friendState]);
    ok('both joined, round 1 started');
    // Step 3: play rounds until the match result arrives — winner clinches early
    // (best-of-N, first to majority), so we don't assume exactly ROUNDS rounds.
    let settledResult = null;
    const onResult = (r) => { settledResult = r; };
    hs.on('cf:match:result', onResult);
    const settled = new Promise((resolve) => {
        const check = () => { if (settledResult)
            resolve(settledResult);
        else
            setTimeout(check, 50); };
        check();
    });
    for (let roundGuard = 0; roundGuard < ROUNDS; roundGuard++) {
        if (settledResult)
            break;
        const start = await waitFor(hs, 'cf:round:start');
        console.log(`    round ${start.roundNumber}: spinner=${start.spinnerId === host.id ? 'host' : 'friend'}`);
        const spinner = start.spinnerId === host.id ? hs : fs;
        const caller = start.spinnerId === host.id ? fs : hs;
        const callMade = waitFor(caller, 'cf:call:made');
        spinner.emit('cf:spin');
        console.log(`    emitted cf:spin from ${start.spinnerId === host.id ? 'host' : 'friend'}`);
        await waitFor(spinner, 'cf:spin:started'); // caller may only call after spin starts
        caller.emit('cf:call', { call: 'heads' });
        await callMade;
        await waitFor(hs, 'cf:round:result');
        ok(`round ${start.roundNumber} completed`);
        if (settledResult)
            break; // match clinched on this round — no next round
    }
    const result = await settled;
    ok(`match settled after ${result.roundsPlayed} rounds, winner ${result.winnerId === host.id ? 'host' : 'friend'}`);
    // Step 4: assert round records persisted (the bug dropped every row)
    const rows = await prisma.$queryRaw `
    SELECT "roundNumber" FROM coin_flip_rounds WHERE "matchId" = ${c.matchId}::uuid ORDER BY "roundNumber"
  `;
    ok(`coin_flip_rounds rows persisted: ${JSON.stringify(rows.map((r) => r.roundNumber))}`);
    if (rows.length < ROUNDS + 1)
        fail(`expected ${ROUNDS + 1} rows (seat draw + ${ROUNDS} rounds), got ${rows.length}`);
    ok('round records persisted — data-loss bug fixed');
    hs.disconnect();
    fs.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    await cleanup([host.id, friend.id], c.matchId);
    console.log('\n\x1b[32mPlaythrough passed — round records persisted.\x1b[0m\n');
    process.exit(0);
}
async function cleanup(userIds, matchId) {
    if (matchId)
        await prisma.$executeRaw `DELETE FROM coin_flip_rounds WHERE "matchId" = ${matchId}::uuid`;
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.matchParticipant.deleteMany({ where: { userId: { in: userIds } } });
    if (matchId)
        await prisma.match.deleteMany({ where: { id: matchId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
main().catch(async (err) => { console.error('\n\x1b[31mFAILED:\x1b[0m', err.message ?? err, '\n'); process.exit(1); });
//# sourceMappingURL=cf-playthrough-e2e.js.map