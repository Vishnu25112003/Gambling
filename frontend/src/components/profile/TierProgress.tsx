import { Card } from '../shared/ui';
import { TierBadge } from './TierBadge';
import { formatSol } from '../../lib/format';
import type { TierProgress as TierProgressData } from '../../types';

/**
 * Doc 11 — where the player stands and what the next rung costs.
 *
 * The remaining amount is shown as an exact figure rather than only as a bar,
 * because "3.6 SOL to Elite" is actionable and a 60%-full bar is not.
 *
 * The full ladder used to repeat here as a row of small pills — it now only
 * lives in `BadgeVault`, which is the one place that actually has room to
 * show each rank's badge art and unlock progress instead of a cramped chip.
 */
export function TierProgress({ tier }: { tier: TierProgressData }) {
  return (
    <Card radius={20} className="flex h-full flex-col gap-4 p-[22px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-muted">
            LOYALTY TIER
          </div>
          <TierBadge tier={tier.key} label={tier.label} size="lg" />
        </div>
        <span className="mt-1 shrink-0 text-[11.5px] font-semibold text-faint">
          Level {tier.level} of {tier.ladder.length}
        </span>
      </div>

      {tier.next ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2 text-[12.5px]">
            <span className="text-muted">
              {formatSol(tier.wagered)} / {formatSol(tier.next.minWagered)} SOL wagered
            </span>
            <span className="font-semibold text-green">{tier.percentToNext.toFixed(0)}%</span>
          </div>

          <div
            className="h-2 w-full overflow-hidden rounded-full bg-line2"
            role="progressbar"
            aria-valuenow={Math.round(tier.percentToNext)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progress to ${tier.next.label} tier`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${tier.percentToNext}%`,
                background: 'linear-gradient(90deg, var(--green-deep), var(--green-solid))',
              }}
            />
          </div>

          <p className="mt-2.5 text-[12.5px] text-muted">
            <span className="font-bold text-text">
              {formatSol(tier.remainingToNext)} SOL
            </span>{' '}
            more wagered to reach {tier.next.label}.
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">
          Top of the ladder — there is no tier above {tier.label}.
        </p>
      )}
    </Card>
  );
}
