import { useCallback } from 'react';
import { Card } from '../../components/shared/ui';

type CellState = 'hidden' | 'break' | 'blast';

interface MineAttackBoardProps {
  boardSize: number;
  myId: string;
  currentAttacker: string | null;
  /** The opponent's board cells as revealed to this player. */
  opponentCells: CellState[];
  /** This player's found mine count. */
  foundCount: number;
  /** This player's break count (stat only). */
  breakCount: number;
  /** Opponent's found mine count. */
  opponentFoundCount: number;
  /** Time left on the current turn (seconds). */
  turnTimeLeft: number;
  /** My lives remaining. */
  myLives: number;
  /** Opponent's lives remaining. */
  opponentLives: number;
  /** Recent attack result to highlight. */
  lastAttack: { cellIndex: number; type: 'break' | 'blast' } | null;
  onAttack: (cellIndex: number) => void;
}

function gridDimensions(size: number): { rows: number; cols: number } {
  if (size <= 25) return { rows: 5, cols: 5 };
  if (size <= 49) return { rows: 7, cols: 7 };
  if (size <= 81) return { rows: 9, cols: 9 };
  return { rows: 10, cols: 10 };
}

function getCellContent(state: CellState, isLastAttack: boolean): { emoji: string; bgClass: string } {
  switch (state) {
    case 'blast':
      return { emoji: '💥', bgClass: 'border-red bg-red/20' };
    case 'break':
      return { emoji: '', bgClass: isLastAttack ? 'border-yellow bg-yellow/10' : 'border-line bg-bg3' };
    case 'hidden':
    default:
      return { emoji: '', bgClass: 'border-line bg-bg2 hover:border-green-solid/40 hover:bg-bg3 cursor-pointer' };
  }
}

export function MineAttackBoard({
  boardSize,
  myId,
  currentAttacker,
  opponentCells,
  foundCount,
  breakCount,
  opponentFoundCount,
  turnTimeLeft,
  myLives,
  opponentLives,
  lastAttack,
  onAttack,
}: MineAttackBoardProps) {
  const { cols } = gridDimensions(boardSize);
  const isMyTurn = currentAttacker === myId;

  const minutes = Math.floor(turnTimeLeft / 60);
  const seconds = turnTimeLeft % 60;
  const timerColor = turnTimeLeft <= 5 ? 'text-red' : turnTimeLeft <= 10 ? 'text-yellow' : 'text-text';

  const handleCellClick = useCallback((index: number) => {
    if (!isMyTurn) return;
    if (opponentCells[index] !== 'hidden') return;
    onAttack(index);
  }, [isMyTurn, opponentCells, onAttack]);

  return (
    <div className="mx-auto max-w-md">
      {/* Status bar */}
      <div className="mb-4 flex items-center justify-between rounded-[12px] border border-line bg-card px-4 py-3">
        <div className="text-center">
          <p className="text-[10px] text-muted">You</p>
          <p className="text-lg font-bold text-green">{foundCount}</p>
          <p className="text-[10px] text-muted">/10 found</p>
        </div>
        <div className="text-center">
          <p className={`font-mono text-2xl font-bold ${timerColor}`}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </p>
          <p className="text-[10px] text-muted">
            {isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted">Opponent</p>
          <p className="text-lg font-bold text-red">{opponentFoundCount}</p>
          <p className="text-[10px] text-muted">/10 found</p>
        </div>
      </div>

      {/* Lives */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={`text-sm ${i < myLives ? '' : 'opacity-20'}`}>
              ❤️
            </span>
          ))}
        </div>
        <p className="text-xs text-muted">
          Breaks: {breakCount}
        </p>
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={`text-sm ${i < opponentLives ? '' : 'opacity-20'}`}>
              ❤️
            </span>
          ))}
        </div>
      </div>

      {/* Turn indicator */}
      {isMyTurn && (
        <div className="mb-3 rounded-[10px] border border-green-solid/40 bg-green-solid/10 px-4 py-2 text-center">
          <p className="text-xs font-bold text-green">Your turn — click a cell on the opponent's board</p>
        </div>
      )}

      {!isMyTurn && (
        <div className="mb-3 rounded-[10px] border border-line bg-bg2 px-4 py-2 text-center">
          <p className="text-xs text-muted">Waiting for opponent to attack...</p>
        </div>
      )}

      {/* Board */}
      <Card className="px-3 py-3">
        <div
          className="mx-auto grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            maxWidth: `${cols * 40}px`,
          }}
        >
          {opponentCells.map((cellState, i) => {
            const isLast = lastAttack?.cellIndex === i;
            const { emoji, bgClass } = getCellContent(cellState, isLast);
            const isHidden = cellState === 'hidden';

            return (
              <button
                key={i}
                type="button"
                disabled={!isMyTurn || !isHidden}
                onClick={() => handleCellClick(i)}
                className={`aspect-square rounded-[6px] border text-xs font-bold transition-all ${bgClass} ${
                  isMyTurn && isHidden ? 'cursor-pointer' : ''
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
