import type { TierKey } from '../../types';
import { TIER_BADGE_IMAGE, tierRank } from '../../lib/tierBadges';

/**
 * Doc 11 — the badge a player wears.
 *
 * Rank art alone carries the tier, so every badge also carries its label in
 * text (or an aria-label in the icon-only size). `unranked` has no earned
 * artwork yet — it renders a neutral placeholder mark instead.
 */

/** A neutral placeholder mark for `unranked` — no badge art exists to earn yet. */
function UnrankedMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeDasharray="3 3"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
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
  const image = tier === 'unranked' ? null : TIER_BADGE_IMAGE[tier];
  const rank = tierRank(tier);

  const px = { sm: 16, md: 20, lg: 28 }[size];
  const text = { sm: 'text-[10.5px]', md: 'text-[11.5px]', lg: 'text-[13px]' }[size];
  const pad = { sm: 'px-2 py-0.5', md: 'px-2.5 py-1', lg: 'px-3.5 py-1.5' }[size];

  const badgeMark = image ? (
    <img src={image} alt="" width={px} height={px} className="shrink-0 object-contain" />
  ) : (
    <span className="shrink-0 text-faint" style={{ color: 'var(--faint)' }}>
      <UnrankedMark size={px} />
    </span>
  );

  const fullLabel = rank ? `RANK ${rank} ${label}` : label;

  if (iconOnly) {
    return (
      <span
        className="flex shrink-0 items-center"
        title={fullLabel}
        aria-label={`${fullLabel} tier`}
        role="img"
      >
        {badgeMark}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-bold whitespace-nowrap ${pad} ${text}`}
      style={{
        color: 'var(--gold-bright)',
        borderColor: 'color-mix(in srgb, var(--gold) 32%, transparent)',
        background: 'color-mix(in srgb, var(--gold) 10%, transparent)',
      }}
      title={fullLabel}
    >
      {badgeMark}
      {fullLabel}
    </span>
  );
}
