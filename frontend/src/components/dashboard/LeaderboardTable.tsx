import { Link } from 'react-router-dom';
import { formatSol, formatSolSigned } from '../../lib/format';
import { Avatar } from '../shared/Avatar';
import { TierBadge } from '../profile/TierBadge';
import type { LeaderboardEntry } from '../../types';

/** Gold, silver and bronze for the podium ranks; everyone else gets the muted chip. */
const RANK_STYLES: Record<number, { background: string; color: string }> = {
  1: { background: '#eab308', color: '#1a1505' },
  2: { background: '#cbd5c9', color: '#111a14' },
  3: { background: '#c2703a', color: '#1a1505' },
};
const DEFAULT_RANK = { background: 'var(--panel-bg2)', color: 'var(--muted)' };

/** Top-3 rows get a faint accent-tinted card; everyone else gets the plain panel shade. */
const ROW_BORDER: Record<number, string> = {
  1: 'rgba(234,179,8,.28)',
  2: 'rgba(203,213,201,.22)',
  3: 'rgba(194,112,58,.26)',
};
const ROW_BG: Record<number, string> = {
  1: 'rgba(234,179,8,.06)',
  2: 'rgba(203,213,201,.05)',
  3: 'rgba(194,112,58,.05)',
};

const TIER_LABEL: Record<LeaderboardEntry['tier'], string> = {
  unranked: 'Unranked',
  recruit: 'Recruit',
  scout: 'Scout',
  raider: 'Raider',
  striker: 'Striker',
  veteran: 'Veteran',
  elite: 'Elite',
  champion: 'Champion',
  master: 'Master',
  legend: 'Legend',
  grandmaster: 'Grandmaster',
};

function RankChip({ rank, size }: { rank: number; size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[7px] font-heading text-[12.5px] font-bold"
      style={{ width: size, height: size, ...(RANK_STYLES[rank] ?? DEFAULT_RANK) }}
    >
      {rank}
    </span>
  );
}

/**
 * The mockup's ranking row: rank chip, avatar, tier badge, name, "tier ·
 * wagered" subtext, profit. `compact` is the Overview panel, `full` the
 * Leaderboard tab — same shape, larger metrics on the full page.
 */
export function LeaderboardTable({
  entries,
  variant = 'compact',
}: {
  entries: LeaderboardEntry[];
  variant?: 'compact' | 'full';
}) {
  const full = variant === 'full';
  const rankSize = full ? 28 : 26;
  const avatarSize = full ? 32 : 30;

  return (
    <div className="flex flex-col gap-2">
      {entries.map((p) => {
        const profit = Number(p.netProfit);
        return (
          <div
            key={`${p.rank}-${p.name}`}
            className={`flex items-center gap-3 rounded-[11px] border ${full ? 'p-3' : 'p-2.5'}`}
            style={{ borderColor: ROW_BORDER[p.rank] ?? 'var(--panel-border-soft)', background: ROW_BG[p.rank] ?? 'var(--panel-bg3)' }}
          >
            <RankChip rank={p.rank} size={rankSize} />
            <Avatar src={p.avatarUrl} name={p.name} address={p.walletShort} size={avatarSize} radiusRatio={0.29} />
            <TierBadge tier={p.tier} label={TIER_LABEL[p.tier]} iconOnly />

            <div className="min-w-0 flex-1">
              <Link
                to={`/dashboard/u/${p.handle}`}
                className={`truncate font-mono text-[#e8f2ec] hover:underline ${full ? 'text-[13.5px]' : 'text-[13px]'}`}
                title={`View ${p.name}'s profile`}
              >
                {p.name}
                {p.isYou && <span className="ml-1.5 text-[11px] font-bold text-green">you</span>}
              </Link>
              <div className="mt-0.5 font-mono text-[10.5px] text-[#9ab5a6]">
                {TIER_LABEL[p.tier]} · {formatSol(p.totalWagered)} wagered
              </div>
            </div>

            <span
              className={`shrink-0 font-mono whitespace-nowrap ${full ? 'text-[13px]' : 'text-[12.5px]'} ${profit >= 0 ? 'text-green' : 'text-red'}`}
            >
              {formatSolSigned(p.netProfit)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
