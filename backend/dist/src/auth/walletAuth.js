import { randomBytes } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { isValidPublicKey } from '../config/solana.js';
import { generateCode } from '../referral/referralCode.js';
/**
 * Sign-In-With-Solana style message. Human-readable on purpose — the user sees
 * this text in their Phantom/Solflare popup and should be able to understand
 * what they are approving.
 */
function buildMessage(walletAddress, nonce, issuedAt) {
    return [
        `${env.SIWS_DOMAIN} wants you to sign in with your Solana account:`,
        walletAddress,
        '',
        'Sign this message to prove you own this wallet. This is free and will not',
        'create a transaction or move any funds.',
        '',
        `URI: ${env.SIWS_DOMAIN}`,
        'Version: 1',
        `Chain: solana:${env.SOLANA_CLUSTER}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
    ].join('\n');
}
/** Step 1 of the flow — hand the wallet something to sign. */
export async function createChallenge(walletAddress) {
    if (!isValidPublicKey(walletAddress)) {
        throw badRequest('That is not a valid Solana wallet address.');
    }
    const nonce = bs58.encode(randomBytes(32));
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + env.AUTH_NONCE_TTL_SECONDS * 1_000);
    const message = buildMessage(walletAddress, nonce, issuedAt);
    await prisma.authNonce.create({
        data: { nonce, walletAddress, message, expiresAt, createdAt: issuedAt },
    });
    return { nonce, message, expiresAt };
}
/** Ed25519 signature check. Pure — no database, no side effects. */
export function verifySignature(message, signatureBase58, walletAddress) {
    try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signatureBase58);
        const publicKeyBytes = new PublicKey(walletAddress).toBytes();
        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    }
    catch {
        return false;
    }
}
/**
 * Step 2 — redeem a challenge.
 *
 * `updateMany` with `usedAt: null` in the WHERE clause compiles to a single
 * conditional UPDATE. Two simultaneous requests carrying the same signature race
 * on the row and exactly one wins; the loser sees a count of 0 and is rejected.
 * That is the replay defence.
 */
export async function consumeChallenge(nonce, walletAddress) {
    const claimed = await prisma.authNonce.updateMany({
        where: { nonce, walletAddress, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
        throw unauthorized('Sign-in challenge is invalid, expired, or already used. Please retry.');
    }
    const row = await prisma.authNonce.findUnique({ where: { nonce } });
    if (!row)
        throw unauthorized('Sign-in challenge is no longer available. Please retry.');
    return row.message;
}
/** Step 3 — find the user for this wallet, or create them on first sign-in. */
export async function findOrCreateUser(walletAddress) {
    const existing = await prisma.user.findUnique({ where: { walletAddress } });
    if (existing) {
        const user = await prisma.user.update({
            where: { id: existing.id },
            data: { lastLogin: new Date() },
        });
        return { user, isNew: false };
    }
    /**
     * The retry loop covers the second unique column doc 09 added. A P2002 here
     * now means one of two different things:
     *   - `walletAddress` — two first-time sign-ins raced, and the loser should
     *     read back the row the winner created.
     *   - `referralCode` — an astronomically unlikely code collision, which is
     *     fixed simply by drawing another one.
     * Telling them apart by re-reading the wallet is more robust than parsing the
     * driver's error metadata.
     */
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const user = await prisma.user.create({
                // Doc 09 — every account is minted with an invite code, so the Invite &
                // Earn page has something to show the moment they arrive. Accounts that
                // predate doc 09 have NULL here and get one lazily on first read.
                data: { walletAddress, lastLogin: new Date(), referralCode: generateCode() },
            });
            return { user, isNew: true };
        }
        catch (err) {
            if (typeof err === 'object' && err !== null && err.code === 'P2002') {
                const raced = await prisma.user.findUnique({ where: { walletAddress } });
                if (raced)
                    return { user: raced, isNew: false };
                continue; // the code collided, not the wallet — draw again
            }
            throw err;
        }
    }
    throw new Error(`Could not create a user for ${walletAddress} after repeated code collisions`);
}
//# sourceMappingURL=walletAuth.js.map