import { Heart } from 'lucide-react';
import { NARUTO, NARUTO_FONT } from './narutoTheme';

/**
 * Compact opponent row for 3-4 seat matches, ported from the mock's
 * `data-rival-mini` block — a small "52" back badge + name/count, used
 * where the mock's single big face-down RIVAL CARD column doesn't
 * generalize past one opponent. Live values aren't shown inline here: the
 * shared RoundRevealOverlay is the single place a reveal plays out for any
 * seat count, so this stays face-down between rounds — matching the mock's
 * own face-down default state.
 */
export function RivalMiniRow({
  displayName,
  cardsLeft,
  lives,
  isLeader,
  isEliminated,
}: {
  displayName: string;
  cardsLeft: number;
  lives: number;
  isLeader: boolean;
  isEliminated: boolean;
}) {
  return (
    <div
      className="flex w-full items-center gap-3 px-3.5 py-2.5"
      style={{
        background: NARUTO.panel,
        border: `1px solid ${isLeader ? NARUTO.gold : NARUTO.panelBorder}`,
        borderRadius: 14,
        boxSizing: 'border-box',
        opacity: isEliminated ? 0.4 : 1,
      }}
    >
      <div
        className="flex flex-none items-center justify-center overflow-hidden"
        style={{
          width: 42,
          height: 62,
          borderRadius: 6,
          border: `2px solid ${NARUTO.ink}`,
          background: 'radial-gradient(80% 70% at 50% 42%, #f2762e 0%, #b0121a 82%)',
          fontFamily: NARUTO_FONT.display,
          fontSize: 15,
          color: NARUTO.gold,
          WebkitTextStroke: `2px ${NARUTO.ink}`,
        }}
      >
        52
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div
          style={{
            fontFamily: NARUTO_FONT.condensed,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '.22em',
            color: NARUTO.orange,
          }}
        >
          RIVAL · {cardsLeft} LEFT
        </div>
        <div
          className="truncate"
          style={{ fontFamily: NARUTO_FONT.display, fontSize: 15, color: NARUTO.cream }}
        >
          {displayName}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="truncate"
            style={{
              fontFamily: NARUTO_FONT.condensed,
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '.18em',
              color: NARUTO.faint,
            }}
          >
            {isEliminated ? 'ELIMINATED' : 'FACE DOWN'}
          </span>
          {!isEliminated && lives > 0 && (
            <span className="flex items-center gap-0.5">
              {Array.from({ length: lives }).map((_, i) => (
                <Heart key={i} className="size-2.5" style={{ fill: NARUTO.lose, color: NARUTO.lose }} />
              ))}
            </span>
          )}
        </div>
      </div>
      <div style={{ fontFamily: NARUTO_FONT.display, fontSize: 26, lineHeight: 1, color: NARUTO.panelBorder }}>?</div>
    </div>
  );
}
