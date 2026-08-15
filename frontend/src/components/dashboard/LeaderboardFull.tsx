import { useLeaderboard } from '../../hooks/useLeaderboard';
import { formatSol, formatSolSigned } from '../../lib/format';
import { Card, EmptyState, SectionHeading, Spinner } from '../shared/ui';

/** Doc 06: ungated — the full board renders without a wallet connection. */
export function LeaderboardFull() {
  const { entries, loading } = useLeaderboard(50);

  return (
    <section>
      <SectionHeading title="Leaderboard" subtitle="Ranked by lifetime net profit." />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="Nobody on the board yet"
            body="Rankings appear once the first matches have settled."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3 font-semibold">#</th>
                  <th className="px-5 py-3 font-semibold">Player</th>
                  <th className="px-5 py-3 text-right font-semibold">Net profit</th>
                  <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">
                    Wagered
                  </th>
                  <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Games</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {entries.map((e) => (
                  <tr key={e.rank} className={e.isYou ? 'bg-neon-500/5' : undefined}>
                    <td className="px-5 py-3 font-bold text-ink-400">{e.rank}</td>
                    <td className="px-5 py-3 font-medium">
                      {e.name}
                      {e.isYou && <span className="ml-2 text-xs text-neon-400">you</span>}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono font-semibold ${
                        Number(e.netProfit) >= 0 ? 'text-neon-400' : 'text-danger-400'
                      }`}
                    >
                      {formatSolSigned(e.netProfit)}
                    </td>
                    <td className="hidden px-5 py-3 text-right font-mono text-ink-300 sm:table-cell">
                      {formatSol(e.totalWagered)}
                    </td>
                    <td className="hidden px-5 py-3 text-right text-ink-300 sm:table-cell">
                      {e.gamesPlayed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
