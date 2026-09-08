import type { TierKey } from '../types';

/**
 * Doc 11 — badge artwork for the loyalty tier ladder.
 *
 * Presentation-only, deliberately kept out of the tier math (`backend/src/profile/tiers.ts`
 * derives thresholds and has no business knowing about image filenames). The
 * mapping from tier key to badge file is NOT sequential — it mirrors the source
 * design's own `badgeRows` ordering, where the art was authored in a different
 * order than the rank ladder.
 */
export const TIER_BADGE_IMAGE: Record<Exclude<TierKey, 'unranked'>, string> = {
  recruit: '/badges/badge_05.png',
  scout: '/badges/badge_04.png',
  raider: '/badges/badge_02.png',
  striker: '/badges/badge_03.png',
  veteran: '/badges/badge_01.png',
  elite: '/badges/badge_10.png',
  champion: '/badges/badge_09.png',
  master: '/badges/badge_08.png',
  legend: '/badges/badge_07.png',
  grandmaster: '/badges/badge_06.png',
};

/** Roman numerals for "RANK III RAIDER"-style labels — index 0 is rank I (Recruit). */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const EARNABLE_ORDER = Object.keys(TIER_BADGE_IMAGE) as Exclude<TierKey, 'unranked'>[];

/** 1-based rank position among the 10 earnable tiers (Recruit = I), or null for `unranked`. */
export function tierRank(tier: TierKey): string | null {
  if (tier === 'unranked') return null;
  const index = EARNABLE_ORDER.indexOf(tier as Exclude<TierKey, 'unranked'>);
  return ROMAN[index] ?? null;
}
