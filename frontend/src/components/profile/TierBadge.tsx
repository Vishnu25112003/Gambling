import type { TierKey } from '../../types';

/**
 * Doc 11 — the badge a player wears.
 *
 * Colour alone carries the tier, so every badge also carries its label in text
 * (or an aria-label in the icon-only size). Someone who cannot distinguish bronze
 * from gold must still be able to read their standing.
 */

/** Tailwind can't build a class name from a runtime value, so this is a lookup. */
const TIER_VAR: Record<TierKey, string> = {
  bronze: 'var(--tier-bronze)',
  silver: 'var(--tier-silver)',
  gold: 'var(--tier-gold)',
  platinum: 'var(--tier-platinum)',
  diamond: 'var(--tier-diamond)',
};

export function tierColor(tier: TierKey): string {
  return TIER_VAR[tier];
}

/** A faceted gem, drawn once and tinted per tier. */
function TierGem({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3h12l3 6-9 12L3 9z" fill="currentColor" fillOpacity={0.18} />
      <path d="M3 9h18M9 3l-3 6 6 12M15 3l3 6-6 12" />
    </svg>
  );
}

export function TierBadge({
  tier,
  label,
  size = 'md',
  /** Icon only — for a dense row like the leaderboard, where a word won't fit. */
  iconOnly = false,
}: {
  tier: TierKey;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
}) {
  const color = tierColor(tier);

  const gem = { sm: 13, md: 16, lg: 22 }[size];
  const text = { sm: 'text-[10.5px]', md: 'text-[11.5px]', lg: 'text-[13px]' }[size];
  const pad = { sm: 'px-2 py-0.5', md: 'px-2.5 py-1', lg: 'px-3.5 py-1.5' }[size];

  if (iconOnly) {
    return (
      <span
        className="flex shrink-0 items-center"
        style={{ color }}
        title={`${label} tier`}
        aria-label={`${label} tier`}
        role="img"
      >
        <TierGem size={gem} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold whitespace-nowrap ${pad} ${text}`}
      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
      title={`${label} tier`}
    >
      <TierGem size={gem} />
      {label}
    </span>
  );
}
