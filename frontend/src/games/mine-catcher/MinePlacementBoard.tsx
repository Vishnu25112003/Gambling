import { useState, useCallback } from 'react';
import { Bomb } from 'lucide-react';
import { Button, Card } from '../../components/shared/ui';

type BoardSize = 25 | 49 | 81 | 100;

interface MinePlacementBoardProps {
  boardSize: BoardSize;
  totalMines: number;
  placementTimeLeft: number;
  onPlace: (cells: number[]) => void;
  onReady: () => void;
  isReady: boolean;
  opponentReady: boolean;
}

function gridDimensions(size: BoardSize): { rows: number; cols: number } {
  switch (size) {
    case 25:  return { rows: 5, cols: 5 };
    case 49:  return { rows: 7, cols: 7 };
    case 81:  return { rows: 9, cols: 9 };
    case 100: return { rows: 10, cols: 10 };
  }
}

export function MinePlacementBoard({
  boardSize,
  totalMines,
  placementTimeLeft,
  onPlace,
  onReady,
  isReady,
  opponentReady,
}: MinePlacementBoardProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { cols } = gridDimensions(boardSize);

  const toggleCell = useCallback((index: number) => {
    if (isReady) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < totalMines) {
        next.add(index);
      }
      return next;
    });
  }, [isReady, totalMines]);

  const handleReady = useCallback(() => {
    if (selected.size !== totalMines) return;
    onPlace([...selected]);
    onReady();
  }, [selected, totalMines, onPlace, onReady]);

  const minutes = Math.floor(placementTimeLeft / 60);
  const seconds = placementTimeLeft % 60;
  const timerColor = placementTimeLeft <= 10 ? 'text-red' : 'text-text';

  return (
    <Card className="mx-auto max-w-md px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-text">Place Your Mines</p>
          <p className="text-xs text-muted">
            Tap cells to place mines · {selected.size}/{totalMines} placed
          </p>
        </div>
        <div className={`text-right font-mono text-lg font-bold ${timerColor}`}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Mine count indicators */}
      <div className="mb-3 flex gap-1">
        {Array.from({ length: totalMines }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < selected.size ? 'bg-red' : 'bg-bg3'
            }`}
          />
        ))}
      </div>

      {/* Grid */}
      <div
        className="mx-auto mb-4 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          maxWidth: `${cols * 40}px`,
        }}
      >
        {Array.from({ length: boardSize }).map((_, i) => (
          <button
            key={i}
            type="button"
            disabled={isReady}
            onClick={() => toggleCell(i)}
            className={`flex aspect-square items-center justify-center rounded-[6px] border text-xs font-bold transition-all ${
              selected.has(i)
                ? 'border-red bg-red/20 text-red hover:bg-red/30'
                : 'border-line bg-bg2 text-faint hover:border-green-solid/40 hover:bg-bg3'
            } ${isReady ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
          >
            {selected.has(i) && <Bomb className="size-4" />}
          </button>
        ))}
      </div>

      {/* Ready button */}
      {!isReady ? (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={selected.size !== totalMines}
          onClick={handleReady}
        >
          Ready ({selected.size}/{totalMines})
        </Button>
      ) : (
        <div className="rounded-[10px] border border-green-solid/40 bg-green-solid/10 px-4 py-3 text-center">
          <p className="text-sm font-bold text-green">
            {opponentReady ? 'Both ready — starting!' : 'Waiting for opponent...'}
          </p>
        </div>
      )}
    </Card>
  );
}
