import { prisma } from '../config/db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import {
  Decimal,
  PLATFORM_FEE_BPS,
  applyFeeBps,
  splitByWeight,
  toDecimal,
  type MoneyInput,
} from '../lib/money.js';
import { createLogger } from '../lib/logger.js';
import { awardReferralOnWin } from '../referral/awardReferral.js';
import type { Id, SettleResult, SettleMatchOptions, SettlementPayout } from './types.js';

const log = createLogger('escrow:settle');

/**
 * Doc 03 — pay the winners, take the fee, unlock everything.
 *
 * THE ONE SUBTLETY WORTH READING: `weights` means different things per mode,
 * because doc 03 funds the two modes from different places.
 *
 *   mode 'pooled' — the players ARE the bank.
 *     Payouts come out of the pot the players themselves locked. `weights` are
 *     relative shares. The platform takes 5% off the top, and the remainder is
 *     split by weight. Total paid out can never exceed the pot.
 *       settleMatch(id, [alice, bob], [1, 1])   // split the pot evenly
 *
 *   mode 'solo_vs_house' — the treasury is the bank.
 *     Payout is dictated by that game's odds table, which already has the 5%
 *     edge baked in, so NO fee is charged here (charging again would take the
 *     cut twice off the same player). `weights` are ABSOLUTE SOL payouts.
 *     A win legitimately pays out more than the player staked, and the
 *     difference comes from the treasury float.
 *       settleMatch(id, [alice], ['1.9'])       // 1 SOL staked at 1.9x
 *
 * Every participant's locked stake is released either way. Winners have their
 * payout credited to availableBalance; losers simply have their stake cleared,
 * since it funded the pot.
 */
