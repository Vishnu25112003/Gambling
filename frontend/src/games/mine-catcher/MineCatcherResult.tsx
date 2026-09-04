import { Button } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';
import { MINE_COUNT } from './mineCatcherTheme';

interface MineCatcherResultProps {
  won: boolean;
  myId: string;
  winnerId: string | null;
  foundCounts: Record<string, number>;
  breakCounts: Record<string, number>;
  lives: Record<string, number>;
  endCause: string | null;
  pot: string | null;
  feeCollected: string | null;
  payouts: { userId: string; payout: string }[];
  playerNames?: Record<string, string>;
  onRematch?: () => void;
  onBackToGames?: () => void;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const shotLine = (found: number, misses: number) => {
  const shots = found + misses;
  return `${plural(shots, 'shot')} · ${shots ? Math.round((found / shots) * 100) : 0}% acc`;
};

/**
 * Reskin of the "Field cleared" result screen from `Mine Catcher.dc.html` —
 * same glowing headline + two-up stat cards, layered with the payout
 * breakdown and disconnect messaging the design didn't need to model (it
 * had no real stakes attached).
 */
export function MineCatcherResult({
  won,
  myId,
  winnerId,
  foundCounts,
  breakCounts,
  lives,
  endCause,
  pot,
  feeCollected,
  payouts,
  playerNames = {},
  onRematch,
  onBackToGames,
}: MineCatcherResultProps) {
  const opponentId = Object.keys(foundCounts).find((id) => id !== myId) ?? '';
  const myPayout = payouts.find((p) => p.userId === myId)?.payout ?? '0';

  const endCauseLabel = endCause === 'race_won'
    ? `Found all ${MINE_COUNT} mines first`
    : endCause === 'lives_forfeit'
      ? 'Opponent ran out of lives'
      : endCause === 'dual_unreachable'
        ? 'Both players disconnected'
        : '';

  const winColor = winnerId === myId || !winnerId ? 'var(--green)' : 'var(--red)';
  const winGlow = winnerId === myId || !winnerId ? 'rgba(74,222,128,.35)' : 'rgba(248,113,113,.4)';
  const headline = won ? 'Victory' : winnerId ? 'Defeat' : 'No winner';

  return (
    <div className="mx-auto w-full max-w-[560px] text-center" style={{ fontFamily: "'Chakra Petch',Inter,sans-serif" }}>
      <div className="font-mono text-[10px] tracking-[.3em] text-muted uppercase">Field cleared</div>
      <div
        className="mt-3 text-[52px] leading-none font-bold tracking-[.04em] uppercase"
        style={{ color: winColor, textShadow: `0 0 44px ${winGlow}` }}
      >
        {headline}
      </div>
      <div className="mt-1.5 text-[13px] text-muted">{endCauseLabel}</div>

      <div className="my-7 grid grid-cols-2 gap-2.5 text-left">
        <div className="rounded-[6px] border border-line bg-[linear-gradient(#0c120d,#080d09)] px-4 py-4">
          <div className="font-mono text-[10px] tracking-[.18em] text-muted uppercase">You</div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold text-green">
            {foundCounts[myId] ?? 0}
            <span className="text-[13px] text-faint">/{MINE_COUNT}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted">
            {shotLine(foundCounts[myId] ?? 0, breakCounts[myId] ?? 0)} · {lives[myId] ?? 0} lives left
          </div>
        </div>
        <div className="rounded-[6px] border border-red/15 bg-[linear-gradient(#0c120d,#080d09)] px-4 py-4">
          <div className="font-mono text-[10px] tracking-[.18em] text-muted uppercase">
            {opponentId ? (playerNames[opponentId] ?? 'Opponent') : 'Opponent'}
          </div>
          <div className="mt-1.5 font-mono text-2xl font-extrabold text-red">
            {foundCounts[opponentId] ?? 0}
            <span className="text-[13px] text-faint">/{MINE_COUNT}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted">
            {shotLine(foundCounts[opponentId] ?? 0, breakCounts[opponentId] ?? 0)} · {lives[opponentId] ?? 0} lives left
          </div>
        </div>
      </div>

      {pot && (
        <div className="mb-6 rounded-[6px] border border-line bg-[linear-gradient(#0c120d,#080d09)] px-4 py-3 text-left">
          <div className="flex justify-between text-xs">
            <span className="text-muted">Stake</span>
            <span className="font-bold">{formatSol(payouts[0]?.payout ?? '0')} SOL</span>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-muted">Pot</span>
            <span className="font-bold">{formatSol(pot)} SOL</span>
          </div>
          {won && (
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-green">Your payout</span>
              <span className="font-bold text-green">{formatSol(myPayout)} SOL</span>
            </div>
          )}
          {feeCollected && Number(feeCollected) > 0 && (
            <div className="mt-1 flex justify-between text-xs text-faint">
              <span>Platform fee (5%)</span>
              <span>{formatSol(feeCollected)} SOL</span>
            </div>
          )}
        </div>
      )}

      {endCause === 'dual_unreachable' && (
        <div className="mb-6 rounded-[6px] border border-gold/30 bg-gold/10 px-4 py-3 text-left">
          <p className="text-xs text-gold">
            Both players were unreachable at the same time. The platform retains the pot per game rules.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {onRematch && endCause !== 'dual_unreachable' && (
          <button
            type="button"
            onClick={onRematch}
            className="w-full rounded-[6px] py-4 text-[14px] font-bold tracking-[.16em] text-[#06170d] uppercase"
            style={{ background: 'linear-gradient(#a8f07a,#5fc23c)', boxShadow: '0 6px 0 #35761f' }}
          >
            Run it back
          </button>
        )}
        {onBackToGames && (
          <Button variant="ghost" size="sm" className="w-full" onClick={onBackToGames}>
            Back to Games
          </Button>
        )}
      </div>
    </div>
  );
}
