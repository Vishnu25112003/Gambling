import { useEffect, useState } from 'react';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Badge, Button, Card, EmptyState, PageTitle, Spinner } from '../../components/shared/ui';
import { DocumentIcon, Icon, type IconName } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { useWalletSummary } from '../../hooks/useWalletSummary';
import { walletApi } from '../../api/endpoints';
import { formatDate, formatSol, formatSolSigned, ledgerLabel } from '../../lib/format';
import type { HistoryPage } from '../../types';

const SUBTITLE = 'Every deposit, bet, settlement and withdrawal on your account.';

interface SummaryTile {
  label: string;
  value: string;
  color: string;
  tint: string;
  icon: IconName;
}

function SummaryChip({ tile }: { tile: SummaryTile }) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-[14px] border border-line bg-card px-4 py-3.5">
      <span className="absolute top-0 right-0 left-0 h-[2px]" style={{ background: tile.color }} />
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: tile.tint, color: tile.color }}
      >
        <Icon name={tile.icon} size={17} />
      </div>
      <div className="min-w-0">
        <div className="mb-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] text-muted">
          {tile.label}
        </div>
        <div className="font-heading text-[16px] font-extrabold whitespace-nowrap" style={{ color: tile.color }}>
          {tile.value}
        </div>
      </div>
    </div>
  );
}

/** Every field in a LedgerRow, quoted so a comma or newline in `note` can't corrupt the file. */
function toCsv(rows: HistoryPage['entries']): string {
  const header = ['type', 'when', 'amount', 'status', 'txSignature'];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [ledgerLabel(r.type), r.timestamp, r.amount, r.status, r.txSignature ?? '']
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

/** Doc 06: a GATED section — placeholder until connected. */
export function Transactions() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<HistoryPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const summary = useWalletSummary(isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    void walletApi
      .history(page, 25)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [isAuthenticated, page]);

  if (!isAuthenticated) {
    return (
      <>
        <PageTitle title="Transactions" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your transaction and game history" icon="receipt" />
      </>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const tiles: SummaryTile[] = [
    {
      label: 'DEPOSITED',
      value: `${formatSol(summary.data?.totalDeposited ?? '0')} SOL`,
      color: 'var(--green)',
      tint: 'rgba(34,197,94,0.12)',
      icon: 'wallet',
    },
    {
      label: 'WITHDRAWN',
      value: `${formatSol(summary.data?.totalWithdrawn ?? '0')} SOL`,
      color: 'var(--text)',
      tint: 'var(--line2)',
      icon: 'lockbox',
    },
    {
      label: 'REWARDS IN',
      value: `${formatSol(summary.data?.totalRewards ?? '0')} SOL`,
      color: 'var(--gold-bright)',
      tint: 'rgba(234,179,8,0.13)',
      icon: 'gift',
    },
    {
      label: 'NETWORK FEES',
      value: `${formatSol(summary.data?.totalFees ?? '0')} SOL`,
      color: 'var(--red)',
      tint: 'rgba(248,113,113,0.12)',
      icon: 'percent',
    },
  ];

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
    <>
      <PageTitle title="Transactions" subtitle={SUBTITLE} />

      <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3">
        {tiles.map((t) => (
          <SummaryChip key={t.label} tile={t} />
        ))}
      </div>

      {loading ? (
        <Card radius={16} className="flex justify-center py-16">
          <Spinner />
        </Card>
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          radius={16}
          icon={<DocumentIcon />}
          title="Nothing here yet"
          body="Your first deposit will show up here."
        />
      ) : (
        <Card radius={16} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line2 px-5 py-3.5">
            <span className="font-heading text-[13.5px] font-bold tracking-[0.04em]">LEDGER</span>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line2 text-left text-[11px] font-semibold tracking-[0.06em] text-faint">
                  <th className="px-5 py-3.5">TYPE</th>
                  <th className="px-5 py-3.5">WHEN</th>
                  <th className="px-5 py-3.5 text-right">AMOUNT</th>
                  <th className="px-5 py-3.5 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((row) => (
                  <tr key={row.id} className="border-b border-line2">
                    <td className="px-5 py-3">
                      <span className="font-heading font-semibold">{ledgerLabel(row.type)}</span>
                      {row.explorerUrl && (
                        <a
                          href={row.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 text-xs hover:underline"
                        >
                          explorer ↗
                        </a>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono whitespace-nowrap text-muted">
                      {formatDate(row.timestamp)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono font-bold whitespace-nowrap ${
                        Number(row.amount) >= 0 ? 'text-green' : 'text-muted'
                      }`}
                    >
                      {formatSolSigned(row.amount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Badge
                        tone={
                          row.status === 'confirmed'
                            ? 'success'
                            : row.status === 'failed'
                              ? 'danger'
                              : 'warn'
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line2 px-5 py-3">
              <span className="text-xs text-muted">
                Page {data.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
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
        </Card>
      )}
    </>
  );
}
