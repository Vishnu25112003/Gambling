import { LeaderboardTable } from '../../components/dashboard/LeaderboardTable';
import { Card, EmptyState, PageTitle, Spinner } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';
import { useLeaderboard } from '../../hooks/useLeaderboard';

/** Doc 06: ungated — the full board renders without a wallet connection. */
export function Leaderboard() {
  const { entries, loading } = useLeaderboard(50);

  return (
    <>
      <PageTitle title="Leaderboard" subtitle="Ranked by lifetime net profit." />

      {loading ? (
        <Card className="flex justify-center py-16">
          <Spinner />
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon name="trophy" size={34} />}
          title="Nobody on the board yet"
          body="Rankings appear once the first matches have settled."
        />
      ) : (
        <Card className="overflow-x-auto px-[22px] pt-2 pb-3">
          <LeaderboardTable entries={entries} variant="full" />
        </Card>
      )}
    </>
  );
}
