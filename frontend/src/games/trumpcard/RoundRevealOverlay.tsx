import { useEffect, useState } from 'react';
import { STAT_LABEL, TrumpcardCard, type TrumpCardData } from './TrumpcardCard';
import { NARUTO, NARUTO_FONT } from './narutoTheme';

/**
 * Staged full-screen reveal: a banner naming the stat, then every active
 * player's top card pops in with the compared stat highlighted, then a
 * stat-bar race, then the winner text. Ports the interaction pattern from
 * the Gaming_Hub reference demo's ComparisonOverlay (plain React state +
 * setTimeout, no animation library — consistent with the rest of this repo).
 * Timed to roughly match the backend's ROUND_REVEAL_DELAY_MS (4s) so it
 * finishes right as the next leader turn arrives.
 *
 * Reskinned to the Naruto ember/gold palette (see narutoTheme.ts).
 */

export interface RevealEntry {
  userId: string;
  card: TrumpCardData;
  value: number;
}

export function RoundRevealOverlay({
  statKey,
  comparison,
  winnerId,
  tiedIds,
  poolClaimedBy,
  getDisplayName,
  myId,
}: {
  statKey: string;
  comparison: RevealEntry[];
  winnerId: string | null;
  tiedIds: string[];
  poolClaimedBy: string | null;
  getDisplayName: (userId: string) => string;
  myId: string | null;
}) {
  const [stage, setStage] = useState(0);
  const cardIdsKey = comparison.map((c) => c.card.id).join(',');

  useEffect(() => {
    setStage(0);
    const timers = [
      setTimeout(() => setStage(1), 300),
      setTimeout(() => setStage(2), 1500),
      setTimeout(() => setStage(3), 2600),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statKey, cardIdsKey]);

  const isTie = tiedIds.length > 1;
  const maxValue = Math.max(...comparison.map((c) => c.value), 1);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-4 backdrop-blur-sm"
      style={{ background: 'rgba(10,7,6,0.88)', fontFamily: NARUTO_FONT.body }}
    >
      <div
        className="animate-fade-up rounded-full px-5 py-2 text-sm font-bold"
        style={{
          border: `1px solid rgba(245,197,24,.4)`,
          background: 'rgba(245,197,24,.1)',
          color: NARUTO.gold,
          fontFamily: NARUTO_FONT.condensed,
          letterSpacing: '.15em',
        }}
      >
        {STAT_LABEL[statKey] ?? statKey}
      </div>

      {stage >= 1 && (
        <div className="flex flex-wrap items-end justify-center gap-4">
          {comparison.map((entry) => {
            const isWinner = !isTie && entry.userId === winnerId;
            const isTied = isTie && tiedIds.includes(entry.userId);
            return (
              <div key={entry.userId} className="flex w-[110px] animate-fade-up flex-col items-center gap-2">
                {isWinner && <span className="text-xl">👑</span>}
                <TrumpcardCard
                  card={entry.card}
                  winningStat={isWinner ? statKey : null}
                  losingStat={!isTie && !isWinner ? statKey : null}
                  selectedStat={isTied ? statKey : null}
                  className={isWinner ? '-translate-y-2' : ''}
                  footerHint="REVEALED"
                />
                <span
                  className="text-xs font-bold"
                  style={{ color: entry.userId === myId ? NARUTO.win : NARUTO.muted }}
                >
                  {entry.userId === myId ? 'You' : getDisplayName(entry.userId)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {stage >= 2 && (
        <div className="w-full max-w-sm space-y-2">
          {comparison.map((entry) => (
            <div key={entry.userId} className="flex items-center gap-2">
              <span className="w-20 truncate text-xs" style={{ color: NARUTO.muted }}>
                {entry.userId === myId ? 'You' : getDisplayName(entry.userId)}
              </span>
              <div
                className="h-2.5 flex-1 overflow-hidden rounded-full"
                style={{ background: NARUTO.panel }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(entry.value / maxValue) * 100}%`,
                    background: !isTie && entry.userId === winnerId ? NARUTO.gold : 'rgba(124,228,164,.5)',
                  }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs font-bold" style={{ color: NARUTO.cream }}>
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {stage >= 3 && (
        <div className="animate-fade-up text-center">
          {isTie ? (
            <p className="text-lg font-extrabold" style={{ color: NARUTO.draw }}>
              Tied — cards pool for the next round
            </p>
          ) : (
            <p className="text-lg font-extrabold" style={{ color: NARUTO.win }}>
              {winnerId === myId ? 'You win the round!' : `${getDisplayName(winnerId ?? '')} wins the round`}
              {poolClaimedBy && ' + claims the pool'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
