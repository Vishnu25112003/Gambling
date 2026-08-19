import { Card, Button } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';

/**
 * Standalone result card. Can be embedded in match-history rows, share
 * links, or rendered standalone after a match. The live match result is
 * shown inside CoinFlipBoard — this component exists for when results
 * are loaded from the API after the fact.
 */

interface CoinFlipResultProps {
  won: boolean;
  stake: string;
  payout: string;
  coinResult?: 'heads' | 'tails';
  callerCall?: 'heads' | 'tails';
  cause?: string;
  roundNumber: number;
  totalRounds: number;
  scores?: Record<string, number>;
  opponentName?: string;
  onPlayAgain?: () => void;
}

export function CoinFlipResult({
  won,
  stake,
  payout,
  coinResult,
  callerCall,
  cause,
  roundNumber,
  totalRounds,
  scores,
  opponentName,
  onPlayAgain,
}: CoinFlipResultProps) {
  return (
    <Card className="mx-auto max-w-sm px-6 py-10 text-center">
      <span className="mb-3 block text-5xl">{won ? '🏆' : '😢'}</span>
      <p className="mb-1 text-xl font-extrabold">
        {won ? 'You won!' : 'You lost.'}
      </p>
      <p className="mb-6 text-sm text-muted">
        {roundNumber} / {totalRounds} rounds
      </p>

      {coinResult && (
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="text-3xl">
            {coinResult === 'heads' ? '👑' : '🌙'}
          </span>
          {callerCall && (
            <p className="text-xs text-muted">
              You called{' '}
              <span className="font-bold uppercase">{callerCall}</span>
              {cause === 'correct_call' ? ' — correct!' : ' — wrong.'}
            </p>
          )}
        </div>
      )}

      {scores && (
        <div className="mb-6 flex justify-center gap-8">
          <div className="text-center">
            <p className="text-xs text-muted">You</p>
            <p className="text-2xl font-bold">{scores['me'] ?? Object.values(scores)[0] ?? 0}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted">{opponentName ?? 'Opponent'}</p>
            <p className="text-2xl font-bold">
              {scores['them'] ?? Object.values(scores)[1] ?? 0}
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Stake</span>
          <span className="font-bold">{formatSol(stake)} SOL</span>
        </div>
        {won && (
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-green">Payout</span>
            <span className="font-bold text-green">{formatSol(payout)} SOL</span>
          </div>
        )}
      </div>

      {onPlayAgain && (
        <Button variant="primary" className="w-full" onClick={onPlayAgain}>
          Play Again
        </Button>
      )}
    </Card>
  );
}
