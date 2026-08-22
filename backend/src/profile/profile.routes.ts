import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { optionalAuth, requireAuth } from '../auth/authMiddleware.js';
import { asyncHandler, badRequest, notFound } from '../lib/errors.js';
import { publicProfile, userHandle } from '../lib/user.js';
import { tierProgress } from './tiers.js';
import { dailyNet, lifetimeStats, perGameStats } from './stats.js';
import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT, matchHistory } from './history.js';
import {
  isUsernameAvailable,
  isReservedUsername,
  isValidUsername,
  normaliseUsername,
} from './username.js';

export const profileRouter = Router();

/** How many days the profit curve covers. */
const CURVE_DAYS = 30;

/** The columns `publicProfile` needs, in one place so the two routes can't drift. */
const PROFILE_SELECT = {
  id: true,
  walletAddress: true,
  username: true,
  avatarUrl: true,
  totalWagered: true,
  netProfit: true,
  gamesPlayed: true,
  gamesWon: true,
  createdAt: true,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a `:handle` to a user id.
 *
 * Username first, then the internal id — matching `userHandle()`. A wallet address
 * is deliberately not accepted: publishing full addresses in URLs is exactly what
 * the leaderboard's `shortAddress` call avoids.
 */
async function resolveHandle(handle: string): Promise<string> {
  const candidate = normaliseUsername(handle);

  if (isValidUsername(candidate)) {
    const byName = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (byName) return byName.id;
  }

  if (UUID.test(handle)) {
    const byId = await prisma.user.findUnique({ where: { id: handle }, select: { id: true } });
    if (byId) return byId.id;
  }

  throw notFound('No player with that profile.');
}

const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT),
});

function parsePaging(query: unknown): { page: number; limit: number } {
  const parsed = pageQuery.safeParse(query);
  if (!parsed.success) {
    throw badRequest(`page must be a positive integer and limit at most ${HISTORY_MAX_LIMIT}.`);
  }
  return parsed.data;
}

/**
 * GET /api/profile/me
 * Everything the player's own profile page renders, in one call — the same
 * one-request-per-page shape as `GET /api/referrals/me`.
 */
profileRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;

    const [stats, perGame, curve] = await Promise.all([
      lifetimeStats(user.id),
      perGameStats(user.id),
      dailyNet(user.id, CURVE_DAYS),
    ]);

    res.json({
      isYou: true,
      identity: {
        handle: userHandle(user),
        username: user.username,
        avatarUrl: user.avatarUrl,
        /** Own profile only — the full address is the player's own to see. */
        walletAddress: user.walletAddress,
        joinedAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
      tier: tierProgress(user.totalWagered),
      stats,
      perGame,
      curve,
    });
  }),
);

/**
 * GET /api/profile/me/history
 * Registered BEFORE `/:handle/history`, or Express would match "me" as a handle.
 */
profileRouter.get(
  '/me/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePaging(req.query);
    res.json(await matchHistory(req.user!.id, page, limit));
  }),
);

/**
 * GET /api/profile/username/check?u=name
 *
 * ADVISORY. Two players can both be told "available" for the same handle at the
 * same instant; the unique index decides, and `PATCH /auth/me` returns a 409 to
 * whoever loses. This exists so the form can warn before Save, not to make the
 * write safe.
 *
 * Under `/username/` rather than `/:handle/...` so it cannot collide with a real
 * handle, and behind `requireAuth` so it is not a free enumeration oracle for
 * which handles exist.
 */
profileRouter.get(
  '/username/check',
  requireAuth,
  asyncHandler(async (req, res) => {
    const raw = typeof req.query.u === 'string' ? req.query.u : '';
    const username = normaliseUsername(raw);

    if (!isValidUsername(username)) {
      res.json({
        username,
        available: false,
        reason: 'Use 3-20 lowercase letters, numbers or underscores.',
      });
      return;
    }
    if (isReservedUsername(username)) {
      res.json({ username, available: false, reason: 'That username is reserved.' });
      return;
    }

    const available = await isUsernameAvailable(username, req.user!.id);
    res.json({
      username,
      available,
      reason: available ? null : 'That username is already taken.',
    });
  }),
);

/**
 * GET /api/profile/:handle
 *
 * Public — a profile is readable without a wallet, the same call doc 06 makes for
 * the games list and the leaderboard. `optionalAuth` is here ONLY so a signed-in
 * visitor's own profile is marked `isYou`, never to gate.
 */
profileRouter.get(
  '/:handle',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = await resolveHandle(String(req.params.handle ?? ''));

    const [user, stats, perGame, curve] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PROFILE_SELECT }),
      lifetimeStats(userId),
      perGameStats(userId),
      dailyNet(userId, CURVE_DAYS),
    ]);

    /**
     * Deposits and withdrawals are WALLET facts, not a playing record, and a
     * stranger has no business seeing how much money somebody has moved. Stripped
     * here rather than in a second query so there is only one stats code path.
     */
    const { totalDeposited: _d, totalWithdrawn: _w, ...publicStats } = stats;

    res.json({
      isYou: req.userId === userId,
      identity: publicProfile(user),
      tier: tierProgress(user.totalWagered),
      stats: publicStats,
      perGame,
      curve,
    });
  }),
);

/** GET /api/profile/:handle/history — public, same paging as the private route. */
profileRouter.get(
  '/:handle/history',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = await resolveHandle(String(req.params.handle ?? ''));
    const { page, limit } = parsePaging(req.query);
    res.json(await matchHistory(userId, page, limit));
  }),
);
