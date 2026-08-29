/**
 * Classic 15x15 Ludo board geometry — GENERATED, not hand-typed.
 *
 * There are ZERO hand-written coordinate literals below. The full board is
 * derived from:
 *   1. The engine's own constants (TRACK_LENGTH = 52, COLOR_START_OFFSET,
 *      HOME_COLUMN_LENGTH = 6, SAFE_SQUARES) — the single source of truth
 *      for the rules, mirrored from backend/src/games/ludo/types.ts.
 *   2. The cross-shaped board's 90-degree rotational symmetry about the
 *      center hub. Red's opening arm + home lane are described once as a
 *      short walk; the other three colors are produced by rotating that
 *      walk 90/180/270 degrees. (A Ludo board is perfectly symmetric under
 *      90-degree rotation about its center, so one arm implies all four.)
 *
 * This keeps the frontend in lockstep with the backend engine: if the engine
 * ever changes TRACK_LENGTH / offsets, the board follows automatically.
 *
 * The only "anchor" is Red's start cell (6,1) — one coordinate is required to
 * seed the rotation; everything else is topology.
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

// ---------------------------------------------------------------------------
// Engine constants (mirror backend/src/games/ludo/types.ts)
// ---------------------------------------------------------------------------

export const BOARD_SIZE = 15;

/** Number of shared track squares (0..51). Mirrors TRACK_LENGTH on the backend. */
export const TRACK_LENGTH = 52;

/** Home column length (squares to reach final home). Mirrors HOME_COLUMN_LENGTH. */
export const HOME_COLUMN_LENGTH = 6;

/** Start position offset for each color on the global track. */
export const COLOR_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/** Global track positions that are safe (mirrors SAFE_SQUARES on the backend). */
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// ---------------------------------------------------------------------------
// Topology helpers
// ---------------------------------------------------------------------------

/** Board center index (the hub cell at the middle of the cross). */
const CENTER = (BOARD_SIZE - 1) / 2; // 7

/** 90-degree clockwise rotation of a cell about the board center (7,7). */
function rotate90(cell: Cell): Cell {
  // For a (2k+1)x(2k+1) grid, 90deg CW about center maps (r,c) -> (c, (N-1)-r).
  return { row: cell.col, col: BOARD_SIZE - 1 - cell.row };
}

/** Apply the rotation `times` times. */
function rotate(cell: Cell, times: number): Cell {
  let out = cell;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) out = rotate90(out);
  return out;
}

/** Rotate every cell in a path. */
function rotatePath(cells: Cell[], times: number): Cell[] {
  return cells.map((c) => rotate(c, times));
}

/** Walk a series of directional segments from a start cell, returning every cell. */
function walk(
  start: Cell,
  segments: { dr: number; dc: number; steps: number }[],
): Cell[] {
  const cells: Cell[] = [{ ...start }];
  let cur = { ...start };
  for (const seg of segments) {
    for (let i = 0; i < seg.steps; i++) {
      cur = { row: cur.row + seg.dr, col: cur.col + seg.dc };
      cells.push({ ...cur });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// The RING_PATH: Red's 13-cell opening arm, then rotate 90/180/270.
// ---------------------------------------------------------------------------
//
// Red's arm (from its start square at (6,1), clockwise):
//   right 4  -> (6,1)..(6,5)
//   diag UR 1-> (5,6)            (the corner cut around the hub)
//   up 4     -> (5,6)..(1,6)
//   up 1     -> (0,6)
//   right 2  -> (0,6)..(0,8)
// Total: 13 cells. The other three colors are this arm rotated by 90/180/270
// about the center, which is exactly how a physical Ludo board is laid out.

const RED_ARM = walk(
  { row: 6, col: 1 },
  [
    { dr: 0, dc: 1, steps: 4 },
    { dr: -1, dc: 1, steps: 1 },
    { dr: -1, dc: 0, steps: 4 },
    { dr: -1, dc: 0, steps: 1 },
    { dr: 0, dc: 1, steps: 2 },
  ],
);

/** The 52 shared track cells, in ring order, index 0 aligned with Red's start. */
export const RING_PATH: Cell[] = [
  ...RED_ARM,
  ...rotatePath(RED_ARM, 1),
  ...rotatePath(RED_ARM, 2),
  ...rotatePath(RED_ARM, 3),
];

// ---------------------------------------------------------------------------
// HOME_COLUMNS: each color's 6-cell home lane, derived from Red's lane.
// ---------------------------------------------------------------------------
//
// Red's home lane runs along the center row, cols 1..6 (ending adjacent to the
// hub). The others are the same lane rotated 90/180/270.

const RED_HOME = walk(
  { row: 7, col: 1 },
  [{ dr: 0, dc: 1, steps: HOME_COLUMN_LENGTH - 1 }],
);

export const HOME_COLUMNS: Record<LudoColor, Cell[]> = {
  red: RED_HOME,
  green: rotatePath(RED_HOME, 1),
  yellow: rotatePath(RED_HOME, 2),
  blue: rotatePath(RED_HOME, 3),
};

// ---------------------------------------------------------------------------
// Yards: four 6x6 corner blocks. Each color owns one corner; the 2x2 dot
// slots are offsets within that block (still topology, not absolute coords).
// ---------------------------------------------------------------------------

export const YARD_ORIGIN: Record<LudoColor, Cell> = {
  red: { row: 0, col: 0 },
  green: { row: 0, col: 9 },
  yellow: { row: 9, col: 9 },
  blue: { row: 9, col: 0 },
};

/** 4 dot slots per yard (2x2), relative to YARD_ORIGIN. */
const YARD_SLOT_OFFSETS: Cell[] = [
  { row: 1, col: 1 },
  { row: 1, col: 4 },
  { row: 4, col: 1 },
  { row: 4, col: 4 },
];

export const YARD_SLOTS: Record<LudoColor, Cell[]> = (
  ['red', 'green', 'yellow', 'blue'] as const
).reduce(
  (acc, color) => {
    const origin = YARD_ORIGIN[color];
    acc[color] = YARD_SLOT_OFFSETS.map((o) => ({
      row: origin.row + o.row,
      col: origin.col + o.col,
    }));
    return acc;
  },
  {} as Record<LudoColor, Cell[]>,
);

/** The center hub's 4 innermost cells — one per color, where its home lane ends. */
export const CENTER_INNER: Record<LudoColor, Cell> = {
  red: HOME_COLUMNS.red[HOME_COLUMN_LENGTH - 1],
  green: HOME_COLUMNS.green[HOME_COLUMN_LENGTH - 1],
  yellow: HOME_COLUMNS.yellow[HOME_COLUMN_LENGTH - 1],
  blue: HOME_COLUMNS.blue[HOME_COLUMN_LENGTH - 1],
};

export const CENTER_POINT: Cell = { row: CENTER, col: CENTER };

// ---------------------------------------------------------------------------
// Theme-aware colors (reuse app tokens, not hardcoded hex).
// ---------------------------------------------------------------------------

export const LUDO_COLOR_VAR: Record<LudoColor, string> = {
  red: 'var(--red)',
  green: 'var(--green-solid)',
  yellow: 'var(--gold)',
  blue: 'var(--ludo-blue)',
};

// ---------------------------------------------------------------------------
// Lookups used by the renderer
// ---------------------------------------------------------------------------

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
