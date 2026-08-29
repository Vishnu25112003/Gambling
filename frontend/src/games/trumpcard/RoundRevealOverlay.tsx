import { useEffect, useState } from 'react';
import { STAT_LABEL, TrumpcardCard, type TrumpCardData } from './TrumpcardCard';

/**
 * Staged full-screen reveal: a banner naming the stat, then every active
 * player's top card pops in with the compared stat highlighted, then a
 * stat-bar race, then the winner text. Ports the interaction pattern from
 * the Gaming_Hub reference demo's ComparisonOverlay (plain React state +
 * setTimeout, no animation library — consistent with the rest of this repo).
 * Timed to roughly match the backend's ROUND_REVEAL_DELAY_MS (4s) so it
 * finishes right as the next leader turn arrives.
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[rgba(6,2,26,0.85)] px-4 backdrop-blur-sm">
      <div className="animate-fade-up rounded-full border border-gold/40 bg-gold/10 px-5 py-2 text-sm font-bold text-gold">
        {STAT_LABEL[statKey] ?? statKey}
      </div>

      {stage >= 1 && (
        <div className="flex flex-wrap items-end justify-center gap-4">
          {comparison.map((entry) => {
            const isWinner = !isTie && entry.userId === winnerId;
            const isTied = isTie && tiedIds.includes(entry.userId);
            return (
              <div key={entry.userId} className="flex animate-fade-up flex-col items-center gap-2">
                {isWinner && <span className="text-xl">👑</span>}
                <TrumpcardCard
                  card={entry.card}
                  size="md"
                  winningStat={isWinner ? statKey : null}
                  losingStat={!isTie && !isWinner ? statKey : null}
                  className={isWinner ? '-translate-y-2 border-gold' : isTied ? 'border-gold/60' : ''}
                />
                <span className={`text-xs font-bold ${entry.userId === myId ? 'text-green' : 'text-muted'}`}>
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
              <span className="w-20 truncate text-xs text-muted">
                {entry.userId === myId ? 'You' : getDisplayName(entry.userId)}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg2">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    !isTie && entry.userId === winnerId ? 'bg-gold' : 'bg-green-solid/50'
                  }`}
                  style={{ width: `${(entry.value / maxValue) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs font-bold">{entry.value}</span>
            </div>
          ))}
        </div>
      )}

      {stage >= 3 && (
        <div className="animate-fade-up text-center">
          {isTie ? (
            <p className="text-lg font-extrabold text-gold">Tied — cards pool for the next round</p>
          ) : (
            <p className="text-lg font-extrabold text-green">
              {winnerId === myId ? 'You win the round!' : `${getDisplayName(winnerId ?? '')} wins the round`}
              {poolClaimedBy && ' + claims the pool'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
