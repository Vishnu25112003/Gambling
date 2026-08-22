import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, EmptyState, PageTitle, Spinner } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { TierProgress } from '../../components/profile/TierProgress';
import { StatGrid } from '../../components/profile/StatGrid';
import { ProfitCurve } from '../../components/profile/ProfitCurve';
import { PerGameTable } from '../../components/profile/PerGameTable';
import { MatchHistoryTable } from '../../components/profile/MatchHistoryTable';
import { useProfile } from '../../hooks/useProfile';
import { useMatchHistory } from '../../hooks/useMatchHistory';

/**
 * Doc 11 — somebody else's profile, read-only.
 *
 * UNGATED, per doc 06: a profile is public data, so a shared link opens without a
 * wallet. The API returns a different projection here — no balances, no deposits or
 * withdrawals, and a shortened wallet address — so this page cannot leak them even
 * if it tried.
 */
export function PublicProfile() {
  const { handle = '' } = useParams();
  const [page, setPage] = useState(1);

  const { data, loading, error, notFound } = useProfile(handle || null);
  const history = useMatchHistory(handle || null, page);

  const title = data
    ? (data.identity.username ?? data.identity.label ?? handle)
    : 'Player profile';

  if (loading && !data) {
    return (
      <>
        <PageTitle title="Player profile" />
        <Card radius={16} className="flex justify-center py-16">
          <Spinner />
        </Card>
      </>
    );
  }

  /**
   * Rendered INSIDE the dashboard shell rather than falling through to the app's
   * NotFound page: a mistyped handle should leave the sidebar in place so the
   * visitor can carry on, not eject them from the dashboard entirely.
   */
  if (notFound) {
    return (
      <>
        <PageTitle title="Player profile" />
        <EmptyState
          radius={16}
          icon={<Icon name="user" size={19} />}
          scaleIcon
          title="No such player"
          body={`Nobody on the hub goes by “${handle}”. The link may be mistyped, or that username may have changed.`}
        />
        <div className="mt-4 text-center text-[13px]">
          <Link to="/dashboard/leaderboard">Browse the leaderboard →</Link>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageTitle title="Player profile" />
        <EmptyState
          radius={16}
          icon={<Icon name="user" size={19} />}
          scaleIcon
          title="Couldn’t load that profile"
          body="The profile service didn’t respond. Refresh to try again."
        />
      </>
    );
  }

  return (
    <>
      <PageTitle title={title} subtitle="Public record — balances are never shown." />

      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-[22px]">
        <ProfileHeader identity={data.identity} tier={data.tier} isYou={data.isYou} />
        <TierProgress tier={data.tier} />
      </div>

      <div className="mb-[22px]">
        <StatGrid stats={data.stats} />
      </div>

      <div className="mb-[22px]">
        <ProfitCurve curve={data.curve} />
      </div>

      <div className="mb-[22px]">
        <PerGameTable rows={data.perGame} />
      </div>

      <MatchHistoryTable
        data={history.data}
        loading={history.loading}
        page={page}
        onPage={setPage}
        ownProfile={false}
      />
    </>
  );
}
