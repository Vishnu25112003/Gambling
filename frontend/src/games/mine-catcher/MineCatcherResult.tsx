import { Card, Button } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';

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
    ? 'Found all 10 mines first'
    : endCause === 'lives_forfeit'
      ? 'Opponent ran out of lives'
      : endCause === 'dual_unreachable'
        ? 'Both players disconnected'
        : '';

  return (
    <Card className="mx-auto max-w-sm px-6 py-10 text-center">
      <span className="mb-3 block text-5xl">{won ? '🏆' : '😢'}</span>
      <p className="mb-1 text-xl font-extrabold">
        {won ? 'You won!' : winnerId ? 'You lost.' : 'No winner.'}
      </p>
      <p className="mb-6 text-sm text-muted">{endCauseLabel}</p>

      {/* Scoreboard */}
      <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
        <div className="flex items-center justify-between border-b border-line py-2">
          <span className="text-xs text-muted">Player</span>
          <div className="flex gap-4 text-xs text-muted">
            <span>Found</span>
            <span>Breaks</span>
            <span>Lives</span>
          </div>
        </div>
        <div className={`flex items-center justify-between py-2 ${myId === winnerId ? 'text-green' : ''}`}>
          <span className="text-sm font-bold">You</span>
          <div className="flex gap-4 text-sm font-bold">
            <span>{foundCounts[myId] ?? 0}/10</span>
            <span className="text-muted">{breakCounts[myId] ?? 0}</span>
            <span>{lives[myId] ?? 0}</span>
          </div>
        </div>
        {opponentId && (
          <div className={`flex items-center justify-between py-2 ${opponentId === winnerId ? 'text-green' : ''}`}>
            <span className="text-sm font-bold">{playerNames[opponentId] ?? 'Opponent'}</span>
            <div className="flex gap-4 text-sm font-bold">
              <span>{foundCounts[opponentId] ?? 0}/10</span>
              <span className="text-muted">{breakCounts[opponentId] ?? 0}</span>
              <span>{lives[opponentId] ?? 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Payout breakdown */}
      {pot && (
        <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
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
        <div className="mb-6 rounded-[12px] border border-yellow/30 bg-yellow/10 px-4 py-3">
          <p className="text-xs text-yellow">
            Both players were unreachable at the same time. The platform retains the pot per game rules.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {onRematch && endCause !== 'dual_unreachable' && (
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
