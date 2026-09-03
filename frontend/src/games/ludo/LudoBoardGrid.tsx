import { Star } from 'lucide-react';
import {
  CENTER_POINT,
  COLOR_START_OFFSET,
  HOME_COLUMNS,
  HOME_COLUMN_LENGTH,
  NATIVE_SLOT,
  RING_PATH,
  YARD_ORIGIN,
  YARD_SLOTS,
  getCellForToken,
  pct,
  rotateBoxForViewer,
  rotateForViewer,
  type BoardToken,
  type Cell,
  type LudoColor,
} from './boardGeometry';

/**
 * Classic 15x15 Ludo board, positioned entirely with board-relative
 * percentages (1 cell = 100/15%) rather than CSS grid — this reproduces the
 * Ludo Royale design handoff (`Ludo Board.dc.html`) layer-for-layer: home
 * bases, yard nests + foot-rest sockets, striped home lanes, start-cell
 * arrows, safe stars, the center pinwheel, per-color score plates, and
 * layered (glow/shadow/body/head) pawns. Geometry itself still comes
 * exclusively from boardGeometry, so visuals cannot drift from the server's
 * game rules.
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
  /** 0-3 — rotates the whole board so the viewer's own color renders bottom-left. */
  viewerRotation: number;
}

const ALL_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
const ORDER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

const key = (c: Cell) => `${c.row},${c.col}`;

// One non-start safe square per arm (SAFE_SQUARES minus the 4 start cells),
// colored by the *next* color around the ring — mirrors the design exactly.
const SAFE_STAR_HEX: Record<LudoColor, string> = {
  red: '#c9282f',
  green: '#128a3f',
  yellow: '#c99400',
  blue: '#1a5f9e',
};

const YARD_GRADIENT: Record<LudoColor, string> = {
  red: 'linear-gradient(145deg, #f4676c, #c9282f)',
  green: 'linear-gradient(145deg, #4fd07c, #128a3f)',
  yellow: 'linear-gradient(145deg, #ffd95c, #e0a100)',
  blue: 'linear-gradient(145deg, #5fa9f0, #1a5f9e)',
};

const HOME_STRIPE_HEX: Record<LudoColor, string> = {
  red: '#e8494f',
  green: '#2fb257',
  yellow: '#f2b301',
  blue: '#3b8fdd',
};

const NEST_RING: Record<LudoColor, string> = {
  red: 'rgba(160,30,36,.4)',
  green: 'rgba(18,110,50,.4)',
  yellow: 'rgba(181,126,0,.45)',
  blue: 'rgba(26,85,143,.4)',
};

const SOCKET_RING: Record<LudoColor, string> = {
  red: 'rgba(160,30,36,.42)',
  green: 'rgba(18,110,50,.42)',
  yellow: 'rgba(160,110,0,.45)',
  blue: 'rgba(26,85,143,.42)',
};

/**
 * Fixed board-margin plate position, keyed by native screen SLOT
 * (0=TL,1=TR,2=BR,3=BL) rather than color, so it rotates with the viewer —
 * these are hand-tuned literals with no cell to derive them from.
 */
const MEDAL_POS_BY_SLOT: Record<number, { left: string; top: string }> = {
  0: { left: '8%', top: '33.4%' }, // was red (TL)
  1: { left: '68%', top: '33.4%' }, // was green (TR)
  2: { left: '68%', top: '60.6%' }, // was yellow (BR)
  3: { left: '8%', top: '60.6%' }, // was blue (BL)
};

const PAWN_SHADE: Record<LudoColor, { light: string; mid: string; dark: string }> = {
  red: { light: '#ff8f92', mid: '#e8434b', dark: '#a11d24' },
  green: { light: '#84e2a3', mid: '#2fb257', dark: '#12692f' },
  yellow: { light: '#ffd66b', mid: '#e8a900', dark: '#7d5400' },
  blue: { light: '#9ccdf7', mid: '#4a9ae4', dark: '#17518a' },
};

const START_GLYPH: Record<LudoColor, { char: string; fg: string }> = {
  red: { char: '▸', fg: '#fff' },
  green: { char: '▾', fg: '#fff' },
  yellow: { char: '◂', fg: '#6b4c00' },
  blue: { char: '▴', fg: '#fff' },
};

