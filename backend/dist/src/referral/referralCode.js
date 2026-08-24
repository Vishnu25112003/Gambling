import { randomBytes } from 'node:crypto';
import { prisma } from '../config/db.js';
import { CODE_ALPHABET, REFERRAL_CODE_LENGTH } from './constants.js';
/**
 * Doc 09 — minting and normalising invite codes.
 */
/**
 * A fresh code, uniformly distributed over the alphabet.
 *
 * The bytes are rejection-sampled rather than reduced with `%`. 256 is not a
 * multiple of 32 — well, it is, so modulo would be uniform here — but the guard
 * costs nothing and keeps the function correct if `CODE_ALPHABET` is ever
 * shortened. Randomness comes from `crypto`, never `Math.random`, because a
 * guessable code is a code someone else can claim credit through.
 */
export function generateCode(length = REFERRAL_CODE_LENGTH) {
    const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
    let out = '';
    while (out.length < length) {
        for (const byte of randomBytes(length * 2)) {
            if (byte >= limit)
                continue; // biased tail — draw again
            out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
            if (out.length === length)
                break;
        }
    }
    return out;
}
/**
 * Codes are stored uppercase and matched uppercase, so a link pasted in the
 * wrong case still resolves. Whitespace is stripped because people paste codes
 * out of chat messages with it attached.
 */
export function normaliseCode(raw) {
    return raw.trim().toUpperCase();
}
/** A code that could not possibly be one of ours — cheap pre-filter before a query. */
export function isPlausibleCode(code) {
    return (code.length === REFERRAL_CODE_LENGTH &&
        [...code].every((c) => CODE_ALPHABET.includes(c)));
}
/**
 * The caller's own invite code, minting one on first use.
 *
 * Accounts created before doc 09 have `referralCode = NULL`, which the
 * nullable-unique column permits deliberately — that is what let this ship
 * without a backfill. They get a code the first time they open the Invite &
 * Earn page.
 *
 * The retry loop exists for the unique-index collision. It is astronomically
 * unlikely at 32^8, but "unlikely" is not "impossible", and the failure mode
 * without it is a 500 on someone's first visit to the page.
 */
export async function ensureReferralCode(userId) {
    const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
    });
    if (existing?.referralCode)
        return existing.referralCode;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateCode();
        try {
            const updated = await prisma.user.update({
                where: { id: userId },
                data: { referralCode: code },
                select: { referralCode: true },
            });
            return updated.referralCode;
        }
        catch (err) {
            // P2002 = unique violation. Any other error is real and must not be
            // swallowed by a retry loop.
            if (err.code !== 'P2002')
                throw err;
        }
    }
    throw new Error(`Could not mint a unique referral code for user ${userId}`);
}
//# sourceMappingURL=referralCode.js.map