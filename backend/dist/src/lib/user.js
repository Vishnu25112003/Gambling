import { toAmountString } from './money.js';
/** A short, human-friendly label for a wallet: `7xKX…9aBc`. */
export function shortAddress(address, size = 4) {
    if (address.length <= size * 2 + 2)
        return address;
    return `${address.slice(0, size)}…${address.slice(-size)}`;
}
/**
 * The user shape sent to clients.
 *
 * Balances go over the wire as fixed 9-decimal STRINGS, not numbers. Serialising
 * a NUMERIC as a JSON number would hand it straight back to the float
 * imprecision the database type exists to avoid — `1.000000001` is not exactly
 * representable as a double. The frontend formats the string for display.
 */
export function publicUser(user) {
    return {
        id: user.id,
        walletAddress: user.walletAddress,
        username: user.username,
        avatarUrl: user.avatarUrl,
        availableBalance: toAmountString(user.availableBalance),
        lockedBalance: toAmountString(user.lockedBalance),
        totalWagered: toAmountString(user.totalWagered),
        netProfit: toAmountString(user.netProfit),
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
    };
}
/** The label to show for a user in public: their name, else a shortened wallet. */
export function userLabel(user) {
    return user.username ?? shortAddress(user.walletAddress);
}
/**
 * The `:handle` in `/dashboard/u/:handle`.
 *
 * A username once claimed, the internal id until then — so every player is
 * linkable from the leaderboard immediately and the URL simply gets prettier
 * later. Deliberately NOT the wallet address: `leaderboard.routes.ts` already
 * refuses to publish full addresses, and a URL is more public than a table cell
 * (it ends up in history, referrers and shared links). The id is safe to expose
 * because nothing authorizes off it — see the note in auth/jwt.ts.
 */
export function userHandle(user) {
    return user.username ?? user.id;
}
/**
 * Doc 11 — the shape sent for SOMEBODY ELSE'S profile.
 *
 * A separate projection rather than `publicUser` with fields deleted, and that is
 * the whole point: `publicUser` returns both balances and the full wallet address,
 * so filtering it would mean every future field added there leaks by default. Here
 * the omission is structural — there is nothing to forget to remove.
 */
export function publicProfile(user) {
    return {
        handle: userHandle(user),
        username: user.username,
        avatarUrl: user.avatarUrl,
        /** Shortened, never the full address. */
        walletShort: shortAddress(user.walletAddress),
        label: userLabel(user),
        totalWagered: toAmountString(user.totalWagered),
        netProfit: toAmountString(user.netProfit),
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        joinedAt: user.createdAt,
    };
}
//# sourceMappingURL=user.js.map