import { GamesList } from '../components/dashboard/GamesList';
import { LeaderboardFull } from '../components/dashboard/LeaderboardFull';
import { ProfilePanel } from '../components/dashboard/ProfilePanel';
import { WalletBalancePanel } from '../components/dashboard/WalletBalancePanel';
import { TransactionHistoryPanel } from '../components/dashboard/TransactionHistoryPanel';
import { useAuth } from '../hooks/useAuth';
import { formatSol } from '../lib/format';
import { Card } from '../components/shared/ui';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-10">{children}</div>;
}

/**
 * Doc 06: the dashboard index. Games list and leaderboard render immediately
 * for everyone; the balance strip only appears once a wallet is connected.
 */
export function DashboardHome() {
  const { isAuthenticated, balance } = useAuth();

  return (
    <Shell>
      {isAuthenticated && balance && (
        <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Available balance</p>
            <p className="mt-1 font-mono text-2xl font-bold text-neon-400">
              {formatSol(balance.availableBalance)} <span className="text-sm text-ink-400">SOL</span>
            </p>
          </div>
          {Number(balance.lockedBalance) > 0 && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-ink-400">In play</p>
              <p className="mt-1 font-mono text-xl font-bold text-gold-400">
                {formatSol(balance.lockedBalance)} <span className="text-sm text-ink-400">SOL</span>
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-12">
        <GamesList />
        <LeaderboardFull />
      </div>
    </Shell>
  );
}

export const DashboardLeaderboard = () => (
  <Shell>
    <LeaderboardFull />
  </Shell>
);

export const DashboardWallet = () => (
  <Shell>
    <WalletBalancePanel />
  </Shell>
);

export const DashboardHistory = () => (
  <Shell>
    <TransactionHistoryPanel />
  </Shell>
);

export const DashboardProfile = () => (
  <Shell>
    <ProfilePanel />
  </Shell>
);
