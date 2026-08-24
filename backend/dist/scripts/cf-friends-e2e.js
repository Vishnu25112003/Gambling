/**
 * Manual end-to-end check of Coin Flip "Friends Play".
 *
 *   host   → cf:create { discovery: 'friends' }   expects cf:created WITH a roomCode
 *   friend → cf:join   { roomCode }               expects BOTH sides to reach cf:round:start
 *
 * Run against a live backend:  npx tsx scripts/cf-friends-e2e.ts
 */
import { io } from 'socket.io-client';
import { prisma } from '../src/config/db.js';
import { issueToken } from '../src/auth/jwt.js';
const URL = process.env.E2E_URL ?? 'http://localhost:4000';
const STAKE = 0.1;
const ROUNDS = 3;
function ok(label) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
function fail(label) { console.log(`  \x1b[31m✗ ${label}\x1b[0m`); process.exit(1); }
/** Resolve once `event` arrives, or reject after `ms`. */
function waitFor(s, event, ms = 8000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
        s.once(event, (payload) => { clearTimeout(t); resolve(payload); });
    });
}
async function seedUser(tag) {
    const walletAddress = `E2E_${tag}_${process.pid}`;
    // username must satisfy the DB shape CHECK: lowercase letters/digits/underscore, <=20 chars.
    const username = `e2e_${tag}_${process.pid}`.toLowerCase().slice(0, 20);
    const user = await prisma.user.create({
        data: { walletAddress, username, availableBalance: 5 },
        select: { id: true, walletAddress: true },
    });
    return { ...user, token: issueToken(user.id, user.walletAddress) };
}
function connect(token) {
    const s = io(URL, { auth: { token }, transports: ['websocket'] });
    return new Promise((resolve, reject) => {
        s.once('connect', () => resolve(s));
        s.once('connect_error', reject);
    });
}
async function main() {
    console.log('\nCoin Flip — Friends Play end-to-end\n');
    const host = await seedUser('host');
    const friend = await seedUser('friend');
    const outsider = await seedUser('outsider');
    const hs = await connect(host.token);
    const fs = await connect(friend.token);
    const os = await connect(outsider.token);
    ok('three authenticated sockets connected');
    // Surface any server-side error immediately instead of hanging on a timeout.
    for (const [name, s] of [['host', hs], ['friend', fs]]) {
        s.on('cf:error', (e) => console.log(`  \x1b[33m! ${name} cf:error: ${e.message}\x1b[0m`));
    }
    // --- Step 1: host walks the create flow and publishes a Friends match ---
    const created = waitFor(hs, 'cf:created');
    hs.emit('cf:create', {
        gameType: 'coin-flip',
        discovery: 'friends',
        rounds: ROUNDS,
        betMode: 'fixed',
        stake: STAKE,
    });
    const c = await created;
    if (!c.matchId)
        fail('cf:created carried no matchId');
    ok(`match created: ${c.matchId}`);
    if (!c.roomCode)
        fail('cf:created carried NO roomCode — Friends Play is broken');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(c.roomCode))
        fail(`roomCode "${c.roomCode}" is not a valid 6-char code`);
    ok(`room code generated: ${c.roomCode}`);
    // --- Step 2: a Friends match must NOT appear in the public lobby ---
    const listed = waitFor(os, 'cf:matches');
    os.emit('cf:list', { gameType: 'coin-flip' });
    const l = await listed;
    if (l.matches.some((m) => m.matchId === c.matchId))
        fail('private Friends match leaked into the public lobby list');
    ok('private match is hidden from the public lobby');
    // --- Step 3: a wrong code is rejected, and does NOT burn the real one ---
    const badJoin = waitFor(fs, 'cf:error');
    fs.emit('cf:join', { roomCode: 'ZZZZZZ' });
    const bad = await badJoin;
    if (!/invalid room code/i.test(bad.message))
        fail(`unexpected error for a bad code: ${bad.message}`);
    ok('invalid room code rejected');
    // --- Step 4: the friend joins with the real code; BOTH sides must start ---
    const hostRound = waitFor(hs, 'cf:round:start');
    const friendRound = waitFor(fs, 'cf:round:start');
    fs.emit('cf:join', { roomCode: c.roomCode.toLowerCase() }); // case-insensitive on purpose
    const [hr, fr] = await Promise.all([hostRound, friendRound]);
    ok('friend joined by room code');
    ok(`host   received cf:round:start (round ${hr.roundNumber}/${hr.totalRounds})`);
    ok(`friend received cf:round:start (round ${fr.roundNumber}/${fr.totalRounds})`);
    if (hr.spinnerId !== fr.spinnerId)
        fail('the two clients disagree on who spins');
    const spinnerIsAPlayer = hr.spinnerId === host.id || hr.spinnerId === friend.id;
    if (!spinnerIsAPlayer)
        fail('spinner is not one of the two players');
    ok(`seats agreed — spinner is the ${hr.spinnerId === host.id ? 'host' : 'friend'}`);
    // --- Step 5: stakes actually locked ---
    const balances = await prisma.user.findMany({
        where: { id: { in: [host.id, friend.id] } },
        select: { id: true, availableBalance: true, lockedBalance: true },
    });
    for (const b of balances) {
        if (Number(b.lockedBalance) !== STAKE)
            fail(`stake not locked for ${b.id} (locked=${b.lockedBalance})`);
    }
    ok(`both stakes locked (${STAKE} SOL each)`);
    // --- Step 6: the code is retired once the room is full ---
    const reuse = waitFor(os, 'cf:error');
    os.emit('cf:join', { roomCode: c.roomCode });
    const r = await reuse;
    if (!/invalid room code/i.test(r.message))
        fail(`a used room code was not retired: got "${r.message}"`);
    ok('used room code is retired');
    console.log('\n\x1b[32mFriends Play flow works end to end.\x1b[0m\n');
    hs.disconnect();
    fs.disconnect();
    os.disconnect();
    await new Promise((r) => setTimeout(r, 500));
    await cleanup([host.id, friend.id, outsider.id], c.matchId);
    process.exit(0);
}
async function cleanup(userIds, matchId) {
    if (matchId) {
        await prisma.$executeRaw `DELETE FROM coin_flip_rounds WHERE "matchId" = ${matchId}::uuid`;
    }
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.matchParticipant.deleteMany({ where: { userId: { in: userIds } } });
    if (matchId)
        await prisma.match.deleteMany({ where: { id: matchId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
main().catch(async (err) => {
    console.error('\n\x1b[31mFAILED:\x1b[0m', err.message ?? err, '\n');
    process.exit(1);
});
//# sourceMappingURL=cf-friends-e2e.js.map