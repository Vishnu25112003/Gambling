import { Link } from 'react-router-dom';
import { formatSol, formatSolSigned } from '../../lib/format';
import { Avatar } from '../shared/Avatar';
import { TierBadge } from '../profile/TierBadge';
import type { LeaderboardEntry } from '../../types';

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

const RANK_STYLE: Record<number, { border: string; background: string }> = {
  1: { border: 'rgba(234,179,8,0.4)', background: 'linear-gradient(160deg, rgba(234,179,8,0.14), transparent 70%)' },
  2: { border: 'rgba(203,213,201,0.3)', background: 'linear-gradient(160deg, rgba(203,213,201,0.1), transparent 70%)' },
  3: { border: 'rgba(194,112,58,0.35)', background: 'linear-gradient(160deg, rgba(194,112,58,0.12), transparent 70%)' },
};

/** The top-3 podium cards above the full leaderboard table. */
export function LeaderboardPodium({ entries }: { entries: LeaderboardEntry[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
      {top3.map((p) => {
        const profit = Number(p.netProfit);
        const style = RANK_STYLE[p.rank] ?? RANK_STYLE[3]!;
        return (
          <Link
            key={`${p.rank}-${p.name}`}
            to={`/dashboard/u/${p.handle}`}
            className="flex flex-col items-center rounded-[16px] border p-5 text-center transition hover:brightness-110"
            style={{ borderColor: style.border, background: style.background }}
          >
            <span className="font-mono text-[10px] tracking-[0.16em] text-faint">#{p.rank}</span>
            <Avatar src={p.avatarUrl} name={p.name} address={p.walletShort} size={56} radiusRatio={0.5} />
            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="truncate font-heading text-[14px] font-bold">{p.name}</span>
              {p.isYou && <span className="shrink-0 text-[10px] font-bold text-green">you</span>}
            </div>
            <div className="mt-1">
              <TierBadge tier={p.tier} label={TIER_LABEL[p.tier]} size="sm" />
            </div>
            <div
              className={`mt-2.5 font-heading text-[20px] font-extrabold ${profit >= 0 ? 'text-green' : 'text-red'}`}
            >
              {formatSolSigned(p.netProfit)} SOL
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted">
              {formatSol(p.totalWagered)} SOL wagered
            </div>
          </Link>
        );
      })}
    </div>
  );
}
