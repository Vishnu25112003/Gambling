import type { IconName } from '../components/shared/icons';
import type { GameManifest } from '../types';

export interface GameVisual {
  icon: IconName;
  /** Background wash behind the art placeholder. */
  tint: string;
  /** Icon colour. */
  tone: string;
  /** Commissioned card art in `public/games/`, when it exists. */
  art?: string;
}

/**
 * The per-game colour and glyph pairs from the design. Keyed by game name
 * because the manifest `id` is chosen by whoever registers the game in
 * `backend/src/games/registry.ts`, while the name is what the design labels.
 */
const BY_NAME: Record<string, GameVisual> = {
  'coin flip': {
    icon: 'coin',
    tint: 'rgba(234,179,8,0.14)',
    tone: 'var(--gold)',
    art: '/games/Coin_Flip.png',
  },
  dice: { icon: 'dice', tint: 'rgba(34,197,94,0.14)', tone: 'var(--green)' },
  mines: { icon: 'bomb', tint: 'rgba(248,113,113,0.13)', tone: 'var(--red)' },
  roulette: { icon: 'roulette', tint: 'rgba(168,85,247,0.14)', tone: '#a855f7' },
  crash: { icon: 'rocket', tint: 'rgba(59,130,246,0.14)', tone: '#60a5fa' },
  blackjack: { icon: 'cards', tint: 'rgba(34,197,94,0.14)', tone: 'var(--green)' },
};

const FALLBACK: GameVisual = { icon: 'dice', tint: 'rgba(34,197,94,0.14)', tone: 'var(--green)' };

export function gameVisual(game: Pick<GameManifest, 'name'>): GameVisual {
  return BY_NAME[game.name.trim().toLowerCase()] ?? FALLBACK;
}
