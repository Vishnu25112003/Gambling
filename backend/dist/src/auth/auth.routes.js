import { Router } from 'express';
import { z } from 'zod';
import { createChallenge, consumeChallenge, findOrCreateUser, verifySignature, } from './walletAuth.js';
import { issueToken } from './jwt.js';
import { requireAuth } from './authMiddleware.js';
import { prisma } from '../config/db.js';
import { asyncHandler, badRequest, conflict, unauthorized } from '../lib/errors.js';
import { publicUser } from '../lib/user.js';
import { bindReferral } from '../referral/bindReferral.js';
import { avatarUpload, removeAvatar, saveAvatar } from '../profile/avatarStore.js';
import { parseUsername } from '../profile/username.js';
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
authRouter.post('/challenge', asyncHandler(async (req, res) => {
    const parsed = challengeBody.safeParse(req.body);
    if (!parsed.success)
        throw badRequest('walletAddress is required.');
    const challenge = await createChallenge(parsed.data.walletAddress);
    res.json({
        nonce: challenge.nonce,
        message: challenge.message,
        expiresAt: challenge.expiresAt.toISOString(),
    });
}));
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
authRouter.post('/verify', asyncHandler(async (req, res) => {
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
        }
        catch (err) {
            log.warn('invite code not applied', {
                walletAddress,
                reason: err.message,
            });
        }
    }
    res.json({ token, isNewUser: isNew, referralApplied, user: publicUser(user) });
}));
/**
 * GET /api/auth/me
 * Used on page load to restore a session from a stored token.
 */
authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
}));
/** Doc 11 — the single mutable identity field. `null` clears it. */
const profileBody = z.object({
    username: z.string().trim().min(3).max(20).nullable(),
});
/** PATCH /api/auth/me — the player's name / public handle. */
authRouter.patch('/me', requireAuth, asyncHandler(async (req, res) => {
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
        throw badRequest('username must be 3-20 characters, or null to clear it.');
    }
    const { username } = parsed.data;
    // parseUsername normalises to lowercase and rejects reserved handles.
    const data = { username: username === null ? null : parseUsername(username) };
    let user;
    try {
        user = await prisma.user.update({ where: { id: req.user.id }, data });
    }
    catch (err) {
        /**
         * P2002 is the unique index on `username` firing. The availability check on
         * the form cannot prevent this — two players can pass it in the same instant
         * and only one can win the write — so the index is the real guard and this
         * is how its verdict reaches the loser as something readable.
         */
        if (err.code === 'P2002') {
            throw conflict('That username is already taken.');
        }
        throw err;
    }
    res.json({ user: { id: user.id, username: user.username } });
}));
/**
 * POST /api/auth/me/avatar — multipart/form-data, one file in an `avatar` field.
 *
 * The upload machinery lives in `profile/avatarStore.ts`; this route only ties it
 * to a session. Note the file is named after `req.user!.id` in there and never
 * after anything the client sent.
 */
authRouter.post('/me/avatar', requireAuth, avatarUpload, asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file?.buffer?.length)
        throw badRequest('Attach an image in an "avatar" field.');
    const avatarUrl = await saveAvatar(req.user.id, file.buffer, req.user.avatarUrl);
    const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { avatarUrl },
    });
    res.json({ user: { id: user.id, avatarUrl: user.avatarUrl } });
}));
/** DELETE /api/auth/me/avatar — back to the gradient generated from the wallet. */
authRouter.delete('/me/avatar', requireAuth, asyncHandler(async (req, res) => {
    await removeAvatar(req.user.id);
    const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { avatarUrl: null },
    });
    res.json({ user: { id: user.id, avatarUrl: user.avatarUrl } });
}));
//# sourceMappingURL=auth.routes.js.map