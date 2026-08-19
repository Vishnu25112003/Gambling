import { Card, SectionHeading } from '../shared/ui';
import { Icon } from '../shared/icons';
import { Sparkline } from '../shared/Sparkline';
import { formatSolSigned } from '../../lib/format';
import type { DailyNet } from '../../types';

/**
 * Doc 11 — net profit over the last 30 days.
 *
 * The API always returns one row per day (`generate_series` in stats.ts), so a
 * player with no history gets an honest flat line at zero rather than an empty
 * box. `<Sparkline>` returns null below two points, which only happens if the
 * request failed.
 */
export function ProfitCurve({ curve }: { curve: DailyNet[] }) {
  // Display-only sum, exactly as lib/format.ts licenses — never written back.
  const total = curve.reduce((acc, d) => acc + Number(d.net || 0), 0);
  const played = curve.reduce((acc, d) => acc + d.games, 0);
  const positive = total >= 0;

  return (
    <Card radius={18} className="p-[22px]">
      <SectionHeading
        icon={<Icon name="chart" size={18} />}
        title="Last 30 days"
        subtitle={
          played === 0
            ? 'No matches in the last 30 days.'
            : `${played} ${played === 1 ? 'match' : 'matches'} settled.`
        }
        action={
          <span
            className={`text-[15px] font-extrabold whitespace-nowrap ${
              positive ? 'text-green' : 'text-red'
            }`}
          >
            {formatSolSigned(total.toFixed(9))} SOL
          </span>
        }
      />

      {/* The line draws in currentColor, so the tint is set here. */}
      <div className={positive ? 'text-green' : 'text-red'}>
        <Sparkline
          points={curve.map((d) => d.net)}
          height={84}
          ariaLabel={`Net profit over the last ${curve.length} days, totalling ${formatSolSigned(
            total.toFixed(9),
          )} SOL`}
        />
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{curve[0]?.day ?? ''}</span>
        <span>{curve[curve.length - 1]?.day ?? ''}</span>
      </div>
    </Card>
  );
}
