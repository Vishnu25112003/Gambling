import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { asyncHandler } from '../lib/errors.js';
import { toAmountString } from '../lib/money.js';
import { toLedgerRow } from '../lib/ledgerRow.js';
import { RAKEBACK_TIERS } from './constants.js';
import { rakebackBpsFor } from './accrueRakeback.js';
import { claimRakeback } from './claimRakeback.js';

export const rewardsRouter = Router();

/**
 * GET /api/rewards/me — everything the Rewards page renders for rakeback:
 * the unclaimed amount, the player's current rate, the tier table and their
 * recent claims (the ledger's 'rakeback' rows are the claim history).
 */
rewardsRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const [user, claims] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { rakebackUnclaimed: true, totalWagered: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { userId, type: 'rakeback', status: 'confirmed' },
        orderBy: { timestamp: 'desc' },
        take: 5,
      }),
    ]);

    res.json({
      unclaimed: toAmountString(user.rakebackUnclaimed),
      rateBps: rakebackBpsFor(user.totalWagered),
      tiers: RAKEBACK_TIERS.map((t) => ({ minWagered: t.minWagered, bps: t.bps })),
      claims: claims.map(toLedgerRow),
    });
  }),
);

/** POST /api/rewards/claim — claim all accrued rakeback into the playable balance. */
rewardsRouter.post(
  '/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await claimRakeback(req.user!.id));
  }),
);
