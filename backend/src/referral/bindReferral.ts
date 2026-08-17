import { prisma } from '../config/db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { shortAddress } from '../lib/user.js';
import { REFERRAL_COMMISSION_BPS } from './constants.js';
import { isPlausibleCode, normaliseCode } from './referralCode.js';

const log = createLogger('referral:bind');

export interface BindResult {
  referrerId: string;
  /** Display-safe label for the referrer — never a full wallet address. */
  referrerName: string;
  commissionBps: number;
}

/**
 * Doc 09 — attach a player to the person who invited them.
 *
 * This is the one moment attribution is decided, and it is irreversible: the
 * `referrals.referredUserId` unique index means a second attempt can never
 * overwrite the first. The eligibility window is deliberately narrow — before
 * the player's first settled game — so nobody can shop for a referrer after
 * discovering they are about to trigger a commission.
 */
export async function bindReferral(referredUserId: string, rawCode: string): Promise<BindResult> {
  const code = normaliseCode(rawCode);
  if (!isPlausibleCode(code)) throw notFound('That invite code does not exist.');

  const referrer = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true, displayName: true, walletAddress: true },
  });
  if (!referrer) throw notFound('That invite code does not exist.');

  if (referrer.id === referredUserId) {
    // The database CHECK would reject this too; catching it here produces a
    // sentence a player can act on instead of a constraint-violation 500.
    throw badRequest('You cannot invite yourself.');
  }

  const referred = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { gamesPlayed: true, referralReceived: { select: { id: true } } },
  });
  if (!referred) throw notFound('Account no longer exists.');

  if (referred.referralReceived) {
    throw conflict('You already joined through an invite.');
  }
  if (referred.gamesPlayed > 0) {
    throw conflict('An invite code can only be applied before your first game.');
  }

  try {
    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredUserId,
        // Snapshot the rate. A referral promised at 5% pays 5% even if the
        // platform rate changes before the friend gets around to winning.
        commissionBps: REFERRAL_COMMISSION_BPS,
      },
    });
  } catch (err: unknown) {
    // Two claims racing: the unique index rejects the loser. That is the
    // correct outcome, reported as the same conflict the check above gives.
    if ((err as { code?: string }).code === 'P2002') {
      throw conflict('You already joined through an invite.');
    }
    throw err;
  }

  log.info('referral bound', { referrerId: referrer.id, referredUserId });

  return {
    referrerId: referrer.id,
    referrerName: referrerLabel(referrer),
    commissionBps: REFERRAL_COMMISSION_BPS,
  };
}

/**
 * How a referrer is shown to the person they invited, and vice versa.
 *
 * A chosen display name if there is one, otherwise the abbreviated wallet. The
 * full address never leaves the server for this purpose — knowing who invited
 * you should not hand you their complete on-chain history.
 */
export function referrerLabel(user: { displayName: string | null; walletAddress: string }): string {
  return user.displayName ?? shortAddress(user.walletAddress);
}
