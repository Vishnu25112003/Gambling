import { Link } from 'react-router-dom';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { formatSolSigned } from '../../lib/format';
import { Card, EmptyState, SectionHeading, Spinner } from '../shared/ui';

/**
 * Doc 06: "a small preview of top players (pulls from the same leaderboard data
 * the dashboard uses, just fewer entries)". Same hook, smaller limit.
 */
export function LeaderboardTeaser() {
  const { entries, loading } = useLeaderboard(5);

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <SectionHeading
        title="Top players"
        subtitle="Ranked by net profit across every game in the hub."
        action={
          <Link to="/dashboard/leaderboard" className="text-sm font-semibold text-neon-400">
            View all →
          </Link>
        }
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No games played yet"
            body="The board fills up as soon as the first match settles."
          />
        ) : (
          <ul className="divide-y divide-ink-800">
            {entries.map((e) => (
              <li key={e.rank} className="flex items-center gap-4 px-5 py-3.5">
                <span className="w-6 text-sm font-bold text-ink-400">{e.rank}</span>
                <span className="flex-1 font-medium">{e.name}</span>
                <span
                  className={`font-mono text-sm font-semibold ${
                    Number(e.netProfit) >= 0 ? 'text-neon-400' : 'text-danger-400'
                  }`}
                >
                  {formatSolSigned(e.netProfit)} SOL
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
