import { Router } from 'express';
import { z } from 'zod';
import {
  createChallenge,
  consumeChallenge,
  findOrCreateUser,
  verifySignature,
} from './walletAuth.js';
import { issueToken } from './jwt.js';
import { requireAuth } from './authMiddleware.js';
import { prisma } from '../config/db.js';
import { asyncHandler, badRequest, unauthorized } from '../lib/errors.js';
import { publicUser } from '../lib/user.js';
import { bindReferral } from '../referral/bindReferral.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('auth');
export const authRouter = Router();

const challengeBody = z.object({
  walletAddress: z.string().min(32).max(64),
});

/**
 * POST /api/auth/challenge
 * Step 1 — issue a one-time message for the wallet to sign.
 */
authRouter.post(
  '/challenge',
  asyncHandler(async (req, res) => {
    const parsed = challengeBody.safeParse(req.body);
    if (!parsed.success) throw badRequest('walletAddress is required.');

    const challenge = await createChallenge(parsed.data.walletAddress);
    res.json({
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  }),
);

const verifyBody = z.object({
  walletAddress: z.string().min(32).max(64),
  nonce: z.string().min(8),
  signature: z.string().min(32), // base58 ed25519 signature
  /** Doc 09 — captured from `?ref=` on the landing page. Optional, never trusted. */
  referralCode: z.string().trim().min(4).max(16).optional(),
});

/**
 * POST /api/auth/verify
 * Steps 2-5 — redeem the nonce, verify the signature, find-or-create the user,
 * issue the session token.
 */
authRouter.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const parsed = verifyBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('walletAddress, nonce and signature are all required.');
    }
    const { walletAddress, nonce, signature, referralCode } = parsed.data;

    // Claim the nonce FIRST. Even a forged signature burns the challenge, so a
    // captured nonce cannot be ground against repeatedly.
    const message = await consumeChallenge(nonce, walletAddress);

    if (!verifySignature(message, signature, walletAddress)) {
      log.warn('signature verification failed', { walletAddress });
      throw unauthorized('Signature does not match that wallet address.');
    }

    const { user, isNew } = await findOrCreateUser(walletAddress);
    const token = issueToken(user.id, user.walletAddress);

    log.info(isNew ? 'new user created' : 'user signed in', { walletAddress });

    /**
     * Doc 09 — apply a captured invite code.
     *
     * Attempted for ANY eligible caller, not only `isNew`. One path then covers
     * both a fresh signup and someone who connected a wallet earlier but has not
     * played yet; `bindReferral` owns the eligibility rules either way.
     *
     * A failure here must never cost someone their sign-in — a stale code in
     * localStorage, a self-referral, an already-bound account are all ordinary
     * and none of them are a reason to reject a valid signature.
     */
    let referralApplied = false;
    if (referralCode) {
      try {
        await bindReferral(user.id, referralCode);
        referralApplied = true;
      } catch (err) {
        log.warn('invite code not applied', {
          walletAddress,
          reason: (err as Error).message,
        });
      }
    }

    res.json({ token, isNewUser: isNew, referralApplied, user: publicUser(user) });
  }),
);

/**
 * GET /api/auth/me
 * Used on page load to restore a session from a stored token.
 */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user!) });
  }),
);

const profileBody = z.object({
  displayName: z.string().trim().min(2).max(32).nullable(),
});

/** PATCH /api/auth/me — the only mutable profile field for now. */
authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) throw badRequest('displayName must be 2-32 characters, or null.');

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { displayName: parsed.data.displayName },
    });

    res.json({ user: { id: user.id, displayName: user.displayName } });
  }),
);
