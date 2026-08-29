/**
 * A generic stylized playing card — suit + rank in the corner, 6 stat pills
 * in the body. No per-card art pipeline exists in this repo (Trumpcard.png
 * is a single hub-tile promo image, like every other game's), so this is a
 * stat card rather than a character-portrait card.
 */

export type TrumpSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface TrumpCardData {
  id: string;
  suit: TrumpSuit;
  rank: number; // 2-14, 11=J 12=Q 13=K 14=A
  stats: Record<string, number>;
}

const SUIT_GLYPH: Record<TrumpSuit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const RED_SUITS = new Set<TrumpSuit>(['hearts', 'diamonds']);

const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export const STAT_LABEL: Record<string, string> = {
  power: 'Power',
  speed: 'Speed',
  defense: 'Defense',
  intellect: 'Intellect',
  stamina: 'Stamina',
  luck: 'Luck',
};

export type CardSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<CardSize, string> = {
  sm: 'w-[92px] text-[9px]',
  md: 'w-[160px] text-[11px]',
  lg: 'w-[220px] text-[13px]',
};

export function TrumpcardCard({
  card,
  size = 'md',
  selectedStat = null,
  winningStat = null,
  losingStat = null,
  onStatTap,
  className = '',
}: {
  card: TrumpCardData;
  size?: CardSize;
  selectedStat?: string | null;
  winningStat?: string | null;
  losingStat?: string | null;
  onStatTap?: (stat: string) => void;
  className?: string;
}) {
  const isRed = RED_SUITS.has(card.suit);
  const suitColor = isRed ? 'text-red' : 'text-text';
  const interactive = Boolean(onStatTap) && !selectedStat;

  return (
    <div
      className={`relative flex aspect-[5/7] flex-col overflow-hidden rounded-[12px] border-2 border-line
        bg-card p-2 shadow-[0_8px_24px_rgba(0,0,0,0.25)] ${SIZE_CLASS[size]} ${className}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center text-6xl
          opacity-[0.06] ${suitColor}`}
        aria-hidden
      >
        {SUIT_GLYPH[card.suit]}
      </span>

      <div className={`relative flex items-center justify-between font-extrabold ${suitColor}`}>
        <span>{rankLabel(card.rank)}</span>
        <span>{SUIT_GLYPH[card.suit]}</span>
      </div>

      <div className="relative mt-1.5 flex-1 space-y-1">
        {Object.entries(card.stats).map(([key, value]) => {
          const isWin = winningStat === key;
          const isLose = losingStat === key;
          const isSelected = selectedStat === key;
          const toneClass = isWin
            ? 'border-green-solid bg-green-solid/15 text-green'
            : isLose
              ? 'border-red/40 bg-red/10 text-red'
              : isSelected
                ? 'border-gold bg-gold/15 text-gold'
                : 'border-line bg-bg2 text-muted';

          return (
            <button
              key={key}
              type="button"
              disabled={!interactive}
              onClick={() => onStatTap?.(key)}
              className={`flex w-full items-center justify-between rounded-[7px] border px-1.5 py-[3px]
                transition ${toneClass} ${interactive ? 'cursor-pointer hover:border-green-solid/60' : 'cursor-default'}`}
            >
              <span className="font-semibold">{STAT_LABEL[key] ?? key}</span>
              <span className="font-mono font-bold">{value}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A face-down pile — used to represent an opponent's hand without revealing content. */
export function TrumpcardBack({ size = 'sm', className = '' }: { size?: CardSize; className?: string }) {
  return (
    <div
      className={`flex aspect-[5/7] items-center justify-center rounded-[12px] border-2 border-line
        bg-[linear-gradient(135deg,var(--bg2),var(--card))] ${SIZE_CLASS[size]} ${className}`}
    >
      <span className="text-2xl opacity-40">🂠</span>
    </div>
  );
}