export async function settleMatch(
  matchId: Id,
  winners: Id[],
  weights: (number | MoneyInput)[],
  options: SettleMatchOptions = {},
): Promise<SettleResult> {
  if (winners.length !== weights.length) {
    throw badRequest('settleMatch requires one weight per winner.');
  }

  return prisma.$transaction(async (tx) => {
    /**
     * Claim the match atomically.
     *
     * `WHERE status = 'open'` inside the UPDATE means a second concurrent
     * settlement matches zero rows and stops here — a match can never pay out
     * twice, even under a race.
     */
    const claimed = await tx.$executeRaw`
      UPDATE matches
         SET status = 'settled', "settledAt" = NOW()
       WHERE id = ${matchId}::uuid AND status = 'open'
    `;

    if (claimed === 0) {
      const existing = await tx.match.findUnique({ where: { id: matchId } });
      if (!existing) throw notFound('Match not found.');
      throw conflict(`Match is already ${existing.status} and cannot be settled again.`);
    }

    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: { participants: true },
    });

    // Read the pot off the match, NOT off the sum of remaining lockedAmounts —
    // a forfeited stake has already left the player's lockedBalance but is
    // still part of the pot the winners are playing for.
    const pot = toDecimal(match.pot as unknown as Decimal);
    const isPooled = match.mode === 'pooled';

    let feeCollected = new Decimal(0);
    const payoutByUser = new Map<string, Decimal>();
    const addPayout = (uid: string, amount: Decimal) =>
      payoutByUser.set(uid, (payoutByUser.get(uid) ?? new Decimal(0)).plus(amount));

    if (isPooled) {
      const feeBps = options.feeBps ?? PLATFORM_FEE_BPS;
      const numericWeights = weights.map((w) => Number(w));
      if (numericWeights.some((w) => !Number.isFinite(w) || w < 0)) {
        throw badRequest('Pooled weights must be non-negative finite numbers.');
      }
      const totalWeight = numericWeights.reduce((a, b) => a + b, 0);

      if (winners.length > 0 && totalWeight > 0) {
        const { fee, remainder } = applyFeeBps(pot, feeBps);
        feeCollected = fee;
        // Largest-remainder split: the parts sum to exactly `remainder`, so no
        // lamport is invented or lost splitting a three-way pot.
        const shares = splitByWeight(remainder, numericWeights);
        winners.forEach((w, i) => addPayout(String(w), shares[i] ?? new Decimal(0)));
      } else {
        // No winner declared on a pooled match (e.g. a draw): return stakes and
        // take no fee. A draw is not a house win.
        match.participants.forEach((p) =>
          addPayout(
            p.userId,
            toDecimal(p.lockedAmount as unknown as Decimal).plus(
              toDecimal(p.forfeitedAmount as unknown as Decimal),
            ),
          ),
        );
      }
    } else {
      // solo_vs_house — weights are absolute SOL payouts from the odds table.
      let parsed: Decimal[];
      try {
        parsed = weights.map((w) => toDecimal(w as MoneyInput));
      } catch (err) {
        throw badRequest(
          `For solo_vs_house matches, weights are absolute SOL payouts: ${(err as Error).message}`,
        );
      }
      if (parsed.some((p) => p.isNegative())) {
        throw badRequest('Payouts cannot be negative.');
      }
      winners.forEach((w, i) => addPayout(String(w), parsed[i] ?? new Decimal(0)));

      const totalPaid = [...payoutByUser.values()].reduce(
        (a, b) => a.plus(b),
        new Decimal(0),
      );
      // House edge realised on this match: positive means the house kept money.
      feeCollected = Decimal.max(new Decimal(0), pot.minus(totalPaid));
    }

    const payouts: SettlementPayout[] = [];

    for (const participant of match.participants) {
      const uid = participant.userId;
      // Only what is STILL locked gets released here. A forfeited stake was
      // already unlocked (and lost) by forfeitPlayer, so touching it again
      // would debit the same funds twice and drive lockedBalance negative —
      // which the CHECK constraint would now reject outright.
      const stillLocked = toDecimal(participant.lockedAmount as unknown as Decimal);
      const totalStake = stillLocked.plus(
        toDecimal(participant.forfeitedAmount as unknown as Decimal),
      );
      const payout = payoutByUser.get(uid) ?? new Decimal(0);

      /**
       * Doc 11 — the lifetime counters.
       *
       * A forfeited participant was ALREADY counted by `forfeitPlayer`, which
       * debited their netProfit and incremented gamesPlayed the moment the
       * reconnect window closed. Counting them again here would double both: one
       * forfeit would read as two games played and twice the loss — which is
       * exactly what happened before this guard existed, and what
       * tests/profile.test.ts pins down.
       *
       * The money half stays unconditional, and is already a no-op for a
       * forfeited row: `stillLocked` is 0 (forfeitPlayer unlocked it) and a
       * forfeited player is never in `winners`, so `payout` is 0 too.
       */
      const alreadyCounted = participant.status === 'forfeited';
      const won = payout.greaterThan(totalStake);

      const user = await tx.user.update({
        where: { id: uid },
        data: {
          lockedBalance: { decrement: stillLocked },
          availableBalance: { increment: payout },
          ...(alreadyCounted
            ? {}
            : {
                netProfit: { increment: payout.minus(totalStake) },
                gamesPlayed: { increment: 1 },
                // A win is finishing in profit, not merely being listed in
                // `winners` — a pooled draw returns every stake and pays nobody,
                // and that is not a win for anyone.
                ...(won ? { gamesWon: { increment: 1 } } : {}),
              }),
        },
      });

      await tx.matchParticipant.update({
        where: { id: participant.id },
        data: {
          lockedAmount: 0,
          payout,
          status: participant.status === 'forfeited' ? 'forfeited' : 'settled',
        },
      });

      payouts.push({ userId: uid, payout });

      await tx.ledgerEntry.create({
        data: {
          userId: uid,
          type: 'settlement',
          status: 'confirmed',
          amount: payout.minus(totalStake),
          balanceAfterAvailable: user.availableBalance,
          balanceAfterLocked: user.lockedBalance,
          matchId,
          gameType: match.gameType,
          note: payout.greaterThan(0)
            ? `Settled: won ${payout.toFixed(9)} SOL`
            : 'Settled: lost stake',
          meta: {
            stake: totalStake.toFixed(9),
            payout: payout.toFixed(9),
            mode: match.mode,
          },
        },
      });

      /**
       * Doc 09 — if this player was invited by someone and just turned their
       * first profit, pay that referrer their cut.
       *
       * Inside the same transaction, so the commission, its ledger row and this
       * settlement commit or roll back together. It reads the net win rather
       * than the payout, takes nothing from the pot, and leaves `feeCollected`
       * alone — see the header of awardReferral.ts for why.
       */
      await awardReferralOnWin(tx, {
        userId: uid,
        netWin: payout.minus(totalStake),
        matchId,
        gameType: match.gameType,
      });
    }

    if (feeCollected.greaterThan(0)) {
      // The fee has no destination user — the treasury already holds it, since
      // locked funds never left the pooled wallet. This row exists so revenue
      // is auditable against the ledger rather than inferred.
      await tx.ledgerEntry.create({
        data: {
          userId: match.participants[0]?.userId ?? null,
          type: 'fee',
          status: 'confirmed',
          amount: feeCollected.negated(),
          matchId,
          gameType: match.gameType,
          note: isPooled ? 'Platform fee (5% of pot)' : 'House edge realised',
          meta: { pot: pot.toFixed(9), feeCollected: feeCollected.toFixed(9), mode: match.mode },
        },
      });
    }

    await tx.match.update({
      where: { id: matchId },
      data: {
        feeCollected,
        result: (options.result ?? null) as never,
      },
    });

    log.info('settled', {
      matchId,
      gameType: match.gameType,
      mode: match.mode,
      pot: pot.toFixed(9),
      feeCollected: feeCollected.toFixed(9),
    });

    return { matchId, pot, feeCollected, payouts };
  });
}
