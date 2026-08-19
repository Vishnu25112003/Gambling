import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { toAmountString } from '../lib/money.js';
import { shortAddress } from '../lib/user.js';
import { env } from '../config/env.js';
import { bindReferral, referrerLabel } from './bindReferral.js';
import { ensureReferralCode, isPlausibleCode, normaliseCode } from './referralCode.js';
import { REFERRAL_COMMISSION_BPS } from './constants.js';
import { payoutThresholds, qualifiedUserIds } from './payoutEligibility.js';

export const referralRouter = Router();

/**
 * The link a player shares.
 *
 * Built from SIWS_DOMAIN rather than the request's Host header, so a proxied or
 * spoofed Host cannot make us hand a player a link pointing at someone else's
 * site. Local development runs over plain HTTP, and an `https://localhost:5173`
 * link simply fails to open — so the scheme follows the host rather than being
 * hard-coded.
 */
function inviteLink(code: string): string {
  const domain = env.SIWS_DOMAIN.replace(/\/$/, '');
  if (/^https?:\/\//.test(domain)) return `${domain}/?ref=${code}`;

  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(domain);
  return `${isLocal ? 'http' : 'https'}://${domain}/?ref=${code}`;
}

/**
 * GET /api/referrals/me
 * Everything the Invite & Earn page renders, in one call.
 */
referralRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    // Mints a code for accounts that predate doc 09, so the page always has
    // something to show rather than an empty box.
    const code = await ensureReferralCode(userId);

    const [friends, received] = await Promise.all([
      prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          earnedAmount: true,
          createdAt: true,
          earnedAt: true,
          gameType: true,
          referredUserId: true,
          referred: {
            select: { displayName: true, walletAddress: true, totalWagered: true },
          },
        },
      }),
      prisma.referral.findUnique({
        where: { referredUserId: userId },
        select: {
          status: true,
          createdAt: true,
          referrer: { select: { displayName: true, walletAddress: true } },
        },
      }),
    ]);

    const earned = friends.filter((f) => f.status === 'earned');

    /**
     * Doc 09 anti-Sybil — which pending friends have already cleared the
     * deposit/wagering thresholds, so their next win pays out.
     *
     * Deliberately reduced to one boolean per friend. The referrer is told
     * whether the reward is live, never how much their friend deposited or
     * wagered — that is the friend's financial history, and inviting someone
     * does not entitle you to read it.
     */
    const qualified = await qualifiedUserIds(
      prisma,
      friends
        .filter((f) => f.status === 'pending')
        .map((f) => ({ id: f.referredUserId, totalWagered: f.referred.totalWagered })),
    );

    const { minDeposit, minWagered } = payoutThresholds();
    const totalEarned = earned.reduce(
      (acc, f) => acc + Number(toAmountString(f.earnedAmount)),
      0,
    );

    res.json({
      code,
      link: inviteLink(code),
      commissionBps: REFERRAL_COMMISSION_BPS,
      /**
       * The activity an invited friend must reach before a commission is paid.
       * Sent so the page can state the rule up front rather than leaving a
       * referrer wondering why a win paid nothing.
       */
      payoutRequirements: {
        minDeposit: toAmountString(minDeposit),
        minWagered: toAmountString(minWagered),
      },
      stats: {
        invited: friends.length,
        pending: friends.length - earned.length,
        earned: earned.length,
        // Summed here only to be displayed. Every individual amount below is an
        // exact string; this total is derived from them and never written back
        // to a balance.
        totalEarned: totalEarned.toFixed(9),
      },
      /** An invite code can still be applied — no referrer yet, and no games played. */
      canEnterCode: !received && req.user!.gamesPlayed === 0,
      referredBy: received
        ? { name: referrerLabel(received.referrer), joinedAt: received.createdAt }
        : null,
      friends: friends.map((f) => ({
        id: f.id,
        name: f.referred.displayName ?? shortAddress(f.referred.walletAddress),
        status: f.status,
        earned: toAmountString(f.earnedAmount),
        joinedAt: f.createdAt,
        earnedAt: f.earnedAt,
        gameType: f.gameType,
        /** Thresholds cleared — the next win this friend takes pays out. */
        unlocked: f.status === 'earned' || qualified.has(f.referredUserId),
      })),
    });
  }),
);

const claimBody = z.object({ code: z.string().trim().min(4).max(16) });

/**
 * POST /api/referrals/claim
 * The fallback path for someone who signed up without clicking an invite link.
 * `bindReferral` owns the eligibility rules and throws the specific conflict.
 */
referralRouter.post(
  '/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = claimBody.safeParse(req.body);
    if (!parsed.success) throw badRequest('An invite code is required.');

    const result = await bindReferral(req.user!.id, parsed.data.code);
    res.json({ referredBy: { name: result.referrerName }, commissionBps: result.commissionBps });
  }),
);

/**
 * GET /api/referrals/code/:code
 * Public — lets the landing page confirm an invite link actually resolved,
 * before the visitor has any identity. Returns only a display label, never the
 * referrer's id or full wallet address.
 */
referralRouter.get(
  '/code/:code',
  asyncHandler(async (req, res) => {
    const code = normaliseCode(String(req.params.code ?? ''));
    if (!isPlausibleCode(code)) {
      res.json({ valid: false, referrerName: null });
      return;
    }

    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { displayName: true, walletAddress: true },
    });

    res.json({
      valid: Boolean(referrer),
      referrerName: referrer ? referrerLabel(referrer) : null,
      commissionBps: REFERRAL_COMMISSION_BPS,
    });
  }),
);
