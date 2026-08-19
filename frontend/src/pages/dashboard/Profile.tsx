import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Card, EmptyState, PageTitle, Spinner } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { TierProgress } from '../../components/profile/TierProgress';
import { StatGrid } from '../../components/profile/StatGrid';
import { ProfitCurve } from '../../components/profile/ProfitCurve';
import { PerGameTable } from '../../components/profile/PerGameTable';
import { MatchHistoryTable } from '../../components/profile/MatchHistoryTable';
import { IdentityForm } from '../../components/profile/IdentityForm';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useMatchHistory } from '../../hooks/useMatchHistory';

const SUBTITLE = 'Your identity, your record, and your loyalty tier.';

/**
 * Doc 11 — the player's own profile. A GATED section per doc 06.
 *
 * Everything here renders honestly at zero: no games have shipped yet, so a new
 * account sees a Bronze badge, a flat curve and empty tables. That is the point of
 * building the real queries now rather than stubbing them — the page is correct
 * from the first match ever settled, and it is already useful today because the
 * identity form works.
 */
export function Profile() {
  const { isAuthenticated, isRestoring } = useAuth();
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useProfile(isAuthenticated ? 'me' : null);
  const history = useMatchHistory(isAuthenticated ? 'me' : null, page);

  /**
   * `isRestoring` first. The session is restored from a stored token on mount, so
   * gating on `isAuthenticated` alone flashes "Connect Wallet" at an already
   * signed-in player on every hard refresh.
   */
  if (isRestoring) {
    return (
      <>
        <PageTitle title="Profile" subtitle={SUBTITLE} />
        <Card radius={16} className="flex justify-center py-16">
          <Spinner />
        </Card>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <PageTitle title="Profile" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your profile, stats and loyalty tier" icon="user" />
      </>
    );
  }

  if (loading && !data) {
    return (
      <>
        <PageTitle title="Profile" subtitle={SUBTITLE} />
        <Card radius={16} className="flex justify-center py-16">
          <Spinner />
        </Card>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageTitle title="Profile" subtitle={SUBTITLE} />
        <EmptyState
          radius={16}
          icon={<Icon name="user" size={19} />}
          scaleIcon
          title="Couldn’t load your profile"
          body="The profile service didn’t respond. Refresh to try again."
        />
      </>
    );
  }

  return (
    <>
      <PageTitle title="Profile" subtitle={SUBTITLE} />

      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-[22px]">
        <ProfileHeader
          identity={data.identity}
          tier={data.tier}
          isYou
          onAvatarChanged={reload}
        />
        <TierProgress tier={data.tier} />
      </div>

      <div className="mb-[22px]">
        <StatGrid stats={data.stats} />
      </div>

      <div className="mb-[22px]">
        <ProfitCurve curve={data.curve} />
      </div>

      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-[22px]">
        <PerGameTable rows={data.perGame} />

        <Card radius={18} className="p-[22px]">
          <div className="text-[15px] font-bold">Share your profile</div>
          <p className="mt-1 text-[13px] text-muted">
            {data.identity.username
              ? 'Anyone can open this link — it shows your record, never your balance.'
              : 'Claim a username below and this link becomes readable instead of a long id.'}
          </p>
          <Link
            to={`/dashboard/u/${data.identity.handle}`}
            className="mt-3 inline-block font-mono text-[12.5px] break-all"
          >
            /dashboard/u/{data.identity.handle}
          </Link>
          <p className="mt-3.5 text-[11.5px] text-faint">
            A public profile never shows your balance, your deposits or your full wallet address.
          </p>
        </Card>
      </div>

      <div className="mb-[22px]">
        <MatchHistoryTable
          data={history.data}
          loading={history.loading}
          page={page}
          onPage={setPage}
          ownProfile
        />
      </div>

      <IdentityForm onSaved={reload} />
    </>
  );
}
