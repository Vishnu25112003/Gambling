import { useCallback, useState } from 'react';
import { Card } from '../../components/shared/ui';
import { MineGlyph } from './MineGlyph';
import {
  boardSide,
  CELL_ARMED_CLASS,
  CELL_BASE_CLASS,
  CELL_HOVER_CLASS,
  cellGeometryStyle,
  cellPx,
  frameStyle,
  gridStyle,
  terrainStyle,
  type BoardSize,
} from './mineCatcherTheme';

interface MinePlacementBoardProps {
  boardSize: BoardSize;
  totalMines: number;
  placementTimeLeft: number;
  onPlace: (cells: number[]) => void;
  onReady: () => void;
  isReady: boolean;
  opponentReady: boolean;
}

/**
 * Reskin of the deployment phase from `Mine Catcher.dc.html` — armed cells
 * carry the fuse-lit {@link MineGlyph}, an "ordnance" pip row tracks mines
 * placed vs. buried, and Auto-lay / Clear give the same one-tap shortcuts
 * the design offers before a placement is committed. All three only touch
 * local `selected` state; nothing reaches the server until Ready is pressed.
 */
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
  const side = boardSide(boardSize);
  const px = cellPx(boardSize);

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

  const randomFill = useCallback(() => {
    if (isReady) return;
    const all = Array.from({ length: boardSize }, (_, i) => i);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    setSelected(new Set(all.slice(0, totalMines)));
  }, [isReady, boardSize, totalMines]);

  const clearAll = useCallback(() => {
    if (!isReady) setSelected(new Set());
  }, [isReady]);

  const handleReady = useCallback(() => {
    if (selected.size !== totalMines) return;
    onPlace([...selected]);
    onReady();
  }, [selected, totalMines, onPlace, onReady]);

  const minutes = Math.floor(placementTimeLeft / 60);
  const seconds = placementTimeLeft % 60;
  const timerColor = placementTimeLeft <= 10 ? 'text-red' : 'text-text';
  const placedCount = selected.size;
  const canReady = placedCount >= totalMines;

  return (
    <div className="mx-auto w-full max-w-[640px]" style={{ fontFamily: "'Chakra Petch',Inter,sans-serif" }}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-[.24em] text-green uppercase">You · deployment</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight">Arm your field</div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-right font-mono text-lg font-bold ${timerColor}`}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </div>
          {!isReady && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={randomFill}
                className="rounded-[6px] border border-line px-3 py-2 font-mono text-[10px] tracking-[.14em] text-muted uppercase hover:border-green-solid/60 hover:text-text"
              >
                Auto-lay
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-[6px] border border-red/25 px-3 py-2 font-mono text-[10px] tracking-[.14em] text-muted uppercase hover:border-red/65 hover:text-text"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={frameStyle(false)}>
        <div style={terrainStyle()}>
          <div style={gridStyle(side, px)}>
            {Array.from({ length: boardSize }).map((_, i) => {
              const armed = selected.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isReady}
                  onClick={() => toggleCell(i)}
                  style={{ ...cellGeometryStyle(px), opacity: isReady ? 0.65 : 1 }}
                  className={`${armed ? CELL_ARMED_CLASS : CELL_BASE_CLASS} ${!isReady ? CELL_HOVER_CLASS : 'cursor-default'}`}
                >
                  {armed && <MineGlyph size="50%" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Card className="mt-4 flex items-center gap-3.5 px-4 py-3.5">
        <div className="font-mono text-[10px] tracking-[.2em] text-muted uppercase">Ordnance</div>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {Array.from({ length: totalMines }).map((_, i) => (
            <div
              key={i}
              className="size-[16px] rounded-full box-border"
              style={
                i < placedCount
                  ? { background: 'rgba(255,255,255,.05)', border: '1px dashed rgba(74,222,128,.3)' }
                  : {
                      background: 'radial-gradient(circle at 32% 26%,#767c82,#2b2f33 48%,#0a0c0e)',
                      border: '1px solid rgba(0,0,0,.5)',
                      boxShadow: 'inset -1px -2px 4px rgba(0,0,0,.7)',
                    }
              }
            />
          ))}
        </div>
        <div className="font-mono text-[15px] font-extrabold">
          {placedCount}
          <span className="text-faint">/{totalMines}</span>
        </div>
      </Card>

      {!isReady ? (
        <button
          type="button"
          disabled={!canReady}
          onClick={handleReady}
          className="mt-3 w-full rounded-[6px] py-4 text-[14px] font-bold tracking-[.16em] uppercase transition disabled:cursor-not-allowed"
          style={
            canReady
              ? {
                  background: 'linear-gradient(#a8f07a,#5fc23c)',
                  color: '#06170d',
                  boxShadow: '0 6px 0 #35761f',
                }
              : { background: 'rgba(255,255,255,.03)', color: 'var(--faint)' }
          }
        >
          {canReady ? `Lock in ${totalMines} mines` : `Bury ${totalMines - placedCount} more mine${totalMines - placedCount === 1 ? '' : 's'}`}
        </button>
      ) : (
        <div className="mt-3 rounded-[6px] border border-green-solid/40 bg-green-solid/10 px-4 py-3 text-center">
          <p className="text-sm font-bold text-green">
            {opponentReady ? 'Both fields armed — starting!' : 'Field armed — waiting for opponent…'}
          </p>
        </div>
      )}
    </div>
  );
}
