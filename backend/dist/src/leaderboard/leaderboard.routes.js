import { Router } from 'express';
import { prisma } from '../config/db.js';
import { optionalAuth } from '../auth/authMiddleware.js';
import { asyncHandler } from '../lib/errors.js';
import { shortAddress, userHandle, userLabel } from '../lib/user.js';
import { tierFor } from '../profile/tiers.js';
import { toAmountString } from '../lib/money.js';
export const leaderboardRouter = Router();
/**
 * GET /api/leaderboard?limit=n
 *
 * Public by doc 06 — visible without connecting a wallet, on both the landing
 * teaser and the dashboard. `optionalAuth` is here only so a signed-in visitor
 * gets their own row marked `isYou`, never to gate access.
 */
leaderboardRouter.get('/', optionalAuth, asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const top = await prisma.user.findMany({
        where: { gamesPlayed: { gt: 0 } },
        orderBy: [{ netProfit: 'desc' }, { totalWagered: 'desc' }],
        take: limit,
        select: {
            id: true,
            walletAddress: true,
            username: true,
            avatarUrl: true,
            netProfit: true,
            totalWagered: true,
            gamesPlayed: true,
            gamesWon: true,
        },
    });
    const me = req.userId;
    res.json({
        entries: top.map((u, i) => ({
            rank: i + 1,
            // Never expose a full wallet address on a public board.
            name: userLabel(u),
            /** Doc 11 — what /dashboard/u/:handle needs to link this row to a profile. */
            handle: userHandle(u),
            /** Doc 11 — derived from totalWagered, which is already selected here. */
            tier: tierFor(u.totalWagered),
            avatarUrl: u.avatarUrl,
            /** Doc 11 — the avatar gradient seed, and never the full address. */
            walletShort: shortAddress(u.walletAddress),
            netProfit: toAmountString(u.netProfit),
            totalWagered: toAmountString(u.totalWagered),
            gamesPlayed: u.gamesPlayed,
            gamesWon: u.gamesWon,
            isYou: me ? u.id === me : false,
        })),
    });
}));
//# sourceMappingURL=leaderboard.routes.js.map