import { formatSol, formatSolSigned } from '../../lib/format';
import type { ProfileStats } from '../../types';

/**
 * Doc 11 — the lifetime record.
 *
 * Money figures are tinted by sign, counts are not: a green "12 games played" is
 * meaningless, while a green net profit is the fastest read on the page.
 */

interface Stat {
  label: string;
  value: string;
  color?: string;
  /** Shown under the value — the "inside detail" a bare count can't carry. */
  hint?: string;
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className="rounded-[14px] border border-line bg-card p-[18px]">
      <div className="mb-2 text-[11px] font-semibold tracking-[0.05em] text-muted">
        {stat.label}
      </div>
      <div
        className="text-[21px] leading-tight font-extrabold"
        style={stat.color ? { color: stat.color } : undefined}
      >
        {stat.value}
      </div>
      {stat.hint && <div className="mt-1.5 text-[11.5px] text-faint">{stat.hint}</div>}
    </div>
  );
}

const signColor = (amount: string): string =>
  Number(amount) < 0 ? 'var(--red)' : Number(amount) > 0 ? 'var(--green)' : 'var(--text)';

function streakText(streak: ProfileStats['currentStreak']): { value: string; color?: string } {
  if (streak.kind === 'none') return { value: '—' };
  if (streak.kind === 'win') {
    return { value: `${streak.count}W`, color: 'var(--green)' };
  }
  return { value: `${streak.count}L`, color: 'var(--red)' };
}

export function StatGrid({ stats }: { stats: ProfileStats }) {
  const streak = streakText(stats.currentStreak);

  const cards: Stat[] = [
    {
      label: 'GAMES PLAYED',
      value: String(stats.gamesPlayed),
      hint:
        stats.gamesPlayed === 0
          ? 'No matches settled yet'
          : `${stats.gamesWon}W · ${stats.gamesLost}L${stats.gamesDrawn > 0 ? ` · ${stats.gamesDrawn}D` : ''}`,
    },
    {
      label: 'WIN RATE',
      // An em dash, never "0%" — a player with no matches has not lost anything.
      value: stats.winRate === null ? '—' : `${stats.winRate}%`,
      color: stats.winRate === null ? undefined : stats.winRate >= 50 ? 'var(--green)' : undefined,
      hint:
        stats.winRate === null
          ? 'Play a match to start your record'
          : `${stats.gamesWon} of ${stats.gamesPlayed} matches won`,
    },
    {
      label: 'NET PROFIT',
      value: `${formatSolSigned(stats.netProfit)} SOL`,
      color: signColor(stats.netProfit),
      hint: 'Lifetime, after fees',
    },
    {
      label: 'TOTAL WAGERED',
      value: `${formatSol(stats.totalWagered)} SOL`,
      hint: 'Drives your loyalty tier',
    },
    {
      label: 'BIGGEST WIN',
      value: `${formatSol(stats.biggestWin)} SOL`,
      color: Number(stats.biggestWin) > 0 ? 'var(--green)' : undefined,
      hint: 'Best single match',
    },
    {
      label: 'BIGGEST LOSS',
      value: `${formatSol(stats.biggestLoss)} SOL`,
      color: Number(stats.biggestLoss) < 0 ? 'var(--red)' : undefined,
      hint: 'Worst single match',
    },
    {
      label: 'CURRENT STREAK',
      value: streak.value,
      color: streak.color,
      hint: stats.bestWinStreak > 0 ? `Best run: ${stats.bestWinStreak} wins` : 'No run yet',
    },
    {
      label: 'AVERAGE STAKE',
      value: `${formatSol(stats.avgStake)} SOL`,
      hint: 'Per match',
    },
    {
      label: 'REFERRAL EARNED',
      value: `${formatSol(stats.referralEarnings)} SOL`,
      color: Number(stats.referralEarnings) > 0 ? 'var(--green)' : undefined,
      hint: 'Commission from invites',
    },
    // Wallet movement is private: these two are absent from another player's
    // profile, so the cards simply don't render there.
    ...(stats.totalDeposited !== undefined
      ? [
          {
            label: 'TOTAL DEPOSITED',
            value: `${formatSol(stats.totalDeposited)} SOL`,
            hint: 'Confirmed deposits',
          },
        ]
      : []),
    ...(stats.totalWithdrawn !== undefined
      ? [
          {
            label: 'TOTAL WITHDRAWN',
            value: `${formatSol(stats.totalWithdrawn)} SOL`,
            hint: 'Confirmed withdrawals',
          },
        ]
      : []),
    ...(stats.gamesForfeited > 0
      ? [
          {
            label: 'FORFEITED',
            value: String(stats.gamesForfeited),
            color: 'var(--red)',
            hint: 'Lost by disconnect',
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3.5">
      {cards.map((c) => (
        <StatCard key={c.label} stat={c} />
      ))}
    </div>
  );
}
