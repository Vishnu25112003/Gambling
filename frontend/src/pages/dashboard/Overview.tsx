import { Link, useNavigate } from 'react-router-dom';
import { SceneCanvas } from '../../components/shared/SceneCanvas';
import { GameTile } from '../../components/dashboard/GameTile';
import { LeaderboardTable } from '../../components/dashboard/LeaderboardTable';
import { Card, SectionHeading, Spinner } from '../../components/shared/ui';
import { FeaturedArtIcon, Icon, type IconName } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { formatSol, formatSolSigned, shortAddress } from '../../lib/format';

interface Chip {
  label: string;
  value: string;
  color: string;
  tint: string;
  icon: IconName;
}

function StatChip({ chip }: { chip: Chip }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[15px] border border-line bg-card px-5 py-[18px]">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: chip.tint, color: chip.color }}
      >
        <Icon name={chip.icon} size={20} />
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-[11.5px] font-semibold tracking-[0.04em] text-muted">
          {chip.label}
        </div>
        <div
          className="text-[21px] font-extrabold whitespace-nowrap"
          style={{ color: chip.color }}
        >
          {chip.value}
        </div>
      </div>
    </div>
  );
}

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="text-[13px] font-semibold whitespace-nowrap">
      View all →
    </Link>
  );
}

/** The welcome panel: the design's gradient card with the 3D wallet behind it. */
function WelcomeCard() {
  const { isAuthenticated, isAuthenticating, user, balance, signIn } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative isolate flex flex-col justify-center gap-4 overflow-hidden rounded-[20px] border border-green-solid/[0.22] bg-[linear-gradient(135deg,rgba(34,197,94,0.14),transparent)] p-[clamp(20px,3vw,34px)]">
      <SceneCanvas
        scene="card"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '62%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />

      <span className="flex w-fit items-center gap-[7px] rounded-full bg-green-solid/[0.14] px-3 py-[5px] text-xs font-bold text-green">
        <span className="size-1.5 rounded-full bg-green" />
        {isAuthenticated ? 'WALLET CONNECTED' : 'WALLET NOT CONNECTED'}
      </span>

      <div className="text-[clamp(22px,3vw,30px)] leading-[1.15] font-extrabold">
        {isAuthenticated && user ? (
          <>
            Welcome back,
            <br />
            {user.username || shortAddress(user.walletAddress)}
          </>
        ) : (
          <>
            Welcome to
            <br />
            the Hub
          </>
        )}
      </div>

      {isAuthenticated ? (
        <div className="flex items-baseline gap-2">
          <span className="text-[34px] font-extrabold text-green">
            {formatSol(balance?.availableBalance ?? '0')}
          </span>
          <span className="text-sm font-semibold text-muted">SOL available</span>
        </div>
      ) : (
        <p className="max-w-[420px] text-sm leading-[1.6] text-muted">
          Connect a Solana wallet to see your balance. Browsing the hub needs no wallet at all.
        </p>
      )}

      <div className="mt-1 flex gap-3">
        {isAuthenticated ? (
          <button
            onClick={() => navigate('/dashboard/escrow')}
            className="cursor-pointer rounded-[10px] border-none bg-green-solid px-[22px] py-3 text-sm font-bold text-on-green transition hover:brightness-110"
          >
            Deposit
          </button>
        ) : (
          <button
            onClick={() => void signIn()}
            disabled={isAuthenticating}
            className="cursor-pointer rounded-[10px] border-none bg-green-solid px-[22px] py-3 text-sm font-bold text-on-green transition hover:brightness-110 disabled:opacity-60"
          >
            {isAuthenticating ? 'Check your wallet…' : 'Connect Wallet'}
          </button>
        )}
        <button
          onClick={() => navigate('/dashboard/games')}
          className="cursor-pointer rounded-[10px] border border-line bg-line2 px-[22px] py-3 text-sm font-semibold text-text transition hover:brightness-110"
        >
          Browse Games
        </button>
      </div>
    </div>
  );
}

/**
 * The dashboard index from the design: welcome panel, featured-art slot, four
 * stat chips, then the games grid beside the top-players table.
 *
 * Doc 06 keeps the games list and the leaderboard ungated — both render
 * whether or not a wallet is connected. Only the personal figures fall back
 * to zero when there is no session.
 */
export function Overview() {
  const { user, balance } = useAuth();
  const { games, loading: gamesLoading } = useGames();
  const { entries, loading: boardLoading } = useLeaderboard(5);

  const netProfit = user?.netProfit ?? '0';
  const chips: Chip[] = [
    {
      label: 'AVAILABLE BALANCE',
      value: `${formatSol(balance?.availableBalance ?? '0')} SOL`,
      color: 'var(--green)',
      tint: 'rgba(34,197,94,0.12)',
      icon: 'wallet',
    },
    {
      label: 'IN PLAY',
      value: `${formatSol(balance?.lockedBalance ?? '0')} SOL`,
      color: 'var(--gold)',
      tint: 'rgba(234,179,8,0.13)',
      icon: 'play',
    },
    {
      label: 'GAMES PLAYED',
      value: String(user?.gamesPlayed ?? 0),
      color: 'var(--text)',
      tint: 'rgba(248,113,113,0.12)',
      icon: 'gamepad',
    },
    {
      label: 'NET PROFIT',
      value: `${formatSolSigned(netProfit)} SOL`,
      color: Number(netProfit) < 0 ? 'var(--red)' : 'var(--green)',
      tint: 'rgba(34,197,94,0.12)',
      icon: 'chart',
    },
  ];

  return (
    <>
      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-[22px]">
        <WelcomeCard />

        <div className="relative flex min-h-[260px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[20px] border border-line bg-card p-6 text-center">
          <span className="absolute top-4 left-4 rounded-full bg-gold/[0.16] px-3 py-1.5 text-[11.5px] font-bold text-gold">
            Coming Soon
          </span>
          <div className="mb-1.5">
            <FeaturedArtIcon />
          </div>
          <div className="text-[19px] font-semibold text-muted">Featured game art</div>
          <div className="text-[13.5px] text-faint">Stay tuned for exciting games!</div>
        </div>
      </div>

      <div className="mb-[30px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-4">
        {chips.map((c) => (
          <StatChip key={c.label} chip={c} />
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-[22px]">
        <Card className="p-[22px]">
          <SectionHeading
            icon={<Icon name="dice" size={18} />}
            title="The Games"
            subtitle="Each game plugs into the same wallet, balance and escrow layer."
            action={<ViewAll to="/dashboard/games" />}
          />
          {gamesLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-4">
              {games.map((g) => (
                <GameTile key={g.id} game={g} />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-[22px]">
          <SectionHeading
            icon={<Icon name="trophy" size={18} />}
            iconColor="var(--gold)"
            title="Top Players"
            action={<ViewAll to="/dashboard/leaderboard" />}
          />
          {boardLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">
              Nobody on the board yet — rankings appear once the first matches settle.
            </p>
          ) : (
            <LeaderboardTable entries={entries} />
          )}
        </Card>
      </div>
    </>
  );
}
