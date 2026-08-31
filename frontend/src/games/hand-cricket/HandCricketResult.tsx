import { Frown, Trophy } from 'lucide-react';
import { Card, Button } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';

interface InningsResult {
  batterId: string;
  bowlerId: string;
  runs: number;
  isOut: boolean;
  ballsBowled: number;
  ballsPerInnings: number;
}

interface HandCricketResultProps {
  won: boolean;
  myId: string;
  winnerId: string | null;
  split: boolean;
  innings: InningsResult[];
  lives: Record<string, number>;
  endCause: string | null;
  pot: string | null;
  feeCollected: string | null;
  payouts: { userId: string; payout: string }[];
  playerNames?: Record<string, string>;
  onRematch?: () => void;
  onBackToGames?: () => void;
}

function inningsLabel(index: number): string {
  return ['Innings 1', 'Innings 2', 'Super Over 1', 'Super Over 2'][index] ?? `Innings ${index + 1}`;
}

export function HandCricketResult({
  won,
  myId,
  winnerId,
  split,
  innings,
  lives,
  endCause,
  pot,
  feeCollected,
  payouts,
  playerNames = {},
  onRematch,
  onBackToGames,
}: HandCricketResultProps) {
  const opponentId = Object.keys(lives).find((id) => id !== myId) ?? '';
  const myPayout = payouts.find((p) => p.userId === myId)?.payout ?? '0';

  const endCauseLabel =
    endCause === 'runs_higher'
      ? 'Higher total runs'
      : endCause === 'super_over_decided'
        ? 'Decided in the Super Over'
        : endCause === 'lives_forfeit'
          ? 'Opponent ran out of lives'
          : endCause === 'super_over_tied_split'
            ? 'Super Over also tied — pot split evenly'
            : endCause === 'dual_unreachable'
              ? 'Both players disconnected'
              : '';

  const rematchSuppressed = endCause === 'dual_unreachable' || endCause === 'lives_forfeit';

  return (
    <Card className="mx-auto max-w-sm px-6 py-10 text-center">
      {split ? (
        <Trophy className="mx-auto mb-3 size-12 text-yellow" />
      ) : won ? (
        <Trophy className="mx-auto mb-3 size-12 text-gold" />
      ) : (
        <Frown className="mx-auto mb-3 size-12 text-muted" />
      )}
      <p className="mb-1 text-xl font-extrabold">
        {split ? 'Pot split evenly' : won ? 'You won!' : winnerId ? 'You lost.' : 'No winner.'}
      </p>
      <p className="mb-6 text-sm text-muted">{endCauseLabel}</p>

      {/* Innings-by-innings scoreboard */}
      <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
        {innings.map((inn, i) => {
          const isMine = inn.batterId === myId;
          return (
            <div key={i} className="flex items-center justify-between border-b border-line py-2 last:border-b-0">
              <span className="text-xs text-muted">{inningsLabel(i)}</span>
              <span className="text-sm font-bold">
                {isMine ? 'You' : playerNames[inn.batterId] ?? 'Opponent'}: {inn.runs}
                {inn.isOut ? ' (out)' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Lives */}
      <div className="mb-6 flex items-center justify-between rounded-[12px] border border-line bg-bg2 px-4 py-3">
        <div className="text-center">
          <p className="text-[10px] text-muted">You</p>
          <p className="text-sm font-bold">{lives[myId] ?? 0} lives</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted">{playerNames[opponentId] ?? 'Opponent'}</p>
          <p className="text-sm font-bold">{lives[opponentId] ?? 0} lives</p>
        </div>
      </div>

      {/* Payout breakdown */}
      {pot && (
        <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted">Pot</span>
            <span className="font-bold">{formatSol(pot)} SOL</span>
          </div>
          {(won || split) && (
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
        <div className="mb-6 rounded-[12px] border border-yellow/30 bg-yellow/10 px-4 py-3">
          <p className="text-xs text-yellow">
            Both players were unreachable at the same time. The platform retains the pot per game rules.
          </p>
        </div>
      )}

      {endCause === 'super_over_tied_split' && (
        <div className="mb-6 rounded-[12px] border border-yellow/30 bg-yellow/10 px-4 py-3">
          <p className="text-xs text-yellow">The Super Over also ended in a tie — the pot was split evenly.</p>
        </div>
      )}

      <div className="space-y-2">
        {onRematch && !rematchSuppressed && (
          <Button variant="primary" className="w-full" onClick={onRematch}>
            Rematch
          </Button>
        )}
        {onBackToGames && (
          <Button variant="ghost" size="sm" className="w-full" onClick={onBackToGames}>
            Back to Games
          </Button>
        )}
      </div>
    </Card>
  );
}
