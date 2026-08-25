import { Card, Button } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';

/**
 * Standalone result card for Ludo. Can be embedded in match-history rows,
 * share links, or rendered standalone after a match. The live match result
 * is shown inside LudoBoard — this component exists for when results
 * are loaded from the API after the fact.
 */

interface LudoResultProps {
  won: boolean;
  stake: string;
  payout: string;
  rankings: { playerId: string; rank: number; totalSteps: number }[];
  seatCount: number;
  myId: string;
  pot: string;
  feeCollected: string;
  playerNames?: Record<string, string>;
  onPlayAgain?: () => void;
}

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4th'];

export function LudoResult({
  won,
  stake,
  payout,
  rankings,
  seatCount,
  myId,
  pot,
  feeCollected,
  playerNames = {},
  onPlayAgain,
}: LudoResultProps) {
  return (
    <Card className="mx-auto max-w-sm px-6 py-10 text-center">
      <span className="mb-3 block text-5xl">{won ? '🏆' : '😢'}</span>
      <p className="mb-1 text-xl font-extrabold">
        {won ? 'You won!' : 'You lost.'}
      </p>
      <p className="mb-6 text-sm text-muted">
        {seatCount} players · {rankings.length} ranked
      </p>

      {/* Leaderboard */}
      <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
        {rankings.map((r, i) => (
          <div
            key={r.playerId}
            className={`flex items-center justify-between py-1.5 ${
              i < rankings.length - 1 ? 'border-b border-line' : ''
            } ${r.playerId === myId ? 'text-green' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{RANK_MEDALS[r.rank - 1] ?? `#${r.rank}`}</span>
              <span className="text-sm font-bold">
                {r.playerId === myId ? 'You' : (playerNames[r.playerId] ?? 'Player')}
              </span>
            </div>
            <span className="text-sm font-bold">{r.totalSteps} steps</span>
          </div>
        ))}
      </div>

      {/* Payout breakdown */}
      <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Stake</span>
          <span className="font-bold">{formatSol(stake)} SOL</span>
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-muted">Pot</span>
          <span className="font-bold">{formatSol(pot)} SOL</span>
        </div>
        {won && (
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-green">Your payout</span>
            <span className="font-bold text-green">{formatSol(payout)} SOL</span>
          </div>
        )}
        {Number(feeCollected) > 0 && (
          <div className="mt-1 flex justify-between text-xs text-faint">
            <span>Platform fee (5%)</span>
            <span>{formatSol(feeCollected)} SOL</span>
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
