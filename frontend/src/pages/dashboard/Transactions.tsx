import { useEffect, useState } from 'react';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Panel, PanelHeader, StatTile, FilterPills, TableHead, TableRow, TableScroll, StatusChip } from '../../components/dashboard/panels';
import { PageTitle } from '../../components/shared/ui';
import { Icon, type IconName } from '../../components/shared/icons';
import { Download, ExternalLink } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useWalletSummary } from '../../hooks/useWalletSummary';
import { walletApi } from '../../api/endpoints';
import { formatDate, formatSol, formatSolSigned, ledgerLabel } from '../../lib/format';
import type { HistoryPage, LedgerRow, LedgerType } from '../../types';

const SUBTITLE = 'Every on-chain movement on your account — deposits, stakes, payouts and rewards.';
const TEMPLATE = '1.2fr 1.2fr 1.4fr .9fr .8fr';

const TYPE_ICON: Record<LedgerRow['type'], IconName> = {
  deposit: 'wallet',
  withdrawal: 'lockbox',
  lock: 'ticket',
  settlement: 'chart',
  refund: 'shield',
  forfeit: 'bomb',
  fee: 'percent',
  referral: 'gift',
};

const TYPE_COLOR: Record<LedgerRow['type'], string> = {
  deposit: 'var(--green)',
  withdrawal: 'var(--muted)',
  lock: 'var(--gold)',
  settlement: 'var(--green)',
  refund: 'var(--muted)',
  forfeit: 'var(--red)',
  fee: 'var(--red)',
  referral: 'var(--gold-bright)',
};

const STATUS_CHIP: Record<LedgerRow['status'], { bg: string; fg: string }> = {
  confirmed: { bg: 'rgba(47,224,138,.14)', fg: '#2fe08a' },
  pending: { bg: 'rgba(240,180,41,.14)', fg: '#f0b429' },
  failed: { bg: 'rgba(239,83,80,.14)', fg: '#ef5350' },
};

/** The five filters the mockup shows, mapped onto real single-type ledger filtering. */
const FILTERS: { key: 'all' | LedgerType; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'deposit', label: 'DEPOSIT' },
  { key: 'withdrawal', label: 'WITHDRAW' },
  { key: 'lock', label: 'STAKE' },
  { key: 'referral', label: 'REWARD' },
];

function toCsv(rows: LedgerRow[]): string {
  const header = ['type', 'when', 'amount', 'status', 'txSignature'];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [ledgerLabel(r.type), r.timestamp, r.amount, r.status, r.txSignature ?? ''].map(escape).join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

/** Doc 06: a GATED section — placeholder until connected. */
export function Transactions() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<HistoryPage | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | LedgerType>('all');
  const [loading, setLoading] = useState(false);
  const summary = useWalletSummary(isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    void walletApi
      .history(page, 25, filter === 'all' ? undefined : filter)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [isAuthenticated, page, filter]);

  if (!isAuthenticated) {
    return (
      <>
        <PageTitle title="Transactions" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your transaction and game history" icon="receipt" />
      </>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const exportCsv = () => {
    if (!data || data.entries.length === 0) return;
    const blob = new Blob([toCsv(data.entries)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `infinit-respawn-transactions-page-${data.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">
          TRANSACTIONS
        </h1>
        <p className="text-sm text-muted">{SUBTITLE}</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <StatTile icon="wallet" label="DEPOSITED" value={`${formatSol(summary.data?.totalDeposited ?? '0')} SOL`} color="var(--green)" />
        <StatTile icon="lockbox" label="WITHDRAWN" value={`${formatSol(summary.data?.totalWithdrawn ?? '0')} SOL`} color="var(--text)" />
        <StatTile icon="gift" label="REWARDS IN" value={`${formatSol(summary.data?.totalRewards ?? '0')} SOL`} color="var(--gold-bright)" />
        <StatTile icon="percent" label="NETWORK FEES" value={`${formatSol(summary.data?.totalFees ?? '0')} SOL`} color="var(--red)" />
      </div>

      <Panel>
        <PanelHeader
          title="LEDGER"
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

        {loading && !data ? (
          <div className="flex justify-center py-12">
            <span className="inline-block size-6 animate-spin rounded-full border-2 border-line border-t-green" />
          </div>
        ) : !data || data.entries.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">Nothing here yet.</p>
        ) : (
          <>
            <TableScroll minWidth={660}>
              <TableHead
                template={TEMPLATE}
                columns={[
                  { label: 'TYPE' },
                  { label: 'WHEN' },
                  { label: 'SIGNATURE' },
                  { label: 'STATUS' },
                  { label: 'AMOUNT', align: 'right' },
                ]}
              />
              {data.entries.map((row) => (
                <TableRow key={row.id} template={TEMPLATE}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span style={{ color: TYPE_COLOR[row.type] }}>
                      <Icon name={TYPE_ICON[row.type]} size={18} />
                    </span>
                    <span className="truncate font-heading text-[13.5px] font-semibold text-[#e8f2ec]">
                      {ledgerLabel(row.type)}
                    </span>
                  </span>
                  <span className="font-mono text-[11.5px] text-[#a9c3b6]">{formatDate(row.timestamp)}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-[11px] text-[#9ab5a6]">
                      {row.txSignature ?? '—'}
                    </span>
                    {row.explorerUrl && (
                      <a
                        href={row.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="View on explorer"
                        className="flex shrink-0 text-green"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </span>
                  <span>
                    <StatusChip bg={STATUS_CHIP[row.status].bg} fg={STATUS_CHIP[row.status].fg}>
                      {row.status}
                    </StatusChip>
                  </span>
                  <span
                    className="text-right font-mono text-[12.5px]"
                    style={{ color: Number(row.amount) >= 0 ? 'var(--green)' : 'var(--muted)' }}
                  >
                    {formatSolSigned(row.amount)}
                  </span>
                </TableRow>
              ))}
            </TableScroll>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3.5">
              <span className="font-mono text-[10.5px] text-[#8fbfa6]">
                {data.total} TRANSACTION{data.total === 1 ? '' : 'S'} · PAGE {data.page} OF {totalPages}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {totalPages > 1 && (
                  <>
                    <button
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => p - 1)}
                      className="cursor-pointer rounded-lg border px-3.5 py-2 font-heading text-[12px] font-semibold text-muted disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ borderColor: 'var(--panel-border-soft)' }}
                    >
                      Previous
                    </button>
                    <button
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                      className="cursor-pointer rounded-lg border px-3.5 py-2 font-heading text-[12px] font-semibold text-muted disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ borderColor: 'var(--panel-border-soft)' }}
                    >
                      Next
                    </button>
                  </>
                )}
                <button
                  onClick={exportCsv}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 font-heading text-[12.5px] font-semibold tracking-[0.06em] text-green"
                  style={{ borderColor: 'rgba(47,224,138,.2)', background: 'rgba(47,224,138,.06)' }}
                >
                  <Download size={17} />
                  EXPORT CSV
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
