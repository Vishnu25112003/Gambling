import type { CSSProperties } from 'react';
import { Star } from 'lucide-react';
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

// These richer finishes come from the imported Ludo Royale handoff. Geometry
// still comes exclusively from boardGeometry, so visuals cannot drift from
// the server's game rules.
const YARD_GRADIENT: Record<LudoColor, string> = {
  red: 'linear-gradient(145deg, #f4676c, #c9282f)',
  green: 'linear-gradient(145deg, #4fd07c, #128a3f)',
  yellow: 'linear-gradient(145deg, #ffd95c, #e0a100)',
  blue: 'linear-gradient(145deg, #5fa9f0, #1a5f9e)',
};

const PAWN_GRADIENT: Record<LudoColor, string> = {
  red: 'radial-gradient(circle at 33% 25%, #fff 0 5%, #ff8f92 25%, #e8434b 60%, #a11d24 100%)',
  green: 'radial-gradient(circle at 33% 25%, #fff 0 5%, #84e2a3 25%, #2fb257 60%, #12692f 100%)',
  yellow: 'radial-gradient(circle at 33% 25%, #fff 0 5%, #ffd66b 25%, #e8a900 60%, #7d5400 100%)',
  blue: 'radial-gradient(circle at 33% 25%, #fff 0 5%, #9ccdf7 25%, #4a9ae4 60%, #17518a 100%)',
};

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
      className="relative mx-auto aspect-square w-full max-w-2xl overflow-hidden rounded-[12px] border-[10px] border-[#294dba] bg-[#fbf6e9] shadow-[0_18px_34px_rgba(0,0,0,.5),inset_0_0_0_1px_rgba(255,214,110,.45)]"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        backgroundImage:
          'linear-gradient(to right, rgba(40,45,70,.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(40,45,70,.18) 1px, transparent 1px)',
        backgroundSize: `${100 / BOARD_SIZE}% ${100 / BOARD_SIZE}%`,
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
              background: YARD_GRADIENT[color],
              borderRadius: YARD_ROUNDING[color],
            }}
            className="relative m-0 border border-black/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)]"
          >
            <div className="absolute inset-[20%] rounded-[10px] bg-[#fbf6e9] shadow-[inset_0_0_0_2px_rgba(0,0,0,.16),0_2px_6px_rgba(0,0,0,.22)]" />
          </div>
        );
      })}

      {/* Center pinwheel — one solid block; the ring path's corner cells
          border it rather than passing through it (see boardGeometry.ts). */}
      <div style={gridArea(CENTER_POINT.row - 1, CENTER_POINT.col - 1, 3, 3)}>
        <div
          className="size-full"
          style={{
            background: 'conic-gradient(from -45deg, #128a3f 0deg 90deg, #e0a100 90deg 180deg, #1a5f9e 180deg 270deg, #c9282f 270deg 360deg)',
          }}
        />
      </div>

      {/* Path cells */}
      {RING_PATH.map((cell) => {
        const cellKey = key(cell);
        return (
          <div
            key={cellKey}
            style={{ ...gridArea(cell.row, cell.col), background: '#fbf6e9' }}
            className="flex items-center justify-center border border-slate-700/20"
          >
            {SAFE_CELL_KEYS.has(cellKey) && <Star className="size-[48%] fill-current text-[#b8860b]" />}
          </div>
        );
      })}

      {/* Home column cells */}
      {ALL_COLORS.map((color) =>
        HOME_COLUMNS[color].map((cell, i) => (
          <div
            key={`${color}-home-${i}`}
            style={{ ...gridArea(cell.row, cell.col), background: YARD_GRADIENT[color] }}
            className="border border-black/20"
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
              style={{ color: '#fff', transform: `rotate(${angle}deg)` }}
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
              className="size-[55%] rounded-full border-2 opacity-45"
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
                    className={`absolute top-1/2 left-1/2 aspect-[.78] rounded-[45%_45%_42%_42%] border-2 border-white/80 shadow-[inset_-2px_-3px_4px_rgba(0,0,0,.32),0_2px_3px_rgba(0,0,0,.35)] transition ${
                      o.isMovable
                        ? 'cursor-pointer ring-2 ring-white/80 ring-offset-1 ring-offset-transparent animate-pulse'
                        : 'cursor-default'
                    }`}
                    style={{
                      width: `${scale * 100}%`,
                      background: PAWN_GRADIENT[o.color],
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
