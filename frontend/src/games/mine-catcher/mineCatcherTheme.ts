import type { CSSProperties } from 'react';

/**
 * Shared geometry + surface styling for the Mine Catcher boards, ported from
 * the `Mine Catcher.dc.html` design handoff (frame/terrain/grid, cell sizing,
 * coordinate labels). Kept in one place so the placement and attack grids —
 * which must line up pixel-for-pixel with each other — can't drift apart.
 */

export type BoardSize = 25 | 49 | 81 | 100;

export const MINE_COUNT = 10;

const SIDE_BY_BOARD_SIZE: Record<BoardSize, number> = { 25: 5, 49: 7, 81: 9, 100: 10 };

/** Cell edge length in px, keyed by board side — matches the design's own `CELL` table. */
const CELL_PX_BY_SIDE: Record<number, number> = { 5: 84, 7: 64, 9: 52, 10: 46 };

const LETTERS = 'ABCDEFGHIJ';

export function boardSide(boardSize: BoardSize): number {
  return SIDE_BY_BOARD_SIZE[boardSize];
}

export function cellPx(boardSize: BoardSize): number {
  return CELL_PX_BY_SIDE[boardSide(boardSize)] ?? 46;
}

/** "A1", "C4", … — row letter + 1-indexed column, read off a flat cell index. */
export function coordLabel(index: number, boardSize: BoardSize): string {
  const side = boardSide(boardSize);
  return `${LETTERS[Math.floor(index / side)]}${(index % side) + 1}`;
}

/** The recessed metal frame each grid sits inside. */
export function frameStyle(shake: boolean): CSSProperties {
  return {
    position: 'relative',
    borderRadius: 10,
    padding: 5,
    background: 'linear-gradient(#141a14,#0a0f0b)',
    border: '1px solid rgba(74,222,128,.16)',
    boxShadow: '0 20px 46px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05)',
    animation: shake ? 'mc-shake .45s ease-in-out' : 'none',
  };
}

/** The textured "dirt" backdrop behind the grid, inside the frame. */
export function terrainStyle(): CSSProperties {
  return {
    borderRadius: 6,
    padding: 'clamp(10px,2.4vw,20px)',
    display: 'flex',
    justifyContent: 'center',
    background:
      'radial-gradient(120% 90% at 50% 0%, rgba(74,222,128,.05), transparent 60%), ' +
      'repeating-linear-gradient(45deg, rgba(255,255,255,.014) 0 6px, transparent 6px 12px), #070c08',
    border: '1px solid rgba(0,0,0,.6)',
    boxShadow: 'inset 0 0 50px rgba(0,0,0,.7)',
  };
}

export function gridStyle(side: number, px: number): CSSProperties {
  return { display: 'grid', gridTemplateColumns: `repeat(${side},${px}px)`, gap: 5 };
}

/**
 * Cell sizing/shadow only — border and background are Tailwind classes
 * (see {@link CELL_BASE_CLASS} and friends) rather than inline styles, so a
 * real `:hover` in the stylesheet can still repaint the border. Inline
 * styles always win over a stylesheet rule regardless of pseudo-class, so
 * mixing the two for the same property would make hover a no-op.
 */
export function cellGeometryStyle(px: number): CSSProperties {
  return {
    width: px,
    height: px,
    boxSizing: 'border-box',
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    borderRadius: 6,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), inset 0 -2px 5px rgba(0,0,0,.45)',
    transition: 'border-color .12s, box-shadow .12s, transform .12s',
  };
}

/** Untouched terrain — border + background classes for an empty cell. */
export const CELL_BASE_CLASS =
  'border border-[rgba(74,222,128,.14)] bg-[linear-gradient(160deg,rgba(255,255,255,.045),rgba(255,255,255,.008)_55%,rgba(0,0,0,.28))]';

/** Hover affordance for a cell that can still be clicked. */
export const CELL_HOVER_CLASS = 'hover:border-[rgba(74,222,128,.5)] cursor-crosshair';

/** An armed (mine-holding) cell on the placement board. */
export const CELL_ARMED_CLASS =
  'border border-[rgba(248,113,113,.6)] bg-[linear-gradient(160deg,rgba(248,113,113,.22),rgba(80,15,10,.3))]';
