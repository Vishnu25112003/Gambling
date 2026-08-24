import { extractBearer, verifyToken } from './jwt.js';
import { prisma } from '../config/db.js';
import { unauthorized } from '../lib/errors.js';
/**
 * Doc 01 — route protection.
 *
 * `requireAuth` guards anything that needs an identity: deposit, withdraw, bet
 * placement, profile, history. Public routes (games list, leaderboard, landing
 * data) skip this middleware entirely, per doc 06's gating rules.
 */
export async function requireAuth(req, _res, next) {
    try {
        const token = extractBearer(req.headers.authorization);
        if (!token)
            throw unauthorized('Connect your wallet to continue.');
        const payload = verifyToken(token);
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user)
            throw unauthorized('Account no longer exists.');
        req.user = user;
        req.userId = user.id;
        next();
    }
    catch (err) {
        next(err);
    }
}
/**
 * Attaches the user when a valid token is present, but never rejects. Used by
 * endpoints that show more detail to a signed-in caller (e.g. highlighting
 * "you" in the leaderboard) while staying open to anonymous visitors.
 */
export async function optionalAuth(req, _res, next) {
    try {
        const token = extractBearer(req.headers.authorization);
        if (token) {
            const payload = verifyToken(token);
            const user = await prisma.user.findUnique({ where: { id: payload.sub } });
            if (user) {
                req.user = user;
                req.userId = user.id;
            }
        }
    }
    catch {
        // A bad token on an optional route is simply an anonymous visitor.
    }
    next();
}
/**
 * Socket.IO handshake auth. Same token, same rules — a socket that fails this
 * never joins, so game modules can assume `socket.data.userId` is real.
 */
export async function socketAuth(socket, next) {
    try {
        const raw = socket.handshake.auth?.token ??
            extractBearer(socket.handshake.headers.authorization);
        if (!raw)
            return next(new Error('UNAUTHORIZED: no token'));
        const payload = verifyToken(raw);
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, walletAddress: true },
        });
        if (!user)
            return next(new Error('UNAUTHORIZED: unknown user'));
        socket.data.userId = user.id;
        socket.data.walletAddress = user.walletAddress;
        next();
    }
    catch {
        next(new Error('UNAUTHORIZED: invalid token'));
    }
}
//# sourceMappingURL=authMiddleware.js.map