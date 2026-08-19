import { Card, EmptyState, SectionHeading } from '../shared/ui';
import { Icon } from '../shared/icons';
import { formatSol, formatSolSigned } from '../../lib/format';
import { gameLabel } from '../../lib/gameLabel';
import type { PerGameStat } from '../../types';

/** Doc 11 — the record split by game. Empty until the first game module ships. */
export function PerGameTable({ rows }: { rows: PerGameStat[] }) {
  return (
    <Card radius={18} className="overflow-hidden p-[22px]">
      <SectionHeading
        icon={<Icon name="gamepad" size={18} />}
        title="By game"
        subtitle="How you perform in each game on the hub."
      />

      {rows.length === 0 ? (
        <EmptyState
          radius={14}
          icon={<Icon name="dice" size={19} />}
          scaleIcon
          title="No games played yet"
          body="Once games go live, your record in each one appears here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line2 text-left text-[11px] font-semibold tracking-[0.06em] text-faint">
                <th scope="col" className="py-3 pr-4">GAME</th>
                <th scope="col" className="px-3 py-3 text-right">PLAYED</th>
                <th scope="col" className="px-3 py-3 text-right">W / L</th>
                <th scope="col" className="px-3 py-3 text-right">WAGERED</th>
                <th scope="col" className="py-3 pl-3 text-right">NET</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const net = Number(r.netProfit);
                return (
                  <tr key={r.gameType} className="border-b border-line2 last:border-0">
                    <th scope="row" className="py-3 pr-4 text-left font-semibold">
                      {gameLabel(r.gameType)}
                    </th>
                    <td className="px-3 py-3 text-right">{r.played}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="font-semibold text-green">{r.won}</span>
                      <span className="text-faint"> / </span>
                      <span className="font-semibold text-red">{r.lost}</span>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {formatSol(r.wagered)} SOL
                    </td>
                    <td
                      className={`py-3 pl-3 text-right font-bold whitespace-nowrap ${
                        net < 0 ? 'text-red' : net > 0 ? 'text-green' : 'text-muted'
                      }`}
                    >
                      {formatSolSigned(r.netProfit)} SOL
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
