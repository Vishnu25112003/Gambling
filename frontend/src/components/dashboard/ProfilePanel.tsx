import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { authApi } from '../../api/endpoints';
import { formatSol, formatSolSigned, shortAddress } from '../../lib/format';
import { Button, Card, SectionHeading, Spinner } from '../shared/ui';
import { ConnectWalletPlaceholder } from './ConnectWalletPlaceholder';

/** Doc 06: a GATED section — placeholder until connected. */
export function ProfilePanel() {
  const { isAuthenticated, user, setUser } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated || !user) {
    return (
      <section>
        <SectionHeading title="Profile" />
        <ConnectWalletPlaceholder what="your profile and lifetime stats" icon="👤" />
      </section>
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

  const stats = [
    { label: 'Games played', value: String(user.gamesPlayed ?? 0) },
    { label: 'Total wagered', value: `${formatSol(user.totalWagered)} SOL` },
    {
      label: 'Net profit',
      value: `${formatSolSigned(user.netProfit)} SOL`,
      tone: Number(user.netProfit) >= 0 ? 'text-neon-400' : 'text-danger-400',
    },
  ];

  return (
    <section className="space-y-6">
      <SectionHeading title="Profile" subtitle="Your wallet is your account — there is no password." />

      <Card className="p-6">
        <p className="text-xs uppercase tracking-wide text-ink-400">Wallet address</p>
        <p className="mt-2 break-all font-mono text-sm text-ink-100">{user.walletAddress}</p>
        <p className="mt-1 text-xs text-ink-400">
          Shown publicly as {shortAddress(user.walletAddress)} unless you set a display name.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-xs uppercase tracking-wide text-ink-400">{s.label}</p>
            <p className={`mt-2 font-mono text-xl font-bold ${s.tone ?? ''}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h3 className="font-semibold">Display name</h3>
        <p className="mt-1 text-sm text-ink-400">
          Optional. Replaces your shortened address on the leaderboard.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder={user.displayName ?? 'Pick a name'}
            className="w-full rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5
              focus:border-neon-500 focus:outline-none"
          />
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : 'Save'}
          </Button>
        </div>
        {saved && <p className="mt-3 text-sm text-neon-400">Saved.</p>}
        {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
      </Card>

      <Card className="border-danger-500/30 p-6">
        <h3 className="font-semibold text-danger-400">Recovery</h3>
        <p className="mt-1 text-sm text-ink-400">
          Your wallet's seed phrase is your only recovery method. The platform cannot restore access
          to a lost wallet — this is a deliberate tradeoff of wallet-based login, not a missing
          feature.
        </p>
      </Card>
    </section>
  );
}
