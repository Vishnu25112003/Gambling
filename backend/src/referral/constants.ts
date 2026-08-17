/**
 * Doc 09 — Invite & Earn policy constants.
 *
 * These live here rather than in `lib/money.ts` on purpose. `PLATFORM_FEE_BPS`
 * is a property of the escrow model itself — every settlement reads it. This is
 * a marketing rate that product may change, and changing it must not look like
 * an edit to the money layer.
 */

/**
 * The referrer's cut of their friend's first winning match, in basis points.
 *
 * 500 bps = 5%, of the referred player's NET PROFIT on that match — not of their
 * stake, and not of every bet they ever place. "5% of every bet" (the copy the
 * design shipped with) would be 100% of the platform's own 5% pooled rake and
 * would leave the house with nothing.
 *
 * Stored onto each `Referral` row at bind time, so raising or lowering this
 * never silently re-prices a referral that was already promised.
 */
export const REFERRAL_COMMISSION_BPS = 500;

/**
 * Crockford base32: the digits and uppercase letters, minus I, L, O and U.
 *
 * I/1, L/1 and O/0 are the pairs people confuse when reading a code off a screen
 * or hearing it out loud, and U is dropped so the generator cannot accidentally
 * spell something unfortunate.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 32^8 ≈ 1.1e12 codes — collisions are a non-event, and the unique index catches them anyway. */
export const REFERRAL_CODE_LENGTH = 8;
