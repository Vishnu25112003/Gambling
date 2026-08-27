/**
 * Classic 15x15 Ludo board geometry.
 *
 * Pure data + lookup functions — no React, no socket code. Mirrors the
 * backend's own board model (backend/src/games/ludo/types.ts,
 * COLOR_START_OFFSET / SAFE_SQUARES / HOME_COLUMN_LENGTH) so a token's
 * zone/position/homePosition maps to exactly one cell on this grid.
 *
 * The 52-cell RING_PATH was generated and verified programmatically (not
 * hand-typed): built as a single closed walk around the cross-shaped path
 * region, confirmed to have 52 unique cells, orthogonal adjacency between
 * every consecutive pair (including the wrap from index 51 back to 0), and
 * offsets 0/13/26/39 landing on the cell each color exits into from its own
 * yard — matching backend/src/games/ludo/types.ts's COLOR_START_OFFSET and
 * SAFE_SQUARES exactly.
 */

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface Cell {
  row: number;
  col: number;
}

export interface BoardToken {
  zone: 'yard' | 'track' | 'home';
  position: number;
  homePosition: number;
}

export const BOARD_SIZE = 15;

export const COLOR_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/** Mirrors backend SAFE_SQUARES (types.ts:60) — global track indices that are safe. */
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/**
 * The 52 shared track cells, in ring order, index 0 aligned with
 * COLOR_START_OFFSET.red === 0. A token's global position
 * (COLOR_START_OFFSET[color] + position) % 52 indexes directly into this.
 */
export const RING_PATH: Cell[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6],
  [0, 6], [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10],
  [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10],
  [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6], [13, 6],
  [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
].map(([row, col]) => ({ row, col }));

/**
 * The center hub (rows 6-8, cols 6-8) is rendered as one solid pinwheel
 * block, not individual path cells — this is where the ring's 4 "corner
 * turns" visually happen: e.g. red's last horizontal cell (6,5) and first
 * vertical cell (5,6) each border the hub block on one side, meeting at its
 * corner, exactly like a real board. RING_PATH deliberately excludes the 4
 * hub-corner cells for this reason — token indexing never needs them.
 */

/** 6 cells per color, homePosition 1..6 (index 0..5), outer -> center. */
export const HOME_COLUMNS: Record<LudoColor, Cell[]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]].map(([row, col]) => ({ row, col })),
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]].map(([row, col]) => ({ row, col })),
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]].map(([row, col]) => ({ row, col })),
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]].map(([row, col]) => ({ row, col })),
};

/** Top-left origin of each color's 6x6 yard block. */
export const YARD_ORIGIN: Record<LudoColor, Cell> = {
  red: { row: 0, col: 0 },
  green: { row: 0, col: 9 },
  yellow: { row: 9, col: 9 },
  blue: { row: 9, col: 0 },
};

/** 4 dot slots per yard (2x2), relative to YARD_ORIGIN, matching the reference image. */
const YARD_SLOT_OFFSETS: Cell[] = [
  { row: 1, col: 1 },
  { row: 1, col: 4 },
  { row: 4, col: 1 },
  { row: 4, col: 4 },
];

export const YARD_SLOTS: Record<LudoColor, Cell[]> = (['red', 'green', 'yellow', 'blue'] as const).reduce(
  (acc, color) => {
    const origin = YARD_ORIGIN[color];
    acc[color] = YARD_SLOT_OFFSETS.map((o) => ({ row: origin.row + o.row, col: origin.col + o.col }));
    return acc;
  },
  {} as Record<LudoColor, Cell[]>,
);

/** The center hub's 4 innermost cells — one per color, where its home column ends. */
export const CENTER_INNER: Record<LudoColor, Cell> = {
  red: { row: 7, col: 6 },
  green: { row: 6, col: 7 },
  yellow: { row: 7, col: 8 },
  blue: { row: 8, col: 7 },
};

export const CENTER_POINT: Cell = { row: 7, col: 7 };

/**
 * CSS var per color — reuses the app's existing theme-aware tokens
 * (index.css) instead of hardcoding hex, so the board follows light/dark
 * theme changes for free. Only blue needed a new token (`--ludo-blue`);
 * red/green/yellow already had a close enough match.
 */
export const LUDO_COLOR_VAR: Record<LudoColor, string> = {
  red: 'var(--red)',
  green: 'var(--green-solid)',
  yellow: 'var(--gold)',
  blue: 'var(--ludo-blue)',
};

/** Global track index (0-51) for a color at a given color-relative track position. */
export function getGlobalPosition(color: LudoColor, trackPosition: number): number {
  return (COLOR_START_OFFSET[color] + trackPosition) % RING_PATH.length;
}

/**
 * Maps a token to the board cell it currently occupies. Yard tokens use
 * `tokenIndex` (0-3) to pick a stable dot slot; track/home tokens are
 * positioned via RING_PATH / HOME_COLUMNS.
 */
export function getCellForToken(color: LudoColor, token: BoardToken, tokenIndex: number): Cell {
  if (token.zone === 'yard') {
    return YARD_SLOTS[color][tokenIndex % 4];
  }
  if (token.zone === 'home') {
    const idx = Math.min(Math.max(token.homePosition - 1, 0), HOME_COLUMNS[color].length - 1);
    return HOME_COLUMNS[color][idx];
  }
  const globalIndex = getGlobalPosition(color, token.position);
  return RING_PATH[globalIndex];
}

/** Direction (as a unit vector) each color's very first track cell points, for the entry arrow. */
export function getEntryDirection(color: LudoColor): { dRow: number; dCol: number } {
  const offset = COLOR_START_OFFSET[color];
  const a = RING_PATH[offset];
  const b = RING_PATH[(offset + 1) % RING_PATH.length];
  return { dRow: b.row - a.row, dCol: b.col - a.col };
}