/** Bounding rect (as board percentages) of a color's 5-cell striped home lane — everything but the final, hub-adjacent cell. */
function homeLaneRect(color: LudoColor, k: number) {
  const cells = HOME_COLUMNS[color].slice(0, HOME_COLUMN_LENGTH - 1).map((c) => rotateForViewer(c, k));
  const rows = cells.map((c) => c.row);
  const cols = cells.map((c) => c.col);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);
  const horizontal = new Set(rows).size === 1;
  return {
    left: pct(minCol),
    top: pct(minRow),
    width: horizontal ? pct(cells.length) : pct(1),
    height: horizontal ? pct(1) : pct(cells.length),
    horizontal,
  };
}

interface TokenOccupant {
  playerId: string;
  color: LudoColor;
  tokenIndex: number;
  isMine: boolean;
  isMovable: boolean;
  isYard: boolean;
}

/** Same clustering breakpoints as the design's `cluster(n)`: offsets are fractions of one board cell. */
function cluster(n: number): { off: [number, number][]; size: number } {
  if (n <= 1) return { off: [[0, 0]], size: 74 };
  if (n === 2) return { off: [[-0.19, 0.05], [0.19, -0.05]], size: 56 };
  if (n === 3) return { off: [[-0.22, 0.08], [0, -0.1], [0.22, 0.08]], size: 48 };
  if (n === 4)
    return {
      off: [
        [-0.19, -0.09],
        [0.19, -0.09],
        [-0.19, 0.13],
        [0.19, 0.13],
      ],
      size: 44,
    };
  const off: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    off.push([Math.cos(a) * 0.2, Math.sin(a) * 0.16]);
  }
  return { off, size: 38 };
}

