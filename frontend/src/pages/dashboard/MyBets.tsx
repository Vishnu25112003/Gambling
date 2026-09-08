import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Badge, Button, Card, EmptyState, PageTitle, SectionHeading } from '../../components/shared/ui';
import { Icon, type IconName } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { gameVisual } from '../../lib/gameVisuals';
import { gameLabel } from '../../lib/gameLabel';
import { formatDate, formatSol, formatSolSigned } from '../../lib/format';
import {
  MOCK_OPEN_BETS,
  MOCK_SETTLED_BETS,
  mockBetStats,
  type MockBetResult,
} from '../../lib/myBetsMock';

const SUBTITLE = 'Every bet you place lands here — open, settled and cancelled.';
const PAGE_SIZE = 5;

const RESULT_TONE: Record<MockBetResult, 'success' | 'danger' | 'neutral'> = {
  won: 'success',
  lost: 'danger',
  forfeited: 'danger',
  refunded: 'neutral',
};

const RESULT_LABEL: Record<MockBetResult, string> = {
  won: 'Won',
  lost: 'Lost',
  forfeited: 'Forfeited',
  refunded: 'Refunded',
};

const FILTERS: { key: 'all' | MockBetResult; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'refunded', label: 'Refunded' },
];

interface Tile {
  label: string;
  value: string;
  color: string;
  icon: IconName;
}

function StatTile({ tile }: { tile: Tile }) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-[14px] border border-line bg-card px-4 py-3.5">
      <span className="absolute top-0 right-0 left-0 h-[2px]" style={{ background: tile.color }} />
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'var(--line2)', color: tile.color }}
      >
        <Icon name={tile.icon} size={17} />
      </div>
      <div className="min-w-0">
        <div className="mb-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] text-muted">
          {tile.label}
        </div>
        <div className="font-heading text-[16px] font-extrabold" style={{ color: tile.color }}>
          {tile.value}
        </div>
      </div>
    </div>
  );
}

function OpenBetCard({ bet }: { bet: (typeof MOCK_OPEN_BETS)[number] }) {
  const visual = gameVisual({ name: gameLabel(bet.gameType) });
  const yourTurn = bet.state === 'your-turn';

  return (
    <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-card p-4">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: visual.tint, color: visual.tone }}
      >
        <Icon name={visual.icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-heading text-[14px] font-bold">
            {gameLabel(bet.gameType)}
          </span>
          <Badge tone={yourTurn ? 'warn' : 'neutral'}>{yourTurn ? 'Your turn' : 'Waiting'}</Badge>
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-muted">{bet.meta}</p>
        <div className="mt-1.5 flex gap-4 font-mono text-[11.5px]">
          <span className="text-muted">Stake {formatSol(bet.stake)} SOL</span>
          <span className="text-green">To win {formatSol(bet.toWin)} SOL</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button size="sm" variant={yourTurn ? 'solid' : 'secondary'} disabled={!yourTurn}>
          {yourTurn ? 'Play' : 'Waiting'}
        </Button>
        <Button size="sm" variant="danger">
          Forfeit
        </Button>
      </div>
    </div>
  );
}

/**
 * Static/mock content for now (per project decision) — there is no backend
 * concept of "open bets across every game" yet. `myBetsMock.ts` isolates the
 * placeholder data so swapping in a real endpoint later only touches that
 * module, not this page.
 */
export function MyBets() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | MockBetResult>('all');
  const [page, setPage] = useState(1);

  if (!isAuthenticated) {
    return (
      <>
        <PageTitle title="My Bets" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your open and settled bets" icon="ticket" />
      </>
    );
  }

  const stats = mockBetStats();

  const filtered =
    filter === 'all' ? MOCK_SETTLED_BETS : MOCK_SETTLED_BETS.filter((b) => b.result === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="My Bets" subtitle={SUBTITLE} />
        <Button onClick={() => navigate('/dashboard/games')}>Place a Bet</Button>
      </div>

      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3">
        {stats.map((s) => (
          <StatTile
            key={s.label}
            tile={{ ...s, icon: s.label === 'OPEN BETS' ? 'ticket' : s.label === 'WIN RATE' ? 'percent' : s.label === 'SETTLED' ? 'chart' : 'coin' }}
          />
        ))}
      </div>

      <Card className="mb-[22px] p-[22px]">
        <SectionHeading icon={<Icon name="ticket" size={18} />} title="Open Bets" />
        {MOCK_OPEN_BETS.length === 0 ? (
          <EmptyState
            radius={14}
            icon={<Icon name="ticket" size={19} />}
            scaleIcon
            title="No open bets"
            body="Join a table and it'll show up here until it settles."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3">
            {MOCK_OPEN_BETS.map((bet) => (
              <OpenBetCard key={bet.id} bet={bet} />
            ))}
          </div>
        )}
      </Card>

      <Card radius={16} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line2 px-5 py-3.5">
          <span className="font-heading text-[13.5px] font-bold tracking-[0.04em]">
            SETTLED BETS
          </span>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
                className={`cursor-pointer rounded-full border px-3 py-1 text-[11.5px] font-semibold transition ${
                  filter === f.key
                    ? 'border-green-solid/40 bg-green-solid/[0.14] text-green'
                    : 'border-line bg-transparent text-muted hover:text-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {pageRows.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-muted">
            Nothing matches this filter yet.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line2 text-left text-[11px] font-semibold tracking-[0.06em] text-faint">
                    <th className="px-5 py-3.5">GAME</th>
                    <th className="px-5 py-3.5">WHEN</th>
                    <th className="px-5 py-3.5 text-right">STAKE</th>
                    <th className="px-5 py-3.5 text-right">PAYOUT</th>
                    <th className="px-5 py-3.5 text-right">NET</th>
                    <th className="px-5 py-3.5 text-right">RESULT</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-b border-line2">
                      <td className="px-5 py-3 font-heading font-semibold">
                        {gameLabel(row.gameType)}
                      </td>
                      <td className="px-5 py-3 font-mono whitespace-nowrap text-muted">
                        {formatDate(row.when)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono whitespace-nowrap">
                        {formatSol(row.stake)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono whitespace-nowrap">
                        {formatSol(row.payout)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono font-bold whitespace-nowrap ${
                          Number(row.net) > 0 ? 'text-green' : Number(row.net) < 0 ? 'text-red' : 'text-muted'
                        }`}
                      >
                        {formatSolSigned(row.net)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-line2 px-5 py-3">
                <span className="text-xs text-muted">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
