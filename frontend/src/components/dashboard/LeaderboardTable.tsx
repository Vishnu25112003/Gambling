import { Link } from 'react-router-dom';
import { formatSol, formatSolSigned } from '../../lib/format';
import { PodiumBadge } from '../shared/icons';
import { Avatar } from '../shared/Avatar';
import { TierBadge } from '../profile/TierBadge';
import type { LeaderboardEntry } from '../../types';

/**
 * The design's rival five-gradient avatar palette used to live here. It is gone:
 * `<Avatar>` is now the one implementation, so a player is the same colour on this
 * board, in the top bar and on their profile — and it renders their uploaded image
 * when they have one.
 */

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
  const TIER_LABEL: Record<LeaderboardEntry['tier'], string> = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
    diamond: 'Diamond',
  };
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
                <Avatar
                  src={p.avatarUrl}
                  name={p.name}
                  address={p.walletShort}
                  size={full ? 32 : 30}
                  radiusRatio={0.5}
                />
                {/*
                  Only the NAME is the link, not the whole row — the numeric cells
                  stay selectable, and a stray click on a figure doesn't navigate.
                */}
                <Link
                  to={`/dashboard/u/${p.handle}`}
                  className={`truncate font-semibold text-text hover:underline ${
                    full ? 'text-sm' : 'text-[13.5px]'
                  }`}
                  title={`View ${p.name}'s profile`}
                >
                  {p.name}
                </Link>
                <TierBadge tier={p.tier} label={TIER_LABEL[p.tier]} iconOnly />
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