export function LudoBoardGrid({ players, tokens, myId, validMoves, onMoveToken, viewerRotation }: LudoBoardGridProps) {
  const k = viewerRotation;
  const movableIndexes = new Set(validMoves.map((m) => m.tokenIndex));
  const playerByColor = new Map(players.map((p) => [p.color, p]));

  // Group every player's tokens by the cell they currently occupy.
  const occupantsByCell = new Map<string, { cell: Cell; occupants: TokenOccupant[] }>();
  for (const player of players) {
    const playerTokens = tokens[player.id] ?? [];
    playerTokens.forEach((token, tokenIndex) => {
      const cell = rotateForViewer(getCellForToken(player.color, token, tokenIndex), k);
      const cellKey = key(cell);
      const occupant: TokenOccupant = {
        playerId: player.id,
        color: player.color,
        tokenIndex,
        isMine: player.id === myId,
        isMovable: player.id === myId && movableIndexes.has(tokenIndex),
        isYard: token.zone === 'yard',
      };
      const entry = occupantsByCell.get(cellKey) ?? { cell, occupants: [] };
      entry.occupants.push(occupant);
      occupantsByCell.set(cellKey, entry);
    });
  }

  // Board-completion percent per color, for the score plates.
  const scoreByColor: Partial<Record<LudoColor, number>> = {};
  for (const player of players) {
    const playerTokens = tokens[player.id] ?? [];
    const prog = playerTokens.reduce((sum, t) => {
      if (t.zone === 'yard') return sum;
      if (t.zone === 'track') return sum + (t.position + 1);
      return sum + 51 + t.homePosition;
    }, 0);
    scoreByColor[player.color] = Math.round((prog / (4 * 57)) * 100);
  }

  return (
    <div
      className="w-full rounded-2xl p-2.5"
      style={{
        background: 'linear-gradient(150deg,#3f6bd8,#17307a 45%,#0c1c4d)',
        boxShadow:
          '0 18px 34px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.28), inset 0 0 0 1.5px rgba(255,214,110,.35)',
      }}
    >
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg bg-[#fbf6e9]"
        style={{
          containerType: 'inline-size',
          boxShadow: 'inset 0 0 0 2px rgba(10,20,50,.45), inset 0 0 30px rgba(120,90,40,.12)',
        }}
      >
        {/* Grid line overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(40,45,70,.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(40,45,70,.18) 1px, transparent 1px)',
            backgroundSize: `${pct(1)} ${pct(1)}`,
          }}
        />

        {/* Home bases */}
        {ALL_COLORS.map((color) => {
          const box = rotateBoxForViewer(YARD_ORIGIN[color], 6, 6, k);
          return (
            <div
              key={color}
              className="absolute"
              style={{
                left: pct(box.origin.col),
                top: pct(box.origin.row),
                width: pct(box.w),
                height: pct(box.h),
                background: YARD_GRADIENT[color],
                boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.16)',
              }}
            />
          );
        })}

        {/* Yard nests */}
        {ALL_COLORS.map((color) => {
          const o = YARD_ORIGIN[color];
          const box = rotateBoxForViewer({ row: o.row + 1.2, col: o.col + 1.2 }, 3.6, 3.6, k);
          return (
            <div
              key={`nest-${color}`}
              className="absolute rounded-[2.6cqi]"
              style={{
                left: pct(box.origin.col),
                top: pct(box.origin.row),
                width: pct(box.w),
                height: pct(box.h),
                background: '#fbf6e9',
                boxShadow: `inset 0 0 0 1.5px ${NEST_RING[color]}, 0 2px 6px rgba(0,0,0,.22)`,
              }}
            />
          );
        })}

        {/* Yard foot-rest sockets */}
        {ALL_COLORS.map((color) =>
          YARD_SLOTS[color].map((slot, i) => {
            const cell = rotateForViewer(slot, k);
            return (
              <div
                key={`socket-${color}-${i}`}
                className="absolute"
                style={{ left: pct(cell.col), top: pct(cell.row), width: pct(1), height: pct(1) }}
              >
                <div
                  className="absolute rounded-full"
                  style={{
                    left: '17%',
                    right: '17%',
                    bottom: '5%',
                    height: '19%',
                    boxShadow: `inset 0 0 0 1.5px ${SOCKET_RING[color]}`,
                  }}
                />
              </div>
            );
          }),
        )}

        {/* Home lanes (striped) */}
        {ALL_COLORS.map((color) => {
          const r = homeLaneRect(color, k);
          const stripe = HOME_STRIPE_HEX[color];
          return (
            <div
              key={`lane-${color}`}
              className="absolute"
              style={{
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.22)',
                background: r.horizontal
                  ? `repeating-linear-gradient(to right, ${stripe} 0, ${stripe} calc(20% - 1px), rgba(0,0,0,.2) calc(20% - 1px), rgba(0,0,0,.2) 20%)`
                  : `repeating-linear-gradient(to bottom, ${stripe} 0, ${stripe} calc(20% - 1px), rgba(0,0,0,.2) calc(20% - 1px), rgba(0,0,0,.2) 20%)`,
              }}
            />
          );
        })}

        {/* Start cells */}
        {ALL_COLORS.map((color) => {
          const cell = rotateForViewer(RING_PATH[COLOR_START_OFFSET[color]], k);
          const glyph = START_GLYPH[color];
          return (
            <div
              key={`start-${color}`}
              className="absolute flex items-center justify-center"
              style={{
                left: pct(cell.col),
                top: pct(cell.row),
                width: pct(1),
                height: pct(1),
                background: YARD_GRADIENT[color],
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.28)',
              }}
            >
              <span style={{ color: glyph.fg, fontSize: '2.2cqi', transform: `rotate(${k * 90}deg)`, display: 'inline-block' }}>
                {glyph.char}
              </span>
            </div>
          );
        })}

        {/* Safe stars (one per arm, colored by the next color around the ring) */}
        {ORDER.map((color, i) => {
          const idx = (COLOR_START_OFFSET[color] + 8) % RING_PATH.length;
          const cell = rotateForViewer(RING_PATH[idx], k);
          const starColor = SAFE_STAR_HEX[ORDER[(i + 1) % 4]];
          return (
            <div
              key={`safe-${color}`}
              className="absolute flex items-center justify-center"
              style={{
                left: pct(cell.col),
                top: pct(cell.row),
                width: pct(1),
                height: pct(1),
                color: starColor,
                animation: `floatStar 3s ease-in-out ${i * 0.6}s infinite`,
              }}
            >
              <Star className="size-[55%] fill-current" />
            </div>
          );
        })}

        {/* Center pinwheel — rotates as one rigid unit; CENTER_POINT maps onto itself */}
        <div
          className="absolute"
          style={{
            left: pct(CENTER_POINT.col - 1),
            top: pct(CENTER_POINT.row - 1),
            width: pct(3),
            height: pct(3),
            boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.25), 0 0 18px rgba(0,0,0,.1)',
            transform: `rotate(${k * 90}deg)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(90deg,#c9282f,#f4676c)', clipPath: 'polygon(0 0,50% 50%,0 100%)' }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg,#4fd07c,#128a3f)', clipPath: 'polygon(0 0,100% 0,50% 50%)' }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(270deg,#e0a100,#ffd95c)',
              clipPath: 'polygon(100% 0,100% 100%,50% 50%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(0deg,#1a5f9e,#5fa9f0)',
              clipPath: 'polygon(0 100%,100% 100%,50% 50%)',
            }}
          />
        </div>

        {/* Score plates — only for colors actually in this match */}
        {ALL_COLORS.filter((c) => playerByColor.has(c)).map((color) => {
          const player = playerByColor.get(color)!;
          const isMe = player.id === myId;
          const slot = (NATIVE_SLOT[color] + k) % 4;
          const pos = MEDAL_POS_BY_SLOT[slot];
          const sh = PAWN_SHADE[color];
          return (
            <div
              key={`plate-${color}`}
              className="absolute z-[9] flex items-center justify-center gap-[5%] rounded-full"
              style={{
                left: pos.left,
                top: pos.top,
                width: '24%',
                height: '6%',
                background: isMe ? 'linear-gradient(180deg,#fffef7,#f6ead0)' : 'rgba(255,255,255,.9)',
                boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.55), 0 1px 3px rgba(0,0,0,.3)',
              }}
            >
              <div
                className="shrink-0 rounded-full"
                style={{
                  width: '2.4cqi',
                  height: '2.4cqi',
                  background: `radial-gradient(circle at 32% 28%, #ffffffcc, ${sh.mid} 65%)`,
                }}
              />
              <div
                className="font-serif leading-none"
                style={{ fontSize: 'max(11px,3cqi)', color: isMe ? sh.dark : '#5c5245' }}
              >
                {scoreByColor[color] ?? 0}%
              </div>
            </div>
          );
        })}

        {/* Tokens */}
        {[...occupantsByCell.entries()].map(([cellKey, { cell, occupants }]) => {
          const total = occupants.length;
          const cl = cluster(total);
          return (
            <div
              key={`tokens-${cellKey}`}
              className="absolute"
              style={{ left: pct(cell.col), top: pct(cell.row), width: pct(1), height: pct(1) }}
            >
              {occupants.map((o, i) => {
                const off = cl.off[i] ?? [0, 0];
                const sizePct = o.isYard ? 64 : cl.size;
                const lift = total > 1 ? '2%' : '6%';
                const sh = PAWN_SHADE[o.color];
                const glow = o.isMovable ? '#ffffff' : 'transparent';
                const z = 20 + Math.round((cell.row + off[1]) * 4);
                return (
                  <button
                    key={`${o.playerId}-${o.tokenIndex}`}
                    type="button"
                    aria-label={o.isMine ? `Move token ${o.tokenIndex + 1}` : undefined}
                    disabled={!o.isMovable}
                    onClick={() => o.isMovable && onMoveToken(o.tokenIndex)}
                    className="absolute border-none bg-transparent p-0"
                    style={{
                      left: `${50 + off[0] * 100}%`,
                      top: `${50 + off[1] * 100}%`,
                      width: `${sizePct}%`,
                      aspectRatio: 0.78,
                      transform: 'translate(-50%,-50%)',
                      marginBottom: lift,
                      zIndex: z,
                      cursor: o.isMovable ? 'pointer' : 'default',
                    }}
                  >
                    <div className="relative size-full">
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: '-10%',
                          right: '-10%',
                          bottom: '-8%',
                          height: '34%',
                          boxShadow: `0 0 0 2.5px ${glow}`,
                          animation: 'pulseRing 1.1s ease-in-out infinite',
                          opacity: o.isMovable ? 1 : 0,
                        }}
                      />
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: 0,
                          right: '-6%',
                          bottom: 0,
                          height: '20%',
                          background: 'rgba(0,0,0,.28)',
                          filter: 'blur(2px)',
                        }}
                      />
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: '1%',
                          right: '1%',
                          bottom: '1%',
                          height: '20%',
                          background: `linear-gradient(180deg,${sh.light},${sh.dark})`,
                          boxShadow: 'inset 0 -2px 3px rgba(0,0,0,.3), inset 0 2px 2px rgba(255,255,255,.35)',
                        }}
                      />
                      <div
                        className="absolute rounded-[8%_8%_40%_40%]"
                        style={{
                          left: '15%',
                          right: '15%',
                          bottom: '9%',
                          height: '26%',
                          background: `linear-gradient(90deg,${sh.dark} 0%,${sh.light} 38%,${sh.mid} 72%,${sh.dark})`,
                          clipPath: 'polygon(28% 0,72% 0,100% 100%,0 100%)',
                        }}
                      />
                      <div
                        className="absolute aspect-square rounded-full"
                        style={{
                          left: '14%',
                          right: '14%',
                          top: 0,
                          background: `radial-gradient(circle at 33% 27%, rgba(255,255,255,.95) 0 6%, ${sh.light} 32%, ${sh.mid} 62%, ${sh.dark} 95%)`,
                          boxShadow: 'inset -1.5px -2.5px 4px rgba(0,0,0,.3), 0 1px 2px rgba(0,0,0,.28)',
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
