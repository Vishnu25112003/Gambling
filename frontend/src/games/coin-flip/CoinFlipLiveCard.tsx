import { type RefObject } from 'react';
import { Button, Card, Spinner } from '../../components/shared/ui';
import { Coin3D, type Coin3DHandle } from './Coin3D';

type RoundPhase = 'pre_spin' | 'spinning' | 'revealing';

interface RoundResult {
  roundNumber: number;
  winnerId: string | null;
  result: 'heads' | 'tails' | null;
  call: 'heads' | 'tails' | null;
  cause: string;
  scores: Record<string, number>;
}

interface CoinFlipLiveCardProps {
  coinRef: RefObject<Coin3DHandle | null>;
  roundNumber: number;
  totalRounds: number;
  myScore: number;
  oppScore: number;
  opponentLabel: string;
  myRole: 'spinner' | 'caller' | null;
  roundPhase: RoundPhase;
  timeLeft: number;
  lastResult: RoundResult | null;
  iWonLastRound: boolean;
  onSpin: () => void;
  onCall: (call: 'heads' | 'tails') => void;
}

/**
 * The live-round card: score bar, the 3D coin, and whatever controls the
 * current round phase calls for. Purely presentational — every value it
 * needs is derived from the real match state in CoinFlipBoard.tsx and
 * passed in as props; this file owns no socket or timer logic of its own.
 */
export function CoinFlipLiveCard({
  coinRef,
  roundNumber,
  totalRounds,
  myScore,
  oppScore,
  opponentLabel,
  myRole,
  roundPhase,
  timeLeft,
  lastResult,
  iWonLastRound,
  onSpin,
  onCall,
}: CoinFlipLiveCardProps) {
  const timerColor = timeLeft <= 3 ? 'text-red' : timeLeft <= 5 ? 'text-gold' : 'text-green';
  const showTimer = !lastResult && roundPhase !== 'revealing' && timeLeft > 0;

  return (
    <>
      <Card className="mb-4 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="text-center">
            <p className="text-[11px] text-muted">You</p>
            <p className="text-xl font-bold">{myScore}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-muted">Round</p>
            <p className="text-lg font-bold">
              {roundNumber}/{totalRounds}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-muted">{opponentLabel}</p>
            <p className="text-xl font-bold">{oppScore}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-4 flex flex-col items-center px-6 py-8">
        {/* Coin + ground shadow */}
        <div className="relative mb-3 flex h-[310px] w-[300px] items-center justify-center">
          <div
            className="absolute bottom-0.5 h-[30px] w-[205px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 70%)' }}
          />
          <Coin3D ref={coinRef} className="h-[300px] w-[300px]" />
        </div>

        {!lastResult && roundPhase === 'pre_spin' && (
          <>
            {myRole === 'spinner' ? (
              <>
                <p className="text-sm font-bold text-text">Your turn to spin.</p>
                <Button variant="primary" className="mt-4" onClick={onSpin}>
                  Spin Coin
                </Button>
              </>
            ) : (
              <p className="text-sm text-gold">Waiting for {opponentLabel} to spin…</p>
            )}
          </>
        )}

        {!lastResult && roundPhase === 'spinning' && (
          <>
            <p className="text-sm font-bold text-gold">
              {myRole === 'caller' ? 'Spinning…' : `Waiting for ${opponentLabel} to call…`}
            </p>
            {myRole === 'caller' && (
              <div className="mt-4 flex gap-3">
                <Button variant="solid" size="lg" className="flex-1" onClick={() => onCall('heads')}>
                  Heads
                </Button>
                <Button variant="secondary" size="lg" className="flex-1" onClick={() => onCall('tails')}>
                  Tails
                </Button>
              </div>
            )}
          </>
        )}

        {!lastResult && roundPhase === 'revealing' && (
          <>
            <p className="mb-2 text-sm font-bold text-gold">Revealing…</p>
            <Spinner className="size-5" />
          </>
        )}

        {showTimer && <p className={`mt-3 text-2xl font-extrabold ${timerColor}`}>{timeLeft}s</p>}

        {lastResult && (
          <div className="animate-[fadeUp_.35s_ease-out] text-center">
            <p className={`mb-2 text-xl font-extrabold ${iWonLastRound ? 'text-green' : 'text-red'}`}>
              Round {lastResult.roundNumber} — {iWonLastRound ? 'You win!' : `${opponentLabel} wins!`}
            </p>
            {lastResult.result ? (
              <p className="text-xs text-muted">
                It was <span className="text-gold uppercase">{lastResult.result}</span>
                {lastResult.cause === 'correct_call' && ` — ${lastResult.call}, correct call!`}
                {lastResult.cause === 'wrong_call' && ` — ${lastResult.call}, wrong call.`}
              </p>
            ) : (
              <p className="text-xs text-muted">
                {lastResult.cause === 'no_call' ? 'Caller timed out.' : 'Spinner timed out.'}
              </p>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
