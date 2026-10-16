import { describe, expect, it } from 'vitest';
import { accrueRakeback, rakebackBpsFor } from '../src/rewards/accrueRakeback.js';

/** A stand-in for the Prisma transaction client that records what would be written. */
function stubTx() {
  const updates: { id: string; increment: string }[] = [];
  const tx = {
    user: {
      update: async (args: { where: { id: string }; data: { rakebackUnclaimed: { increment: { toFixed(n: number): string } } } }) => {
        updates.push({ id: args.where.id, increment: args.data.rakebackUnclaimed.increment.toFixed(9) });
      },
    },
  };
  return { tx: tx as never, updates };
}

describe('rakeback tiers', () => {
  it('pays nothing below the first tier and steps up at each threshold', () => {
    expect(rakebackBpsFor('0')).toBe(0);
    expect(rakebackBpsFor('4.999999999')).toBe(0);
    expect(rakebackBpsFor('5')).toBe(200);
    expect(rakebackBpsFor('19.999999999')).toBe(200);
    expect(rakebackBpsFor('20')).toBe(400);
    expect(rakebackBpsFor('75')).toBe(600);
    expect(rakebackBpsFor('200')).toBe(1000);
    expect(rakebackBpsFor('99999')).toBe(1000);
  });
});

describe('accrueRakeback', () => {
  it('returns the tier share of the fee slice this stake paid', async () => {
    const { tx, updates } = stubTx();
    // pot 2, fee 0.1 (5%), this player staked 1 → their slice of the fee is 0.05;
    // top tier (10%) → 0.005.
    const accrued = await accrueRakeback(tx, {
      userId: 'u1',
      totalWagered: '500',
      stake: '1',
      pot: '2',
      feeCollected: '0.1',
    });
    expect(accrued.toFixed(9)).toBe('0.005000000');
    expect(updates).toEqual([{ id: 'u1', increment: '0.005000000' }]);
  });

  it('accrues nothing under the first tier, with no fee, or on a zero stake', async () => {
    const { tx, updates } = stubTx();
    const base = { userId: 'u1', stake: '1', pot: '2', feeCollected: '0.1', totalWagered: '500' };

    expect((await accrueRakeback(tx, { ...base, totalWagered: '1' })).isZero()).toBe(true);
    expect((await accrueRakeback(tx, { ...base, feeCollected: '0' })).isZero()).toBe(true);
    expect((await accrueRakeback(tx, { ...base, stake: '0' })).isZero()).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it('rounds down to the lamport instead of inventing one', async () => {
    const { tx } = stubTx();
    // fee 1 lamport-ish slice: 0.000000003 × 1/3 pot share, 2% → truncates to 0.
    const accrued = await accrueRakeback(tx, {
      userId: 'u1',
      totalWagered: '5',
      stake: '1',
      pot: '3',
      feeCollected: '0.000000003',
    });
    expect(accrued.isZero()).toBe(true);
  });
});
