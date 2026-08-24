import { Decimal, toAmountString, toDecimal } from '../lib/money.js';
/**
 * Doc 11 — the loyalty tier ladder.
 *
 * ONE SOURCE OF TRUTH (00-Overview.md, Architecture Principle #5): the
 * thresholds are defined here and nowhere else. No route, no component and no
 * other doc restates a number from this table.
 *
 * A tier is DERIVED FROM `User.totalWagered` ON EVERY READ, never stored.
 *
 * That is the opposite of doc 09's `commissionBps`, which is deliberately
 * snapshotted — and the difference is worth understanding, because it is the
 * same question answered two ways. A commission is a *promise*: it was agreed at
 * bind time and re-pricing it later would break it. A tier is a *current
 * standing*: it describes where the player is right now. Storing it would mean a
 * threshold change silently applies to new players and not old ones, and would
 * need a backfill migration to correct. Deriving it means one edit to this table
 * re-prices everybody, consistently, immediately.
 *
 * NOTE that a tier is therefore NOT monotonic. `refundMatch` decrements
 * `totalWagered` (a refunded match never happened), so a crash-refund can move a
 * player back down. That is correct, and it is why no copy anywhere should
 * promise that a tier is permanent.
 *
 * Thresholds are exact decimal STRINGS compared with `Decimal`. A float literal
 * like `0.1` cannot be represented exactly, and a tier boundary is precisely the
 * place where "just under" and "just over" must be decided correctly.
 */
export const TIERS = [
    { key: 'bronze', label: 'Bronze', minWagered: '0' },
    { key: 'silver', label: 'Silver', minWagered: '1' },
    { key: 'gold', label: 'Gold', minWagered: '10' },
    { key: 'platinum', label: 'Platinum', minWagered: '50' },
    { key: 'diamond', label: 'Diamond', minWagered: '250' },
];
/** The highest rung whose threshold `totalWagered` has reached. */
export function tierFor(totalWagered) {
    const wagered = toDecimal(totalWagered);
    // Walk downwards and take the first match, so the answer is the HIGHEST rung
    // reached rather than the lowest.
    for (let i = TIERS.length - 1; i >= 0; i -= 1) {
        const rung = TIERS[i];
        if (wagered.greaterThanOrEqualTo(new Decimal(rung.minWagered)))
            return rung.key;
    }
    // Unreachable: the first rung's threshold is 0 and a balance can never be
    // negative (users_total_wagered_non_negative). Bronze is the honest fallback
    // rather than a throw, because a profile page must always render something.
    return 'bronze';
}
/**
 * Everything the profile page needs to draw the badge, the progress bar and the
 * full ladder — from one number.
 */
export function tierProgress(totalWagered) {
    const wagered = toDecimal(totalWagered);
    const key = tierFor(wagered);
    const index = TIERS.findIndex((t) => t.key === key);
    const current = TIERS[index];
    const next = TIERS[index + 1] ?? null;
    const ladder = TIERS.map((t, i) => ({
        key: t.key,
        label: t.label,
        minWagered: toAmountString(t.minWagered),
        level: i + 1,
        reached: i <= index,
    }));
    if (!next) {
        return {
            key,
            label: current.label,
            level: index + 1,
            next: null,
            wagered: toAmountString(wagered),
            remainingToNext: null,
            percentToNext: 100,
            ladder,
        };
    }
    const floor = new Decimal(current.minWagered);
    const ceiling = new Decimal(next.minWagered);
    const span = ceiling.minus(floor);
    const progressed = wagered.minus(floor);
    // `span` is always positive because TIERS is strictly ascending, but guarding
    // costs nothing and a divide-by-zero here would render the bar as NaN%.
    const percent = span.lessThanOrEqualTo(0)
        ? 100
        : Number(progressed.dividedBy(span).times(100).toFixed(2));
    return {
        key,
        label: current.label,
        level: index + 1,
        next: { key: next.key, label: next.label, minWagered: toAmountString(next.minWagered) },
        wagered: toAmountString(wagered),
        remainingToNext: toAmountString(Decimal.max(ceiling.minus(wagered), new Decimal(0))),
        // Clamped: a value outside 0-100 would overflow the bar's container.
        percentToNext: Math.min(100, Math.max(0, percent)),
        ladder,
    };
}
//# sourceMappingURL=tiers.js.map