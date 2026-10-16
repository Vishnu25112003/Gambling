import { Link } from 'react-router-dom';
import { formatSol, formatSolSigned } from '../../lib/format';
import { TIER_BADGE_IMAGE } from '../../lib/tierBadges';
import { Avatar } from '../shared/Avatar';
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
/** Classic podium order — 2nd, 1st, 3rd — with the winner standing tallest. */
const RANK_ORDER: Record<number, string> = { 1: 'order-2', 2: 'order-1', 3: 'order-3' };

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

/**
 * The top-3 podium above the full leaderboard table.
 *
 * It stays a single 2-1-3 row at every width. It used to be `auto-fit
 * minmax(200px, 1fr)`, which on a phone collapsed to one column of three
 * ~320px cards and pushed the actual ranking a thousand pixels down the page.
 */
export function LeaderboardPodium({ entries }: { entries: LeaderboardEntry[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="mb-[18px] flex items-end justify-center gap-2 sm:gap-3">
      {top3.map((p) => {
        const profit = Number(p.netProfit);
        const first = p.rank === 1;
        const badge = p.tier === 'unranked' ? null : TIER_BADGE_IMAGE[p.tier as keyof typeof TIER_BADGE_IMAGE];
        return (
          <Link
            key={`${p.rank}-${p.name}`}
            to={`/dashboard/u/${p.handle}`}
            className={`${RANK_ORDER[p.rank] ?? ''} min-w-0 flex-1 basis-0 rounded-2xl border px-1.5 text-center transition hover:brightness-110 sm:max-w-[260px] sm:px-4 ${
              first ? 'pt-5 pb-4 sm:pt-7 sm:pb-6' : 'py-3 sm:py-5'
            }`}
            style={{ borderColor: RANK_BORDER[p.rank] ?? 'var(--panel-border)', background: RANK_BG[p.rank] ?? 'var(--panel-bg)' }}
          >
            <div className="font-mono text-[10px] tracking-[0.16em] text-muted">#{p.rank}</div>
            <span
              className={`mx-auto mt-1.5 block bg-contain bg-center bg-no-repeat sm:mt-3 ${
                first ? 'size-[52px] sm:size-[76px]' : 'size-[40px] sm:size-[60px]'
              }`}
              style={badge ? { backgroundImage: `url(${badge})` } : undefined}
            />
            <div className="mt-0.5 font-mono text-[8.5px] tracking-[0.08em] text-gold-bright sm:text-[9.5px] sm:tracking-[0.12em]">
              {TIER_LABEL[p.tier]}
            </div>
            <div className="mt-2 flex justify-center sm:mt-3.5">
              <Avatar src={p.avatarUrl} name={p.name} address={p.walletShort} size={first ? 44 : 38} radiusRatio={0.29} />
            </div>
            <div className="mt-2 truncate font-mono text-[11.5px] text-text sm:text-[15px]">{p.name}</div>
            <div
              className={`mt-1 truncate font-heading text-[14px] font-bold sm:mt-2 sm:text-[22px] ${profit >= 0 ? 'text-green' : 'text-red'}`}
            >
              {formatSolSigned(p.netProfit)}
            </div>
            <div className="mt-0.5 truncate font-mono text-[9px] text-muted sm:mt-1 sm:text-[10.5px]">
              {formatSol(p.totalWagered)} WAGERED
            </div>
          </Link>
        );
      })}
    </div>
  );
}
