/**
 * Rewards — rakeback policy.
 *
 * Rakeback gives a player back a share of the PLATFORM FEE their own stake
 * generated — never a share of what they wagered. The fee is 5% of the pot, so
 * even the top tier (10% of it) returns 0.5% of a wager, and the house always
 * keeps the larger part of every fee. A draw or a refund charges no fee and so
 * accrues nothing.
 *
 * Kept out of `lib/money.ts` on purpose, same reasoning as the referral rate:
 * this is marketing policy that product may retune, not part of the money layer.
 *
 * Tiers key off lifetime `totalWagered` and are independent of the badge rank
 * ladder in `profile/tiers.ts`. Ascending; the highest rung reached applies.
 */
export const RAKEBACK_TIERS = [
  { minWagered: '5', bps: 200 }, //  2% of the fee
  { minWagered: '20', bps: 400 }, //  4%
  { minWagered: '75', bps: 600 }, //  6%
  { minWagered: '200', bps: 1000 }, // 10%
] as const;
