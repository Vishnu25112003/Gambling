import type { CSSProperties } from 'react';
import {
  BOARD_SIZE,
  CENTER_POINT,
  COLOR_START_OFFSET,
  HOME_COLUMNS,
  LUDO_COLOR_VAR,
  RING_PATH,
  SAFE_SQUARES,
  YARD_ORIGIN,
  YARD_SLOTS,
  getCellForToken,
  getEntryDirection,
  type BoardToken,
  type Cell,
  type LudoColor,
} from './boardGeometry';

/**
 * Classic 15x15 Ludo board — four colored yards, a cross-shaped path, one
 * colored home lane per arm, and a center pinwheel — reproducing the
 * standard board template. Purely additive: token pieces are tappable when
 * it's a valid move, but the existing T1-T4 button row in LudoBoard.tsx
 * stays as a reliable fallback underneath.
 */

interface PlayerInfo {
  id: string;
  displayName?: string | null;
  color: LudoColor;
}

interface ValidMove {
  tokenIndex: number;
  type: 'yard' | 'track' | 'home';
}

interface LudoBoardGridProps {
  players: PlayerInfo[];
  tokens: Record<string, BoardToken[]>;
  myId: string | null;
  validMoves: ValidMove[];
  onMoveToken: (tokenIndex: number) => void;
}

const ALL_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

const key = (c: Cell) => `${c.row},${c.col}`;

const SAFE_CELL_KEYS = new Set([...SAFE_SQUARES].map((idx) => key(RING_PATH[idx])));

/** The outer board corner each yard hugs, for asymmetric rounding. */
const YARD_ROUNDING: Record<LudoColor, string> = {
  red: '18px 4px 4px 4px',
  green: '4px 18px 4px 4px',
  yellow: '4px 4px 18px 4px',
  blue: '4px 4px 4px 18px',
};

function gridArea(row: number, col: number, rowSpan = 1, colSpan = 1): CSSProperties {
  return {
    gridRow: `${row + 1} / span ${rowSpan}`,
    gridColumn: `${col + 1} / span ${colSpan}`,
  };
}

interface TokenOccupant {
  playerId: string;
  color: LudoColor;
  tokenIndex: number;
  isMine: boolean;
  isMovable: boolean;
}

const CLUSTER_OFFSETS = [
  { x: -22, y: -22 },
  { x: 22, y: -22 },
  { x: -22, y: 22 },
  { x: 22, y: 22 },
];

