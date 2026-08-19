import { Card } from '../shared/ui';
import { TierBadge, tierColor } from './TierBadge';
import { formatSol } from '../../lib/format';
import type { TierProgress as TierProgressData } from '../../types';

/**
 * Doc 11 — where the player stands and what the next rung costs.
 *
 * The remaining amount is shown as an exact figure rather than only as a bar,
 * because "3.6 SOL to Platinum" is actionable and a 60%-full bar is not.
 */
export function TierProgress({ tier }: { tier: TierProgressData }) {
  const color = tierColor(tier.key);

  return (
    <Card radius={20} className="flex flex-col gap-4 p-[22px]">
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
            <span className="font-semibold" style={{ color }}>
              {tier.percentToNext.toFixed(0)}%
            </span>
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
              style={{ width: `${tier.percentToNext}%`, background: color }}
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

      {/* The whole ladder, so a player can see what is ahead without playing to find out. */}
      <div className="flex flex-wrap gap-1.5 border-t border-line2 pt-3.5">
        {tier.ladder.map((rung) => (
          <span
            key={rung.key}
            title={`${rung.label} — ${formatSol(rung.minWagered)} SOL wagered`}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] font-bold"
            style={
              rung.reached
                ? {
                    color: tierColor(rung.key),
                    background: `color-mix(in srgb, ${tierColor(rung.key)} 14%, transparent)`,
                  }
                : { color: 'var(--tier-locked)', background: 'var(--border2)' }
            }
          >
            {rung.label}
            {!rung.reached && <span aria-label="locked">🔒</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}
