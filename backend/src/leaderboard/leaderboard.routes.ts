import { Router } from 'express';
import { prisma } from '../config/db.js';
import { optionalAuth } from '../auth/authMiddleware.js';
import { asyncHandler } from '../lib/errors.js';
import { shortAddress } from '../lib/user.js';
import { toAmountString } from '../lib/money.js';

export const leaderboardRouter = Router();

/**
 * GET /api/leaderboard?limit=n
 *
 * Public by doc 06 — visible without connecting a wallet, on both the landing
 * teaser and the dashboard. `optionalAuth` is here only so a signed-in visitor
 * gets their own row marked `isYou`, never to gate access.
 */
leaderboardRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const top = await prisma.user.findMany({
      where: { gamesPlayed: { gt: 0 } },
      orderBy: [{ netProfit: 'desc' }, { totalWagered: 'desc' }],
      take: limit,
      select: {
        id: true,
        walletAddress: true,
        displayName: true,
        netProfit: true,
        totalWagered: true,
        gamesPlayed: true,
      },
    });

    const me = req.userId;

    res.json({
      entries: top.map((u, i) => ({
        rank: i + 1,
        // Never expose a full wallet address on a public board.
        name: u.displayName || shortAddress(u.walletAddress),
        netProfit: toAmountString(u.netProfit),
        totalWagered: toAmountString(u.totalWagered),
        gamesPlayed: u.gamesPlayed,
        isYou: me ? u.id === me : false,
      })),
    });
  }),
);
