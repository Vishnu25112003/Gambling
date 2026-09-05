/**
 * Naruto-themed trump card, pixel-ported from the Claude Design mock's
 * `NarutoCard.dc.html`: a suit/rank + village header bar, a portrait panel,
 * a name/title plate, and a 6-row stat panel with progress bars — all on a
 * single flip card (front/back driven by the `face` prop, animated via a
 * real 3D CSS transform so the same instance flips in place, exactly like
 * the mock's `dc-import ... face="{{ cpuFace }}"`).
 *
 * Sizing follows the mock: the card fills its container's width at a fixed
 * 63:96 aspect ratio, and every internal metric is a `cqw` (container-query
 * width) unit so one component scales correctly from a 90px opponent-mini
 * card up to a 400px hero card — no discrete size variants needed.
 *
 * Card *data* (suit/rank/stats) stays exactly what the backend deals — see
 * backend/src/games/trumpcard/types.ts. Only the character identity (name/
 * title/village) and stat labels/order are cosmetic, from narutoData.ts.
 */

import { NARUTO, NARUTO_FONT } from './narutoTheme';
import { getCharacter, STAT_META } from './narutoData';

export type TrumpSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface TrumpCardData {
  id: string;
  suit: TrumpSuit;
  rank: number; // 2-14, 11=J 12=Q 13=K 14=A
  stats: Record<string, number>;
}

export type CardFace = 'front' | 'back';
export type CardSize = 'sm' | 'md' | 'lg';

/** Convenience max-widths for existing call sites — the card itself is fluid. */
const SIZE_MAX_WIDTH: Record<CardSize, number> = { sm: 92, md: 160, lg: 220 };

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

/** Kept for callers that just want the label text (order-agnostic uses). */
export const STAT_LABEL: Record<string, string> = Object.fromEntries(STAT_META.map((s) => [s.key, s.label]));

function clamp(minPx: number, cqwVal: number, maxPx: number): string {
  return `clamp(${minPx}px,${cqwVal}cqw,${maxPx}px)`;
}
const cq = (n: number): string => `${n}cqw`;

interface StatTone {
  bg: string;
  labelColor: string;
  valueColor: string;
  barColor: string;
}

const STAT_TONE_DEFAULT: StatTone = {
  bg: 'rgba(23,20,27,0)',
  labelColor: '#6d5406',
  valueColor: NARUTO.ink,
  barColor: NARUTO.ink,
};
const STAT_TONE_SELECTED: StatTone = { bg: NARUTO.ink, labelColor: '#ffb347', valueColor: NARUTO.gold, barColor: NARUTO.gold };
const STAT_TONE_WIN: StatTone = { bg: '#173b23', labelColor: NARUTO.win, valueColor: NARUTO.win, barColor: NARUTO.win };
const STAT_TONE_LOSE: StatTone = { bg: '#3a1414', labelColor: NARUTO.lose, valueColor: NARUTO.lose, barColor: NARUTO.lose };

