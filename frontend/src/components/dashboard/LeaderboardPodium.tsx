import { Link } from 'react-router-dom';
import { formatSol, formatSolSigned } from '../../lib/format';
import { TIER_BADGE_IMAGE } from '../../lib/tierBadges';
import type { LeaderboardEntry } from '../../types';

const RANK_BORDER: Record<number, string> = {
  1: 'rgba(234,179,8,.4)',
  2: 'rgba(203,213,201,.32)',
  3: 'rgba(194,112,58,.36)',
};
const RANK_BG: Record<number, string> = {
  1: 'linear-gradient(160deg, rgba(234,179,8,.14), transparent 70%)',
  2: 'linear-gradient(160deg, rgba(203,213,201,.1), transparent 70%)',
  3: 'linear-gradient(160deg, rgba(194,112,58,.12), transparent 70%)',
};

const TIER_LABEL: Record<LeaderboardEntry['tier'], string> = {
  unranked: 'UNRANKED',
  recruit: 'RECRUIT',
  scout: 'SCOUT',
  raider: 'RAIDER',
  striker: 'STRIKER',
  veteran: 'VETERAN',
  elite: 'ELITE',
  champion: 'CHAMPION',
  master: 'MASTER',
  legend: 'LEGEND',
  grandmaster: 'GRANDMASTER',
};

/** The top-3 podium cards above the full leaderboard table — exact mockup spec. */
export function LeaderboardPodium({ entries }: { entries: LeaderboardEntry[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      {top3.map((p) => {
        const profit = Number(p.netProfit);
        const badge = p.tier === 'unranked' ? null : TIER_BADGE_IMAGE[p.tier as keyof typeof TIER_BADGE_IMAGE];
        return (
          <Link
            key={`${p.rank}-${p.name}`}
            to={`/dashboard/u/${p.handle}`}
            className="rounded-2xl border p-5 text-center transition hover:brightness-110"
            style={{ borderColor: RANK_BORDER[p.rank] ?? 'var(--panel-border)', background: RANK_BG[p.rank] ?? 'var(--panel-bg)' }}
          >
            <div className="font-mono text-[10px] tracking-[0.16em] text-[#8fa89b]">#{p.rank}</div>
            <span
              className="mx-auto mt-3 mb-1 block size-[76px] bg-contain bg-center bg-no-repeat"
              style={badge ? { backgroundImage: `url(${badge})` } : undefined}
            />
            <div className="font-mono text-[9.5px] tracking-[0.12em] text-[#f7d774]">{TIER_LABEL[p.tier]}</div>
            <span className="mx-auto mt-3.5 mb-2.5 block size-[46px] rounded-[13px]" style={{ background: `linear-gradient(135deg, var(--green-solid), var(--green-deep))` }} />
            <div className="font-mono text-[15px] text-[#eafff3]">{p.name}</div>
            <div className={`mt-2 font-heading text-[22px] font-bold ${profit >= 0 ? 'text-green' : 'text-red'}`}>
              {formatSolSigned(p.netProfit)}
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-[#9ab5a6]">
              {formatSol(p.totalWagered)} WAGERED
            </div>
          </Link>
        );
      })}
    </div>
  );
}
