import { useState } from 'react';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Button, Card, Input, PageTitle, Spinner } from '../../components/shared/ui';
import { useAuth } from '../../hooks/useAuth';
import { authApi } from '../../api/endpoints';
import { formatSol, formatSolSigned, shortAddress } from '../../lib/format';

const SUBTITLE = 'Your wallet is your account — there is no password.';

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-card p-5">
      <div className="mb-2 text-[11.5px] font-semibold text-muted">{label}</div>
      <div className="text-[22px] font-extrabold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

/** Doc 06: a GATED section — placeholder until connected. */
export function Settings() {
  const { isAuthenticated, user, setUser } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated || !user) {
    return (
      <>
        <PageTitle title="Settings" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your profile and lifetime stats" icon="cog" />
      </>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const trimmed = name.trim();
      const res = await authApi.updateProfile(trimmed || null);
      setUser({ ...user, displayName: res.user.displayName });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const netProfit = Number(user.netProfit);

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

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <StatCard label="GAMES PLAYED" value={String(user.gamesPlayed ?? 0)} />
        <StatCard label="TOTAL WAGERED" value={`${formatSol(user.totalWagered)} SOL`} />
        <StatCard
          label="NET PROFIT"
          value={`${formatSolSigned(user.netProfit)} SOL`}
          color={netProfit < 0 ? 'var(--red)' : 'var(--green)'}
        />
      </div>

      <Card radius={16} className="mb-4 p-[22px]">
        <div className="text-[15px] font-bold">Display name</div>
        <p className="mt-1 text-[13px] text-muted">
          Optional. Replaces your shortened address on the leaderboard.
        </p>
        <div className="mt-3.5 flex gap-2.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder={user.displayName ?? 'Pick a name'}
            className="min-w-0 flex-1"
            aria-label="Display name"
          />
          <Button variant="solid" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : 'Save'}
          </Button>
        </div>
        {saved && <p className="mt-3 text-sm text-green">Saved.</p>}
        {error && <p className="mt-3 text-sm text-red">{error}</p>}
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
