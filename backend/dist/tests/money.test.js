import { describe, it, expect } from 'vitest';
import { Decimal, applyFeeBps, splitByWeight, toDecimal, toAmountString, toLamports, fromLamports, isValidAmount, sum, PLATFORM_FEE_BPS, } from '../src/lib/money.js';
describe('money primitives', () => {
    it('parses decimal strings exactly', () => {
        expect(toDecimal('0.1').plus(toDecimal('0.2')).toFixed(9)).toBe('0.300000000');
    });
    it('demonstrates the float bug this representation avoids', () => {
        // Plain JS numbers, the thing we must never use for money:
        expect(0.1 + 0.2).not.toBe(0.3);
        // Exact decimal:
        expect(toDecimal('0.1').plus('0.2').equals(toDecimal('0.3'))).toBe(true);
    });
    it('round-trips SOL through lamports losslessly', () => {
        for (const sol of ['0.1', '0.000000001', '1.5', '123.456789012', '0.999999999']) {
            expect(fromLamports(toLamports(sol)).toFixed(9)).toBe(toDecimal(sol).toFixed(9));
        }
    });
    it('rejects amounts finer than one lamport', () => {
        expect(() => toDecimal('0.0000000001')).toThrow(/decimal places/i);
        expect(isValidAmount('0.0000000001')).toBe(false);
    });
    it('rejects non-positive and malformed amounts', () => {
        expect(isValidAmount('0')).toBe(false);
        expect(isValidAmount('-1')).toBe(false);
        expect(isValidAmount('abc')).toBe(false);
        expect(isValidAmount(null)).toBe(false);
        expect(isValidAmount('1.5')).toBe(true);
    });
    it('formats to a canonical 9-decimal string', () => {
        expect(toAmountString('1.5')).toBe('1.500000000');
        expect(toAmountString(2)).toBe('2.000000000');
    });
    it('takes exactly 5% as the platform fee', () => {
        const { fee, remainder } = applyFeeBps('2', PLATFORM_FEE_BPS);
        expect(fee.toFixed(9)).toBe('0.100000000');
        expect(fee.plus(remainder).toFixed(9)).toBe('2.000000000');
    });
    it('rounds the fee down, never up, so the pot is never overdrawn', () => {
        // 0.000000999 * 5% = 0.00000004995 -> truncates to 0.000000049
        const { fee, remainder } = applyFeeBps('0.000000999', PLATFORM_FEE_BPS);
        expect(fee.toFixed(9)).toBe('0.000000049');
        expect(fee.plus(remainder).toFixed(9)).toBe('0.000000999');
    });
    describe('splitByWeight', () => {
        it('splits evenly when it divides cleanly', () => {
            const parts = splitByWeight('1', [1, 1]);
            expect(parts.map((p) => p.toFixed(9))).toEqual(['0.500000000', '0.500000000']);
        });
        it('conserves every lamport when the split does NOT divide cleanly', () => {
            // 1 SOL / 3 leaves a remainder naive division would silently drop.
            const parts = splitByWeight('1', [1, 1, 1]);
            expect(sum(parts).toFixed(9)).toBe('1.000000000');
            expect(parts.map((p) => p.toFixed(9))).toEqual([
                '0.333333334',
                '0.333333333',
                '0.333333333',
            ]);
        });
        it('respects unequal weights', () => {
            const parts = splitByWeight('1', [3, 1]);
            expect(parts.map((p) => p.toFixed(9))).toEqual(['0.750000000', '0.250000000']);
        });
        it('conserves the total across many awkward splits', () => {
            for (const total of ['0.000000001', '0.000000007', '0.999999999', '1.000000003', '123.456789']) {
                for (const weights of [[1, 1, 1], [5, 3, 2], [1, 1, 1, 1, 1, 1, 1], [7, 1]]) {
                    const parts = splitByWeight(total, weights);
                    expect(sum(parts).toFixed(9)).toBe(toDecimal(total).toFixed(9));
                }
            }
        });
        it('never hands out more than the pot', () => {
            const parts = splitByWeight('0.000000002', [1, 1, 1]);
            expect(sum(parts).toFixed(9)).toBe('0.000000002');
            expect(parts.every((p) => p.greaterThanOrEqualTo(0))).toBe(true);
        });
        it('rejects weights that sum to zero rather than dividing by zero', () => {
            expect(() => splitByWeight('1', [0, 0])).toThrow();
        });
    });
    it('sums exactly over many small amounts', () => {
        const many = Array.from({ length: 1000 }, () => new Decimal('0.000000001'));
        expect(sum(many).toFixed(9)).toBe('0.000001000');
    });
});
//# sourceMappingURL=money.test.js.map