export function LudoBoardGrid({ players, tokens, myId, validMoves, onMoveToken }: LudoBoardGridProps) {
  const movableIndexes = new Set(validMoves.map((m) => m.tokenIndex));

  // Group every player's tokens by the cell they currently occupy.
  const occupantsByCell = new Map<string, TokenOccupant[]>();
  for (const player of players) {
    const playerTokens = tokens[player.id] ?? [];
    playerTokens.forEach((token, tokenIndex) => {
      const cell = getCellForToken(player.color, token, tokenIndex);
      const cellKey = key(cell);
      const occupant: TokenOccupant = {
        playerId: player.id,
        color: player.color,
        tokenIndex,
        isMine: player.id === myId,
        isMovable: player.id === myId && movableIndexes.has(tokenIndex),
      };
      const list = occupantsByCell.get(cellKey) ?? [];
      list.push(occupant);
      occupantsByCell.set(cellKey, list);
    });
  }

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-[16px] border border-line bg-bg2"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
      }}
    >
      {/* Yards */}
      {ALL_COLORS.map((color) => {
        const origin = YARD_ORIGIN[color];
        return (
          <div
            key={color}
            style={{
              ...gridArea(origin.row, origin.col, 6, 6),
              background: LUDO_COLOR_VAR[color],
              borderRadius: YARD_ROUNDING[color],
            }}
            className="relative m-1"
          >
            <div className="absolute inset-[14%] rounded-[10px] bg-bg2/90" />
          </div>
        );
      })}

      {/* Center pinwheel — one solid block; the ring path's corner cells
          border it rather than passing through it (see boardGeometry.ts). */}
      <div style={gridArea(CENTER_POINT.row - 1, CENTER_POINT.col - 1, 3, 3)}>
        <div
          className="size-full"
          style={{
            background: `conic-gradient(from -45deg, ${LUDO_COLOR_VAR.green} 0deg 90deg, ${LUDO_COLOR_VAR.yellow} 90deg 180deg, ${LUDO_COLOR_VAR.blue} 180deg 270deg, ${LUDO_COLOR_VAR.red} 270deg 360deg)`,
          }}
        />
      </div>

      {/* Path cells */}
      {RING_PATH.map((cell) => {
        const cellKey = key(cell);
        return (
          <div
            key={cellKey}
            style={{ ...gridArea(cell.row, cell.col), background: 'var(--bg2)' }}
            className="flex items-center justify-center border border-line/40"
          >
            {SAFE_CELL_KEYS.has(cellKey) && <span className="text-[8px] text-faint">★</span>}
          </div>
        );
      })}

      {/* Home column cells */}
      {ALL_COLORS.map((color) =>
        HOME_COLUMNS[color].map((cell, i) => (
          <div
            key={`${color}-home-${i}`}
            style={{ ...gridArea(cell.row, cell.col), background: LUDO_COLOR_VAR[color] }}
            className="border border-line/40"
          />
        )),
      )}

      {/* Entry direction arrows */}
      {ALL_COLORS.map((color) => {
        const cell = RING_PATH[COLOR_START_OFFSET[color]];
        const { dRow, dCol } = getEntryDirection(color);
        const angle = (Math.atan2(dRow, dCol) * 180) / Math.PI;
        return (
          <div
            key={`arrow-${color}`}
            style={gridArea(cell.row, cell.col)}
            className="pointer-events-none z-10 flex items-center justify-center"
          >
            <span
              style={{ color: LUDO_COLOR_VAR[color], transform: `rotate(${angle}deg)` }}
              className="block text-[10px] leading-none"
            >
              ▶
            </span>
          </div>
        );
      })}

      {/* Yard dot slots (empty pockets) */}
      {ALL_COLORS.map((color) =>
        YARD_SLOTS[color].map((cell, i) => (
          <div
            key={`${color}-slot-${i}`}
            style={gridArea(cell.row, cell.col)}
            className="z-10 flex items-center justify-center"
          >
            <div
              className="size-[55%] rounded-full border-2 opacity-40"
              style={{ borderColor: LUDO_COLOR_VAR[color] }}
            />
          </div>
        )),
      )}

      {/* Tokens */}
      {[...occupantsByCell.entries()].map(([cellKey, occupants]) => {
        const [row, col] = cellKey.split(',').map(Number);
        return (
          <div key={`tokens-${cellKey}`} style={gridArea(row, col)} className="z-20 flex items-center justify-center">
            <div className="relative size-full">
              {occupants.map((o, i) => {
                const offset = occupants.length > 1 ? CLUSTER_OFFSETS[i % 4] : { x: 0, y: 0 };
                const scale = occupants.length > 1 ? 0.62 : 0.85;
                return (
                  <button
                    key={`${o.playerId}-${o.tokenIndex}`}
                    type="button"
                    disabled={!o.isMovable}
                    onClick={() => o.isMovable && onMoveToken(o.tokenIndex)}
                    aria-label={o.isMine ? `Move token ${o.tokenIndex + 1}` : undefined}
                    className={`absolute top-1/2 left-1/2 aspect-square rounded-full border-2 border-bg shadow-sm transition ${
                      o.isMovable
                        ? 'cursor-pointer ring-2 ring-white/80 ring-offset-1 ring-offset-transparent animate-pulse'
                        : 'cursor-default'
                    }`}
                    style={{
                      width: `${scale * 100}%`,
                      background: LUDO_COLOR_VAR[o.color],
                      transform: `translate(-50%, -50%) translate(${offset.x}%, ${offset.y}%)`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
