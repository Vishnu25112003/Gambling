import { CircleCheck } from 'lucide-react';
import { Card, SectionHeading } from '../shared/ui';
import { Icon } from '../shared/icons';
import { TIER_BADGE_IMAGE, tierRank } from '../../lib/tierBadges';
import { formatSol } from '../../lib/format';
import type { TierProgress as TierProgressData } from '../../types';

/**
 * Doc 11 — the full 10-badge rank ladder, so a player can see every rank they
 * haven't earned yet, not just the next one. `tier` is the same
 * `TierProgress` payload `TierProgress.tsx` already renders — no separate
 * API call.
 */
export function BadgeVault({ tier }: { tier: TierProgressData }) {
  const wagered = Number(tier.wagered);
  const earnable = tier.ladder.filter((rung) => rung.key !== 'unranked');

  return (
    <Card radius={18} className="p-[22px]">
      <SectionHeading
        icon={<Icon name="trophy" size={18} />}
        title="Badge Vault"
        subtitle="Ranks unlock on lifetime SOL wagered. No shortcuts."
        action={
          <span className="text-[11px] font-semibold text-green">
            {tier.ladder.filter((r) => r.reached && r.key !== 'unranked').length} / {earnable.length}{' '}
            earned
          </span>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {earnable.map((rung, i) => {
          const floor = i === 0 ? 0 : Number(earnable[i - 1]!.minWagered);
          const ceiling = Number(rung.minWagered);
          const pct = rung.reached
            ? 100
            : Math.min(100, Math.max(0, ((wagered - floor) / (ceiling - floor)) * 100));

          return (
            <div
              key={rung.key}
              className="relative flex flex-col items-center overflow-hidden rounded-2xl border p-3.5 text-center"
              style={
                rung.reached
                  ? {
                      borderColor: 'color-mix(in srgb, var(--gold) 30%, transparent)',
                      background: 'color-mix(in srgb, var(--gold) 6%, var(--bg2))',
                    }
                  : { borderColor: 'var(--line2)', background: 'var(--bg2)' }
              }
            >
              <span
                className="absolute top-2.5 left-2.5 font-mono text-[9px] tracking-[0.12em]"
                style={{ color: rung.reached ? 'var(--gold-bright)' : 'var(--faint)' }}
              >
                RANK {tierRank(rung.key)}
              </span>
              <span className="absolute top-2.5 right-2.5" style={{ color: rung.reached ? 'var(--green)' : 'var(--faint)' }}>
                {rung.reached ? <CircleCheck size={13} /> : <Icon name="lock" size={13} />}
              </span>

              <img
                src={TIER_BADGE_IMAGE[rung.key as keyof typeof TIER_BADGE_IMAGE]}
                alt={rung.label}
                width={72}
                height={72}
                className="mt-3 mb-2.5 object-contain"
                style={rung.reached ? undefined : { filter: 'grayscale(1)', opacity: 0.45 }}
              />

              <div className="text-[13.5px] font-bold tracking-[0.02em]">{rung.label}</div>
              <p className="mt-1 text-[11px] text-muted">
                Stake {formatSol(rung.minWagered)} SOL lifetime to unlock
              </p>

              <div className="mt-2.5 h-[5px] w-full overflow-hidden rounded-full bg-line2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: rung.reached
                      ? 'linear-gradient(90deg, var(--gold-deep), var(--gold-bright))'
                      : 'linear-gradient(90deg, var(--green-deep), var(--green-solid))',
                  }}
                />
              </div>
              <div
                className="mt-1.5 font-mono text-[10px] tracking-[0.06em]"
                style={{ color: rung.reached ? 'var(--gold-bright)' : 'var(--muted)' }}
              >
                {rung.reached ? 'UNLOCKED' : `${formatSol(tier.wagered)} / ${formatSol(rung.minWagered)} SOL`}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
