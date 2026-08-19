import { Link } from 'react-router-dom';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Card, PageTitle, Spinner } from '../../components/shared/ui';
import { useAuth } from '../../hooks/useAuth';
import { shortAddress } from '../../lib/format';

const SUBTITLE = 'Your wallet is your account — there is no password.';

/**
 * Doc 06: a GATED section — placeholder until connected.
 *
 * Doc 11 moved identity and statistics OUT of here and onto the Profile page. What
 * remains is what genuinely belongs to "settings": the wallet this account is, and
 * the recovery reality of wallet-based login. The lifetime figures used to be
 * duplicated here as three stat cards; leaving them would have meant two places
 * showing the same numbers, which is how they eventually disagree.
 */
export function Settings() {
  const { isAuthenticated, isRestoring, user } = useAuth();

  // The session restores from a stored token on mount — without this a signed-in
  // player sees "Connect Wallet" flash on every hard refresh.
  if (isRestoring) {
    return (
      <>
        <PageTitle title="Settings" subtitle={SUBTITLE} />
        <Card radius={16} className="flex justify-center py-16">
          <Spinner />
        </Card>
      </>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <>
        <PageTitle title="Settings" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your account settings" icon="cog" />
      </>
    );
  }

  return (
    <>
      <PageTitle title="Settings" subtitle={SUBTITLE} />

      <Card radius={16} className="mb-4 p-5">
        <div className="mb-2 text-[11.5px] font-semibold text-muted">WALLET ADDRESS</div>
        <div className="font-mono text-[clamp(11px,1.6vw,14.5px)] break-all">
          {user.walletAddress}
        </div>
        <p className="mt-1.5 text-xs text-faint">
          Shown publicly as {shortAddress(user.walletAddress)} unless you set a display name.
        </p>
      </Card>

      <Card radius={16} className="mb-4 p-[22px]">
        <div className="text-[15px] font-bold">Profile &amp; identity</div>
        <p className="mt-1 text-[13px] text-muted">
          Your username, display name, profile picture, loyalty tier and full match history all
          live on your profile.
        </p>
        <Link to="/dashboard/profile" className="mt-3 inline-block text-[13px] font-semibold">
          Open your profile →
        </Link>
      </Card>

      <div className="rounded-2xl border border-red/30 bg-card p-[22px]">
        <div className="text-[15px] font-bold text-red">Recovery</div>
        <p className="mt-1 text-[13px] text-muted">
          Your wallet's seed phrase is your only recovery method. The platform cannot restore access
          to a lost wallet — this is a deliberate tradeoff of wallet-based login, not a missing
          feature.
        </p>
      </div>
    </>
  );
}
