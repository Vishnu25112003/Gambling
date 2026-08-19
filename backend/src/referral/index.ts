/**
 * Doc 09 — Invite & Earn.
 *
 * A player shares an invite link. The friend who signs up through it is bound to
 * them permanently. The first time that friend WINS a match, the referrer is
 * credited 5% of the friend's net profit on it, paid by the house.
 *
 * The payout is triggered from `escrow/settleMatch.ts`, not from a game module —
 * the games registry is still empty, and wiring it into escrow means the
 * commission works the day the first game ships, with no per-game code. That
 * also keeps overview principle #2 intact: a game never touches a balance.
 */
export { REFERRAL_COMMISSION_BPS, REFERRAL_CODE_LENGTH, CODE_ALPHABET } from './constants.js';
export { generateCode, ensureReferralCode, normaliseCode, isPlausibleCode } from './referralCode.js';
export { bindReferral, referrerLabel, type BindResult } from './bindReferral.js';
export { awardReferralOnWin, type AwardInput, type AwardResult } from './awardReferral.js';
export {
  checkPayoutEligibility,
  qualifiedUserIds,
  payoutThresholds,
  type PayoutEligibility,
  type Requirement,
} from './payoutEligibility.js';
export { referralRouter } from './referral.routes.js';
