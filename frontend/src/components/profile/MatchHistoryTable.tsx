import { Badge, Button, Card, EmptyState, SectionHeading, Spinner } from '../shared/ui';
import { Icon } from '../shared/icons';
import { formatDate, formatSol, formatSolSigned } from '../../lib/format';
import { gameLabel } from '../../lib/gameLabel';
import type { MatchHistoryPage, MatchResult } from '../../types';

/**
 * Doc 11 — one row per match, with what was staked and what came back.
 *
 * Distinct from the Transactions page, which lists LEDGER entries (several rows
 * per match: a lock, a settlement, sometimes a fee). This is the match-level view.
 */

const RESULT_TONE: Record<MatchResult, 'neutral' | 'success' | 'warn' | 'danger'> = {
  won: 'success',
  lost: 'danger',
  draw: 'neutral',
  // A refund is not a loss and not a win — the match was cancelled.
  refunded: 'neutral',
  forfeited: 'danger',
  open: 'warn',
};

const RESULT_LABEL: Record<MatchResult, string> = {
  won: 'Won',
  lost: 'Lost',
  draw: 'Draw',
  refunded: 'Refunded',
  forfeited: 'Forfeited',
  open: 'In play',
};

export function MatchHistoryTable({
  data,
  loading,
  page,
  onPage,
  ownProfile,
}: {
  data: MatchHistoryPage | null;
  loading: boolean;
  page: number;
  onPage: (next: number) => void;
  ownProfile: boolean;
}) {
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <Card radius={18} className="overflow-hidden p-[22px]">
      <SectionHeading
        icon={<Icon name="ticket" size={18} />}
        title="Match history"
        subtitle={
          ownProfile
            ? 'Every match you have joined — stake, payout and result.'
            : 'Every match this player has joined.'
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          radius={14}
          icon={<Icon name="ticket" size={19} />}
          scaleIcon
          title="No matches yet"
          body={
            ownProfile
              ? 'Your first game will show up here, with what you staked and what came back.'
              : 'This player has not finished a match yet.'
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line2 text-left text-[11px] font-semibold tracking-[0.06em] text-faint">
                  <th scope="col" className="py-3 pr-4">GAME</th>
                  <th scope="col" className="px-3 py-3">WHEN</th>
                  <th scope="col" className="px-3 py-3 text-right">STAKE</th>
                  <th scope="col" className="px-3 py-3 text-right">PAYOUT</th>
                  <th scope="col" className="px-3 py-3 text-right">NET</th>
                  <th scope="col" className="py-3 pl-3 text-right">RESULT</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((row) => {
                  const net = Number(row.net);
                  return (
                    <tr key={row.matchId} className="border-b border-line2 last:border-0">
                      <th scope="row" className="py-3 pr-4 text-left font-semibold">
                        {gameLabel(row.gameType)}
                        <span className="ml-2 text-[11px] font-normal text-faint">
                          {row.mode === 'pooled' ? 'PvP' : 'vs House'}
                        </span>
                      </th>
                      <td className="px-3 py-3 whitespace-nowrap text-muted">
                        {formatDate(row.settledAt ?? row.joinedAt)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono whitespace-nowrap">
                        {formatSol(row.stake)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono whitespace-nowrap">
                        {formatSol(row.payout)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono font-bold whitespace-nowrap ${
                          net < 0 ? 'text-red' : net > 0 ? 'text-green' : 'text-muted'
                        }`}
                      >
                        {formatSolSigned(row.net)}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <Badge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-1 flex items-center justify-between border-t border-line2 pt-3.5">
              <span className="text-xs text-muted">
                Page {data.page} of {totalPages}
                {loading && <span className="ml-2 text-faint">updating…</span>}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => onPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages || loading}
                  onClick={() => onPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
