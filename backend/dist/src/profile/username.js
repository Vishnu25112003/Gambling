import { prisma } from '../config/db.js';
import { badRequest, conflict } from '../lib/errors.js';
/**
 * Doc 11 — the public profile handle.
 *
 * A username is the `:handle` in `/dashboard/u/:handle`, which makes it a URL
 * segment before it is a label. So the charset is deliberately narrow —
 * lowercase letters, digits and underscore — and normalisation happens at the
 * boundary, exactly the pattern `referral/referralCode.ts` uses for invite codes.
 *
 * Storing the lowercased form is what makes the single `@unique` index
 * case-insensitive. The alternative (preserving the typed casing and adding a
 * functional `UNIQUE (LOWER(username))` index) would let `Alice` and `alice`
 * render as two different people while resolving to one row, and Prisma's
 * `findUnique` cannot see a functional index anyway.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
/** Mirrors the `users_username_shape` CHECK constraint exactly. */
const SHAPE = /^[a-z0-9_]{3,20}$/;
/**
 * Handles that must never belong to a player.
 *
 * Two reasons. Route collisions: `/dashboard/u/me` has to keep meaning "the
 * current user" no matter who signs up. And impersonation: an account called
 * `support` or `treasury` can ask other players for things the platform never
 * would.
 */
export const RESERVED_USERNAMES = new Set([
    'me',
    'admin',
    'administrator',
    'root',
    'system',
    'support',
    'help',
    'staff',
    'team',
    'mod',
    'moderator',
    'official',
    'house',
    'casino',
    'bank',
    'treasury',
    'escrow',
    'wallet',
    'gamblinghub',
    'api',
    'auth',
    'login',
    'logout',
    'signup',
    'settings',
    'profile',
    'profiles',
    'dashboard',
    'leaderboard',
    'games',
    'game',
    'referral',
    'referrals',
    'invite',
    'null',
    'undefined',
    'anonymous',
    'deleted',
]);
/** Trim and lowercase. The one place a raw username becomes a stored username. */
export function normaliseUsername(raw) {
    return raw.trim().toLowerCase();
}
export function isValidUsername(candidate) {
    return SHAPE.test(candidate);
}
export function isReservedUsername(candidate) {
    return RESERVED_USERNAMES.has(candidate);
}
/**
 * Normalise and validate, throwing the specific reason it was rejected.
 *
 * The messages are written to be shown to the player as-is — "invalid username"
 * tells somebody nothing about what to try next.
 */
export function parseUsername(raw) {
    const username = normaliseUsername(raw);
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
        throw badRequest(`A username must be ${USERNAME_MIN}-${USERNAME_MAX} characters long.`);
    }
    if (!isValidUsername(username)) {
        throw badRequest('A username can only use lowercase letters, numbers and underscores.');
    }
    if (isReservedUsername(username)) {
        throw conflict('That username is reserved.');
    }
    return username;
}
/**
 * Is this handle free (for `userId`, who may already own it)?
 *
 * ADVISORY ONLY. Two people can pass this check at the same instant and one of
 * them will still lose the write — the unique index is the real guard, and the
 * caller must translate Prisma's P2002 into a 409. This exists so the form can
 * say "taken" before the player hits Save, not to make the write safe.
 */
export async function isUsernameAvailable(username, userId) {
    if (!isValidUsername(username) || isReservedUsername(username))
        return false;
    const owner = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
    });
    return !owner || owner.id === userId;
}
//# sourceMappingURL=username.js.map