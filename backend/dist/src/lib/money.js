import { Decimal } from 'decimal.js';
/**
 * ---------------------------------------------------------------------------
 * MONEY REPRESENTATION — read this before touching any balance.
 * ---------------------------------------------------------------------------
 * Every amount is a Postgres `NUMERIC(20, 9)` — exact decimal, denominated in
 * SOL. Nine decimal places is exactly SOL's precision (1 lamport =
 * 0.000000001 SOL), so every representable on-chain amount round-trips
 * losslessly.
 *
 * The rule: money NEVER becomes a JavaScript `number`.
 *
 * `Number` is IEEE-754 binary floating point and cannot represent 0.1 exactly
 * (`0.1 + 0.2 === 0.30000000000000004`). In a system that repeatedly credits
 * and debits balances, that error accumulates into real money appearing or
 * vanishing, and it is unrecoverable afterwards. Prisma hands back `Decimal`
 * for NUMERIC columns; keep it that way, do arithmetic with Decimal or in SQL,
 * and convert to string at the API boundary.
 *
 * `Number(...)` on a balance is a bug. The only safe conversion out is
 * `toFixed(9)` / `toString()`.
 * ---------------------------------------------------------------------------
 */
// 9 decimal places, and round DOWN by default. Rounding down consistently means
// any residual rounding favours the house's solvency rather than paying out
// money that was never staked. Explicit distribution logic below never relies
// on this — it conserves exactly.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN, toExpNeg: -18, toExpPos: 40 });
export { Decimal };
/** SOL has exactly 9 decimal places. */
export const SOL_DECIMALS = 9;
/** Lamports in one SOL. Used only for exact integer split math. */
export const LAMPORTS_PER_SOL = 1000000000n;
/**
 * Coerce untrusted input into an exact Decimal.
 *
 * A `number` is accepted only because JSON request bodies produce them; it is
 * routed through `String(...)` so the value seen is the value the client
 * literally sent, and anything with more than 9 decimals is rejected rather
 * than silently truncated.
 */
export function toDecimal(value) {
    const d = value instanceof Decimal ? value : new Decimal(String(value));
    if (!d.isFinite())
        throw new Error(`Not a finite amount: ${String(value)}`);
    if (d.decimalPlaces() > SOL_DECIMALS) {
        throw new Error(`Amount has more than ${SOL_DECIMALS} decimal places: ${d.toString()}`);
    }
    return d;
}
/** Canonical wire/storage form: a fixed 9-decimal string, e.g. "1.500000000". */
export function toAmountString(value) {
    return toDecimal(value).toFixed(SOL_DECIMALS);
}
export const ZERO = new Decimal(0);
export const isPositive = (v) => toDecimal(v).greaterThan(0);
export const isNonNegative = (v) => toDecimal(v).greaterThanOrEqualTo(0);
/** True for a positive amount that SOL can actually represent. */
export function isValidAmount(value) {
    if (value === null || value === undefined)
        return false;
    try {
        const d = toDecimal(value);
        return d.isFinite() && d.greaterThan(0);
    }
    catch {
        return false;
    }
}
// --- exact integer helpers -------------------------------------------------
// Splitting a pot is the one place rounding can silently create or destroy
// money, so that math is done in whole lamports as BigInt, where it is exact
// by construction, then converted back.
export function toLamports(value) {
    const d = toDecimal(value);
    return BigInt(d.times(LAMPORTS_PER_SOL.toString()).toFixed(0));
}
export function fromLamports(lamports) {
    return new Decimal(lamports.toString()).dividedBy(LAMPORTS_PER_SOL.toString());
}
/**
 * The platform's cut, in basis points. Doc 03 locks this at 5%.
 * Pooled games take it off the pot; solo-vs-house games bake the same edge into
 * their odds table and charge nothing here.
 */
export const PLATFORM_FEE_BPS = 500;
/** Apply a basis-point fee, rounding the fee DOWN so the pot is never overdrawn. */
export function applyFeeBps(amount, bps) {
    const total = toLamports(amount);
    const fee = (total * BigInt(bps)) / 10000n; // BigInt division truncates
    return { fee: fromLamports(fee), remainder: fromLamports(total - fee) };
}
/**
 * Split `total` among `weights`, largest-remainder style.
 *
 * Integer division always leaves a remainder; handing it out by descending
 * fractional part rather than dropping it guarantees the parts sum EXACTLY to
 * `total`. No lamport is ever created or destroyed in a settlement.
 */
export function splitByWeight(total, weights) {
    if (weights.length === 0)
        return [];
    if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
        throw new Error('Weights must be non-negative finite numbers.');
    }
    const totalLamports = toLamports(total);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    if (weightSum <= 0)
        throw new Error('splitByWeight requires weights summing above zero');
    // Scale weights to integers so the whole computation stays in BigInt.
    const SCALE = 1_000_000;
    const scaled = weights.map((w) => BigInt(Math.round(w * SCALE)));
    const scaledSum = scaled.reduce((a, b) => a + b, 0n);
    const base = [];
    const remainders = [];
    scaled.forEach((w, i) => {
        const numerator = totalLamports * w;
        base.push(numerator / scaledSum);
        remainders.push({ index: i, rem: numerator % scaledSum });
    });
    let leftover = totalLamports - base.reduce((a, b) => a + b, 0n);
    remainders.sort((a, b) => (b.rem === a.rem ? a.index - b.index : b.rem > a.rem ? 1 : -1));
    for (let k = 0; leftover > 0n && k < remainders.length; k += 1) {
        const idx = remainders[k].index;
        base[idx] = (base[idx] ?? 0n) + 1n;
        leftover -= 1n;
    }
    return base.map(fromLamports);
}
/** Sum a list of amounts exactly. */
export function sum(values) {
    return values.reduce((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));
}
//# sourceMappingURL=money.js.map