export function TrumpcardCard({
  card,
  face = 'front',
  size,
  selectedStat = null,
  winningStat = null,
  losingStat = null,
  onStatTap,
  onFlip,
  footerHint,
  className = '',
}: {
  card: TrumpCardData;
  face?: CardFace;
  /** Optional convenience cap — the card otherwise fills its parent's width. */
  size?: CardSize;
  selectedStat?: string | null;
  winningStat?: string | null;
  losingStat?: string | null;
  onStatTap?: (stat: string) => void;
  onFlip?: () => void;
  /** Left-hand footer copy, e.g. "PICK A STAT" vs "WAITING…". */
  footerHint?: string;
  className?: string;
}) {
  const character = getCharacter(card.id);
  const isRed = RED_SUITS.has(card.suit);
  const suitColor = isRed ? NARUTO.red : NARUTO.ink;

  return (
    <div
      className={className}
      style={{
        width: '100%',
        maxWidth: size ? SIZE_MAX_WIDTH[size] : undefined,
        aspectRatio: '63 / 96',
        containerType: 'inline-size',
        perspective: '1200px',
        fontFamily: NARUTO_FONT.body,
      }}
      onClick={onFlip}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform .55s cubic-bezier(.4,.1,.2,1)',
          transform: face === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front face */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            background: NARUTO.card,
            border: `${cq(1.3)} solid ${NARUTO.ink}`,
            borderRadius: cq(4.5),
            boxShadow: `0 ${cq(3)} ${cq(6)} rgba(0,0,0,.45)`,
            padding: cq(2.2),
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: cq(1.5),
            overflow: 'hidden',
          }}
        >
          {/* Header: rank/suit + NARUTO 52 / village */}
          <div
            style={{
              display: 'flex',
              height: cq(10.5),
              border: `${cq(0.9)} solid ${NARUTO.ink}`,
              borderRadius: cq(1.6),
              overflow: 'hidden',
              flex: 'none',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: cq(17),
                background: NARUTO.gold,
                borderRight: `${cq(0.9)} solid ${NARUTO.ink}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: cq(0.5),
                fontFamily: NARUTO_FONT.display,
                fontSize: clamp(11, 4.3, 26),
                lineHeight: 1,
                color: suitColor,
              }}
            >
              {rankLabel(card.rank)}
              {SUIT_GLYPH[card.suit]}
            </div>
            <div
              style={{
                flex: 1,
                background: NARUTO.ink,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `0 ${cq(2.2)}`,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: NARUTO_FONT.condensed,
                  fontWeight: 700,
                  fontSize: clamp(8, 3.1, 17),
                  letterSpacing: '.2em',
                  color: NARUTO.cream,
                  whiteSpace: 'nowrap',
                }}
              >
                NARUTO 52
              </span>
              <span
                style={{
                  fontFamily: NARUTO_FONT.condensed,
                  fontWeight: 700,
                  fontSize: clamp(8, 2.8, 15),
                  letterSpacing: '.16em',
                  color: NARUTO.orange,
                  whiteSpace: 'nowrap',
                }}
              >
                {character.village.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Portrait slot */}
          <div
            style={{
              position: 'relative',
              height: cq(44),
              border: `${cq(0.9)} solid ${NARUTO.ink}`,
              borderRadius: cq(1.6),
              overflow: 'hidden',
              flex: 'none',
              boxSizing: 'border-box',
              background: 'linear-gradient(155deg,#ffb347 0%,#f2762e 45%,#b0121a 100%)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `radial-gradient(${NARUTO.ink} 1.2px, transparent 1.3px)`,
                backgroundSize: '8px 8px',
                opacity: 0.16,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: NARUTO_FONT.display,
                fontSize: clamp(28, 16, 96),
                color: 'rgba(23,20,27,.28)',
                userSelect: 'none',
              }}
              aria-hidden
            >
              {character.name.charAt(0)}
            </div>
          </div>

          {/* Name / title plate */}
          <div
            style={{
              background: NARUTO.red,
              border: `${cq(0.9)} solid ${NARUTO.ink}`,
              borderRadius: cq(1.6),
              padding: `${cq(1.3)} ${cq(2)}`,
              flex: 'none',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: cq(0.2),
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                fontFamily: NARUTO_FONT.display,
                fontSize: clamp(12, 4.6, 26),
                lineHeight: 1.05,
                color: '#fff',
                letterSpacing: '-.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {character.name}
            </div>
            <div
              style={{
                fontFamily: NARUTO_FONT.condensed,
                fontWeight: 700,
                fontSize: clamp(8, 2.7, 15),
                letterSpacing: '.17em',
                color: '#ffd9b0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {character.title}
            </div>
          </div>

          {/* Stats */}
          <div
            style={{
              flex: 1,
              background: NARUTO.gold,
              border: `${cq(0.9)} solid ${NARUTO.ink}`,
              borderRadius: cq(1.6),
              padding: cq(1.2),
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: cq(0.7),
              overflow: 'hidden',
            }}
          >
            {STAT_META.map(({ key, label }) => {
              const value = card.stats[key] ?? 0;
              const tone = winningStat === key
                ? STAT_TONE_WIN
                : losingStat === key
                  ? STAT_TONE_LOSE
                  : selectedStat === key
                    ? STAT_TONE_SELECTED
                    : STAT_TONE_DEFAULT;
              const interactive = Boolean(onStatTap);
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={interactive ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (interactive) onStatTap?.(key);
                  }}
                  className={interactive ? 'cursor-pointer hover:bg-[rgba(23,20,27,.13)] active:scale-[.985]' : 'cursor-default'}
                  style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1.5fr) minmax(0,.62fr)',
                    alignItems: 'center',
                    gap: cq(1.2),
                    padding: `0 ${cq(1.4)}`,
                    borderRadius: cq(1.2),
                    userSelect: 'none',
                    transition: 'background .15s, transform .12s',
                    background: tone.bg,
                  }}
                >
                  <span
                    style={{
                      fontFamily: NARUTO_FONT.condensed,
                      fontWeight: 700,
                      fontSize: clamp(10, 2.9, 16),
                      letterSpacing: '.06em',
                      lineHeight: 1.05,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: tone.labelColor,
                    }}
                  >
                    {label}
                  </span>
                  <div
                    style={{
                      height: cq(2.2),
                      borderRadius: '99px',
                      background: 'rgba(23,20,27,.15)',
                      overflow: 'hidden',
                      boxShadow: `inset 0 0 0 ${cq(0.25)} rgba(23,20,27,.22)`,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '99px',
                        transition: 'width .35s',
                        width: `${Math.max(4, Math.min(100, value))}%`,
                        background: tone.barColor,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: NARUTO_FONT.display,
                      fontSize: clamp(12, 5, 27),
                      lineHeight: 1,
                      textAlign: 'right',
                      color: tone.valueColor,
                    }}
                  >
                    {value}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flex: 'none',
              fontFamily: NARUTO_FONT.condensed,
              fontWeight: 700,
              fontSize: clamp(7, 2.5, 13),
              letterSpacing: '.2em',
              color: '#5b5560',
              padding: `0 ${cq(0.6)}`,
            }}
          >
            <span>{footerHint ?? 'TAP A STAT'}</span>
            <span>NARUTO TRUMP 52</span>
          </div>
        </div>

        {/* Back face */}
        <CardBackFaceInner flipped />
      </div>
    </div>
  );
}

/**
 * The back-face artwork, shared by the flip card above and the standalone
 * pile below. `flipped` applies the rotateY(180deg) + backface-visibility
 * pairing needed when this sits inside the animated 3D flip wrapper above —
 * omit it for a standalone (never-flipping) back, which would otherwise
 * render invisible (rotated away from the viewer with no front face to
 * balance it).
 */
function CardBackFaceInner({ flipped = false }: { flipped?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backfaceVisibility: flipped ? 'hidden' : undefined,
        transform: flipped ? 'rotateY(180deg)' : undefined,
        background: NARUTO.card,
        border: `${cq(1.3)} solid ${NARUTO.ink}`,
        borderRadius: cq(4.5),
        boxShadow: `0 ${cq(3)} ${cq(6)} rgba(0,0,0,.45)`,
        padding: cq(2.4),
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: cq(2.4),
          border: `${cq(1.2)} solid ${NARUTO.ink}`,
          borderRadius: cq(2.6),
          overflow: 'hidden',
          background: 'radial-gradient(80% 70% at 50% 42%, #f2762e 0%, #b0121a 82%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: cq(0.4),
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-conic-gradient(from 0deg at 50% 44%, rgba(255,255,255,.13) 0deg 7deg, transparent 7deg 15deg)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(${NARUTO.ink} 1.5px, transparent 1.6px)`,
            backgroundSize: '11px 11px',
            opacity: 0.18,
          }}
        />
        <div
          style={{
            position: 'relative',
            fontFamily: NARUTO_FONT.display,
            fontSize: cq(16),
            lineHeight: 0.9,
            color: NARUTO.gold,
            WebkitTextStroke: `${cq(2.2)} ${NARUTO.ink}`,
            paintOrder: 'stroke fill',
            letterSpacing: '-.02em',
            transform: 'rotate(-7deg)',
          }}
        >
          NARUTO
        </div>
        <div
          style={{
            position: 'relative',
            fontFamily: NARUTO_FONT.display,
            fontSize: cq(26),
            lineHeight: 0.86,
            color: NARUTO.cream,
            WebkitTextStroke: `${cq(3)} ${NARUTO.ink}`,
            paintOrder: 'stroke fill',
            transform: 'rotate(-7deg)',
          }}
        >
          52
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: cq(4),
            background: NARUTO.ink,
            color: NARUTO.gold,
            fontFamily: NARUTO_FONT.condensed,
            fontWeight: 700,
            fontSize: cq(3.4),
            letterSpacing: '.32em',
            padding: `${cq(1.4)} ${cq(3.4)}`,
          }}
        >
          TRUMP CARDS
        </div>
      </div>
    </div>
  );
}

/** A face-down pile — used to represent an opponent's hand without revealing content. */
export function TrumpcardBack({ size = 'sm', className = '' }: { size?: CardSize; className?: string }) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        maxWidth: SIZE_MAX_WIDTH[size],
        aspectRatio: '63 / 96',
        containerType: 'inline-size',
        position: 'relative',
      }}
    >
      <CardBackFaceInner />
    </div>
  );
}

