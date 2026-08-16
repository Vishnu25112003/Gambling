import { formatSol, formatSolSigned } from '../../lib/format';
import { PodiumBadge } from '../shared/icons';
import type { LeaderboardEntry } from '../../types';

/** The five avatar gradients from the design, assigned deterministically. */
const AVATARS = [
  'linear-gradient(135deg,#f59e0b,#b45309)',
  'linear-gradient(135deg,#a855f7,#6d28d9)',
  'linear-gradient(135deg,#22c55e,#15803d)',
  'linear-gradient(135deg,#38bdf8,#1d4ed8)',
  'linear-gradient(135deg,#f472b6,#9d174d)',
];

/** Same name -> same avatar on every load, with no avatar field in the API. */
function avatarFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

/** Gold, silver and bronze for the podium; everyone else gets the muted chip. */
const RANK_STYLES: Record<number, { background: string; color: string }> = {
  1: { background: '#eab308', color: '#1a1505' },
  2: { background: '#cbd5c9', color: '#111a14' },
  3: { background: '#c2703a', color: '#1a1505' },
};

const DEFAULT_RANK = { background: 'var(--border2)', color: 'var(--muted)' };

function RankPill({ rank }: { rank: number }) {
  return (
    <span
      className="flex size-[26px] items-center justify-center rounded-full text-xs font-bold"
      style={RANK_STYLES[rank] ?? DEFAULT_RANK}
    >
      {rank}
    </span>
  );
}

/**
 * The design's ranking table. `compact` is the overview panel, `full` the
 * Leaderboard tab — same columns, slightly larger metrics on the full page.
 */
export function LeaderboardTable({
  entries,
  variant = 'compact',
}: {
  entries: LeaderboardEntry[];
  variant?: 'compact' | 'full';
}) {
  const full = variant === 'full';
  const grid = 'grid grid-cols-[34px_1fr_auto_auto] items-center';
  const gap = full ? 'gap-3.5' : 'gap-3';

  return (
    <div className="overflow-x-auto">
      <div className={full ? 'min-w-[360px]' : 'min-w-[340px]'}>
        <div
          className={`${grid} ${gap} border-b border-line2 px-1 pt-3.5 pb-2.5 text-[11px] font-semibold tracking-[0.06em] text-faint`}
        >
          <span>#</span>
          <span>PLAYER</span>
          <span className="text-right">WAGERED</span>
          <span className="text-right">PROFIT</span>
        </div>

        {entries.map((p) => {
          const profit = Number(p.netProfit);
          return (
            <div
              key={`${p.rank}-${p.name}`}
              className={`${grid} ${gap} border-b border-line2 px-1 ${full ? 'py-3.5' : 'py-3'}`}
            >
              <RankPill rank={p.rank} />

              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`shrink-0 rounded-full ${full ? 'size-8' : 'size-[30px]'}`}
                  style={{ background: avatarFor(p.name) }}
                />
                <span
                  className={`truncate font-semibold ${full ? 'text-sm' : 'text-[13.5px]'}`}
                  title={p.name}
                >
                  {p.name}
                </span>
                {p.rank <= 3 && (
                  <span className="flex shrink-0 text-green" title={`Top ${p.rank}`}>
                    <PodiumBadge />
                  </span>
                )}
                {p.isYou && (
                  <span className="shrink-0 text-[11px] font-bold text-green">you</span>
                )}
              </span>

              <span
                className={`text-right font-semibold whitespace-nowrap ${full ? 'text-[13.5px]' : 'text-[13px]'}`}
              >
                {formatSol(p.totalWagered)} SOL
              </span>

              <span
                className={`text-right font-bold whitespace-nowrap ${
                  full ? 'text-[13.5px]' : 'text-[13px]'
                } ${profit >= 0 ? 'text-green' : 'text-red'}`}
              >
                {formatSolSigned(p.netProfit)} SOL
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
