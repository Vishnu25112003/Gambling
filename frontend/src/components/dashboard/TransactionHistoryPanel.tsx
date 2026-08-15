import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { walletApi } from '../../api/endpoints';
import { formatDate, formatSolSigned, ledgerLabel } from '../../lib/format';
import { Badge, Button, Card, EmptyState, SectionHeading, Spinner } from '../shared/ui';
import { ConnectWalletPlaceholder } from './ConnectWalletPlaceholder';
import type { HistoryPage } from '../../types';

/** Doc 06: a GATED section — placeholder until connected. */
export function TransactionHistoryPanel() {
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
      <section>
        <SectionHeading title="History" />
        <ConnectWalletPlaceholder what="your transaction and game history" icon="📜" />
      </section>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <section>
      <SectionHeading
        title="History"
        subtitle="Every deposit, bet, settlement and withdrawal on your account."
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !data || data.entries.length === 0 ? (
          <EmptyState
            icon="📜"
            title="Nothing here yet"
            body="Your first deposit will show up here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">When</th>
                    <th className="px-5 py-3 text-right font-semibold">Amount</th>
                    <th className="px-5 py-3 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {data.entries.map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-3">
                        <span className="font-medium">{ledgerLabel(row.type)}</span>
                        {row.explorerUrl && (
                          <a
                            href={row.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-xs text-neon-400 hover:underline"
                          >
                            explorer ↗
                          </a>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-400">{formatDate(row.timestamp)}</td>
                      <td
                        className={`px-5 py-3 text-right font-mono font-semibold ${
                          Number(row.amount) >= 0 ? 'text-neon-400' : 'text-ink-300'
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
              <div className="flex items-center justify-between border-t border-ink-800 px-5 py-3">
                <span className="text-xs text-ink-400">
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
          </>
        )}
      </Card>
    </section>
  );
}
