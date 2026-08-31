import { Heart } from 'lucide-react';
import { Card } from '../../components/shared/ui';

export interface BallReveal {
  batterPick: number;
  bowlerPick: number;
  runsScored: number;
  out: boolean;
}

export interface FinishedInningsSummary {
  label: string;
  myRuns: number;
  opponentRuns: number;
}

interface HandCricketPickBoardProps {
  isSuperOver: boolean;
  myRole: 'batting' | 'bowling';
  myRuns: number;
  opponentRuns: number;
  ballsPerInnings: number;
  finishedInnings: FinishedInningsSummary[];
  ballNumber: number;
  pickTimeLeft: number;
  myLives: number;
  opponentLives: number;
  mySubmitted: boolean;
  reveal: BallReveal | null;
  onPick: (n: 1 | 2 | 3 | 4 | 5 | 6) => void;
}

const PICKS = [1, 2, 3, 4, 5, 6] as const;

export function HandCricketPickBoard({
  isSuperOver,
  myRole,
  myRuns,
  opponentRuns,
  ballsPerInnings,
  finishedInnings,
  ballNumber,
  pickTimeLeft,
  myLives,
  opponentLives,
  mySubmitted,
  reveal,
  onPick,
}: HandCricketPickBoardProps) {
  const isBatting = myRole === 'batting';
  const locked = mySubmitted || reveal !== null;
  const timerColor = pickTimeLeft <= 3 ? 'text-red' : pickTimeLeft <= 6 ? 'text-yellow' : 'text-text';

  return (
    <div className="mx-auto max-w-md">
      {isSuperOver && (
        <div className="mb-3 rounded-[10px] border border-yellow/30 bg-yellow/10 px-4 py-2 text-center">
          <p className="text-xs font-bold text-yellow">Super Over — scores were tied</p>
        </div>
      )}

      {finishedInnings.length > 0 && (
        <div className="mb-3 space-y-1 rounded-[12px] border border-line bg-bg2 px-4 py-2">
          {finishedInnings.map((inn) => (
            <div key={inn.label} className="flex items-center justify-between text-xs">
              <span className="text-muted">{inn.label}</span>
              <span className="font-bold">
                You {inn.myRuns} · Opp {inn.opponentRuns}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div className="mb-4 flex items-center justify-between rounded-[12px] border border-line bg-card px-4 py-3">
        <div className="text-center">
          <p className="text-[10px] text-muted">You</p>
          <p className={`text-lg font-bold ${isBatting ? 'text-green' : 'text-muted'}`}>{myRuns}</p>
          <p className="text-[10px] text-muted">{isBatting ? 'batting' : 'bowling'}</p>
        </div>
        <div className="text-center">
          <p className={`font-mono text-2xl font-bold ${timerColor}`}>{pickTimeLeft}s</p>
          <p className="text-[10px] text-muted">
            Ball {ballNumber}/{ballsPerInnings}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted">Opponent</p>
          <p className={`text-lg font-bold ${!isBatting ? 'text-green' : 'text-muted'}`}>{opponentRuns}</p>
          <p className="text-[10px] text-muted">{!isBatting ? 'batting' : 'bowling'}</p>
        </div>
      </div>

      {/* Lives */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart key={i} className={`size-4 fill-red text-red ${i < myLives ? '' : 'opacity-20'}`} />
          ))}
        </div>
        <p className="text-xs text-muted">{isBatting ? 'You are batting' : 'You are bowling'}</p>
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart key={i} className={`size-4 fill-red text-red ${i < opponentLives ? '' : 'opacity-20'}`} />
          ))}
        </div>
      </div>

      {/* Reveal / instructions */}
      {reveal ? (
        <div
          className={`mb-3 rounded-[10px] border px-4 py-3 text-center ${
            reveal.out ? 'border-red/30 bg-red/10' : 'border-green-solid/40 bg-green-solid/10'
          }`}
        >
          <p className="text-sm font-bold">
            You picked {isBatting ? reveal.batterPick : reveal.bowlerPick} · Opponent picked{' '}
            {isBatting ? reveal.bowlerPick : reveal.batterPick}
          </p>
          <p className={`text-xs ${reveal.out ? 'text-red' : 'text-green'}`}>
            {reveal.out ? 'OUT!' : `+${reveal.runsScored} run${reveal.runsScored === 1 ? '' : 's'}`}
          </p>
        </div>
      ) : (
        <div className="mb-3 rounded-[10px] border border-line bg-bg2 px-4 py-2 text-center">
          <p className="text-xs text-muted">
            {locked ? 'Waiting for opponent to pick…' : 'Pick a number 1-6 — both players pick at once'}
          </p>
        </div>
      )}

      {/* Number pad */}
      <Card className="px-3 py-3">
        <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
          {PICKS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={locked}
              onClick={() => onPick(n)}
              className={`flex aspect-square items-center justify-center rounded-[10px] border text-xl font-extrabold transition-all ${
                locked
                  ? 'cursor-not-allowed border-line bg-bg2 text-faint'
                  : 'border-line bg-bg2 hover:border-green-solid/40 hover:bg-bg3 cursor-pointer'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
