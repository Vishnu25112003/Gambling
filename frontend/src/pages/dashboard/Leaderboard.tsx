import { LeaderboardTable } from '../../components/dashboard/LeaderboardTable';
import { LeaderboardPodium } from '../../components/dashboard/LeaderboardPodium';
import { EmptyState, Spinner } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';
import { useLeaderboard } from '../../hooks/useLeaderboard';

/** Doc 06: ungated — the full board renders without a wallet connection. */
export function Leaderboard() {
  const { entries, loading } = useLeaderboard(50);

  return (
    <>
      <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">
        LEADERBOARD
      </h1>
      <p className="mb-5 text-sm text-muted">Ranked by lifetime net profit — season 01.</p>

      {loading ? (
        <div className="flex justify-center rounded-2xl border py-16" style={{ borderColor: 'var(--panel-border-soft)' }}>
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon name="trophy" size={34} />}
          title="Nobody on the board yet"
          body="Rankings appear once the first matches have settled."
        />
      ) : (
        <>
          <LeaderboardPodium entries={entries} />
          <section
            className="overflow-x-auto rounded-2xl border p-4"
            style={{ borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg)' }}
          >
            <LeaderboardTable entries={entries} variant="full" />
          </section>
        </>
      )}
    </>
  );
}
