import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Panel, PanelHeader, StatTile, FilterPills, TableHead, TableRow, TableScroll, StatusChip } from '../../components/dashboard/panels';
import { Icon } from '../../components/shared/icons';
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

const SUBTITLE = 'Every stake you have placed — open tables, settled matches and refunds.';
const PAGE_SIZE = 5;
const TEMPLATE = '1.5fr 1.3fr .7fr .7fr .8fr .9fr';

const RESULT_CHIP: Record<MockBetResult, { bg: string; fg: string }> = {
  won: { bg: 'rgba(47,224,138,.14)', fg: '#2fe08a' },
  lost: { bg: 'rgba(239,83,80,.14)', fg: '#ff8a86' },
  forfeited: { bg: 'rgba(239,83,80,.14)', fg: '#ff8a86' },
  refunded: { bg: 'rgba(196,214,228,.1)', fg: '#c4d6e4' },
};

const RESULT_LABEL: Record<MockBetResult, string> = {
  won: 'WON',
  lost: 'LOST',
  forfeited: 'FORFEITED',
  refunded: 'REFUNDED',
};

const FILTERS: { key: 'all' | MockBetResult; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'won', label: 'WON' },
  { key: 'lost', label: 'LOST' },
  { key: 'refunded', label: 'REFUNDED' },
];

function OpenBetCard({ bet }: { bet: (typeof MOCK_OPEN_BETS)[number] }) {
  const visual = gameVisual({ name: gameLabel(bet.gameType) });
  return (
    <div
      className="flex flex-col gap-3 rounded-[13px] border p-4"
      style={{ borderColor: 'var(--amber-border)', background: 'var(--panel-bg3)' }}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-[34px] shrink-0 place-items-center rounded-[9px] font-heading text-[13px] font-bold text-[#04160c]"
            style={{ background: visual.tone }}
          >
            {gameLabel(bet.gameType).charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="font-heading text-[15px] font-bold text-[#eafff3]">{gameLabel(bet.gameType)}</div>
            <div className="mt-0.5 font-mono text-[10.5px] text-[#a9c3b6]">{bet.meta}</div>
          </div>
        </div>
        <StatusChip bg="rgba(240,180,41,.12)" fg="#f0b429">
          {bet.state === 'your-turn' ? 'YOUR TURN' : 'WAITING'}
        </StatusChip>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-[9px] border p-[9px_11px]" style={{ borderColor: 'rgba(47,224,138,.1)', background: '#0a140e' }}>
          <div className="font-mono text-[9px] tracking-[0.14em] text-[#8fbfa6]">STAKE</div>
          <div className="mt-0.5 font-mono text-[13px] text-[#eafff3]">{formatSol(bet.stake)} SOL</div>
        </div>
        <div className="flex-1 rounded-[9px] border p-[9px_11px]" style={{ borderColor: 'rgba(47,224,138,.1)', background: '#0a140e' }}>
          <div className="font-mono text-[9px] tracking-[0.14em] text-[#8fbfa6]">TO WIN</div>
          <div className="mt-0.5 font-mono text-[13px] text-green">{formatSol(bet.toWin)} SOL</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          disabled={bet.state !== 'your-turn'}
          className="flex-1 cursor-pointer rounded-[9px] border-0 py-2.5 font-heading text-[13px] font-bold tracking-[0.06em] text-[#04160c] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: 'linear-gradient(180deg, #35eb95, #16a862)' }}
        >
          {bet.state === 'your-turn' ? 'PLAY' : 'WAITING'}
        </button>
        <button
          className="shrink-0 cursor-pointer rounded-[9px] border px-3.5 py-2.5 font-heading text-[13px] font-bold tracking-[0.06em] text-red"
          style={{ borderColor: 'rgba(239,83,80,.28)', background: 'rgba(239,83,80,.07)' }}
        >
          FORFEIT
        </button>
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
        <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">MY BETS</h1>
        <p className="mb-5 text-sm text-muted">{SUBTITLE}</p>
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">MY BETS</h1>
          <p className="text-sm text-muted">{SUBTITLE}</p>
        </div>
        <button
          onClick={() => navigate('/dashboard/games')}
          className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-5 py-3 font-heading text-[13.5px] font-bold tracking-[0.06em] text-[#eafff3]"
          style={{ borderColor: 'rgba(47,224,138,.3)', background: 'rgba(47,224,138,.08)' }}
        >
          <Icon name="gamepad" size={19} className="text-green" />
          PLACE A BET
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {stats.map((s) => (
          <StatTile
            key={s.label}
            icon={s.label === 'OPEN BETS' ? 'ticket' : s.label === 'WIN RATE' ? 'percent' : s.label === 'SETTLED' ? 'chart' : 'coin'}
            label={s.label}
            value={s.value}
            color={s.color}
          />
        ))}
      </div>

      <Panel amber>
        <PanelHeader title="OPEN BETS" dot="#f0b429" meta={`${MOCK_OPEN_BETS.length} LOCKED`} />
        {MOCK_OPEN_BETS.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">No open bets right now.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-3">
            {MOCK_OPEN_BETS.map((bet) => (
              <OpenBetCard key={bet.id} bet={bet} />
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="SETTLED BETS"
          action={
            <FilterPills
              options={FILTERS}
              active={filter}
              onChange={(k) => {
                setFilter(k);
                setPage(1);
              }}
            />
          }
        />

        {pageRows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">Nothing matches this filter yet.</p>
        ) : (
          <>
            <TableScroll minWidth={620}>
              <TableHead
                template={TEMPLATE}
                columns={[
                  { label: 'GAME' },
                  { label: 'PLACED' },
                  { label: 'STAKE', align: 'right' },
                  { label: 'PAYOUT', align: 'right' },
                  { label: 'NET', align: 'right' },
                  { label: 'RESULT', align: 'right' },
                ]}
              />
              {pageRows.map((row) => (
                <TableRow key={row.id} template={TEMPLATE}>
                  <span className="truncate font-heading text-[13.5px] font-semibold text-[#e8f2ec]">
                    {gameLabel(row.gameType)}
                  </span>
                  <span className="font-mono text-[11.5px] text-[#a9c3b6]">{formatDate(row.when)}</span>
                  <span className="text-right font-mono text-[11.5px] text-[#9fb6a9]">{formatSol(row.stake)}</span>
                  <span className="text-right font-mono text-[11.5px] text-[#9fb6a9]">{formatSol(row.payout)}</span>
                  <span
                    className="text-right font-mono text-[11.5px]"
                    style={{ color: Number(row.net) > 0 ? '#2fe08a' : Number(row.net) < 0 ? '#ef5350' : '#9fb6a9' }}
                  >
                    {formatSolSigned(row.net)}
                  </span>
                  <span className="text-right">
                    <StatusChip bg={RESULT_CHIP[row.result].bg} fg={RESULT_CHIP[row.result].fg}>
                      {RESULT_LABEL[row.result]}
                    </StatusChip>
                  </span>
                </TableRow>
              ))}
            </TableScroll>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3.5">
              <span className="font-mono text-[10.5px] text-[#8fbfa6]">
                {filtered.length} BET{filtered.length === 1 ? '' : 'S'} · PAGE {page} OF {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="cursor-pointer rounded-lg border px-4 py-2 font-heading text-[12.5px] font-semibold text-muted disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: 'var(--panel-border-soft)' }}
                >
                  PREV
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="cursor-pointer rounded-lg border px-4 py-2 font-heading text-[12.5px] font-semibold text-green disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: 'rgba(47,224,138,.3)', background: 'rgba(47,224,138,.1)' }}
                >
                  NEXT
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
