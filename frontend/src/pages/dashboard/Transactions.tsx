import { useEffect, useState } from 'react';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Badge, Button, Card, EmptyState, PageTitle, Spinner } from '../../components/shared/ui';
import { DocumentIcon } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { walletApi } from '../../api/endpoints';
import { formatDate, formatSolSigned, ledgerLabel } from '../../lib/format';
import type { HistoryPage } from '../../types';

const SUBTITLE = 'Every deposit, bet, settlement and withdrawal on your account.';

/** Doc 06: a GATED section — placeholder until connected. */
export function Transactions() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<HistoryPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

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

  return (
    <>
      <PageTitle title="Transactions" subtitle={SUBTITLE} />

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
                      <span className="font-semibold">{ledgerLabel(row.type)}</span>
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
                    <td className="px-5 py-3 whitespace-nowrap text-muted">
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
