import { useCallback } from 'react';
import { Heart } from 'lucide-react';
import { Card } from '../../components/shared/ui';
import { MineGlyph } from './MineGlyph';
import {
  boardSide,
  CELL_BASE_CLASS,
  CELL_HOVER_CLASS,
  cellGeometryStyle,
  cellPx,
  coordLabel,
  frameStyle,
  gridStyle,
  terrainStyle,
  type BoardSize,
} from './mineCatcherTheme';

type CellState = 'hidden' | 'break' | 'blast';

interface CombatLogEntry {
  id: string;
  attacker: 'me' | 'opponent';
  cellIndex: number;
  hit: boolean;
}

interface MineAttackBoardProps {
  boardSize: BoardSize;
  totalMines: number;
  myId: string;
  currentAttacker: string | null;
  /** The opponent's board cells as revealed to this player. */
  opponentCells: CellState[];
  foundCount: number;
  breakCount: number;
  opponentFoundCount: number;
  opponentBreakCount: number;
  turnTimeLeft: number;
  myLives: number;
  opponentLives: number;
  /** My most recent attack on the opponent's board — drives the blast/smoke reveal. */
  lastAttack: { cellIndex: number; type: 'break' | 'blast' } | null;
  onAttack: (cellIndex: number) => void;
  /** Cells I buried during placement — I placed them, so I always know where. */
  ownMinePositions: number[];
  /** Which of my own cells the opponent has attacked, and what they found. */
  ownReveals: Record<number, 'break' | 'blast'>;
  combatLog: CombatLogEntry[];
}

const accuracy = (found: number, misses: number) => {
  const shots = found + misses;
  return shots ? Math.round((found / shots) * 100) : 0;
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function MineAttackBoard({
  boardSize,
  totalMines,
  myId,
  currentAttacker,
  opponentCells,
  foundCount,
  breakCount,
  opponentFoundCount,
  opponentBreakCount,
  turnTimeLeft,
  myLives,
  opponentLives,
  lastAttack,
  onAttack,
  ownMinePositions,
  ownReveals,
  combatLog,
}: MineAttackBoardProps) {
  const side = boardSide(boardSize);
  const px = cellPx(boardSize);
  const isMyTurn = currentAttacker === myId;
  const lastWasBlast = lastAttack?.type === 'blast';

  const handleCellClick = useCallback((index: number) => {
    if (!isMyTurn) return;
    if (opponentCells[index] !== 'hidden') return;
    onAttack(index);
  }, [isMyTurn, opponentCells, onAttack]);

  const statusText = isMyTurn
    ? lastAttack
      ? `${lastAttack.type === 'blast' ? 'Mine hit' : 'Empty ground'} at ${coordLabel(lastAttack.cellIndex, boardSize)} — pick your next cell`
      : "Your turn — click a cell on the opponent's field"
    : "Waiting for opponent to attack…";

  const miniPx = Math.max(11, Math.round(230 / side) - 3);
  const ownMineSet = new Set(ownMinePositions);

  return (
    <div className="mx-auto w-full max-w-[1120px]" style={{ fontFamily: "'Chakra Petch',Inter,sans-serif" }}>
      {/* Duel bar: my card · turn ring · opponent card */}
      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <PlayerCard
          align="left"
          tone="green"
          active={isMyTurn}
          name="You"
          found={foundCount}
          totalMines={totalMines}
          pipTone="green"
          shotsLabel={plural(foundCount + breakCount, 'shot')}
          acc={accuracy(foundCount, breakCount)}
          lives={myLives}
        />

        <div className="text-center">
          <TurnRing timeLeft={turnTimeLeft} isMyTurn={isMyTurn} />
          <div className={`mt-2.5 font-mono text-[10px] tracking-[.2em] uppercase ${isMyTurn ? 'text-green' : 'text-red'}`}>
            {isMyTurn ? 'Your turn' : "Opponent's turn"}
          </div>
        </div>

        <PlayerCard
          align="right"
          tone="red"
          active={!isMyTurn}
          name="Opponent"
          found={opponentFoundCount}
          totalMines={totalMines}
          pipTone="red"
          shotsLabel={plural(opponentFoundCount + opponentBreakCount, 'shot')}
          acc={accuracy(opponentFoundCount, opponentBreakCount)}
          lives={opponentLives}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_262px]">
        <div>
          {/* Status bar */}
          <div
            className="mb-3 flex items-center justify-between gap-3 rounded-[6px] border bg-[linear-gradient(#0c120d,#080d09)] px-4 py-2.5"
            style={{ borderColor: lastWasBlast ? 'rgba(248,113,113,.45)' : 'rgba(74,222,128,.12)' }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className="size-2 shrink-0 rounded-full"
                style={{ background: lastWasBlast ? 'var(--red)' : 'var(--green)' }}
              />
              <div className="truncate text-[13px] text-text">{statusText}</div>
            </div>
            <div className="font-mono text-[10px] whitespace-nowrap text-muted uppercase">
              Opponent&apos;s field · {side}×{side}
            </div>
          </div>

          {/* Board */}
          <div style={frameStyle(lastWasBlast)}>
            <div style={terrainStyle()}>
              <div style={gridStyle(side, px)}>
                {opponentCells.map((state, i) => {
                  const isLast = lastAttack?.cellIndex === i && state !== 'hidden';
                  const hidden = state === 'hidden';
                  const interactive = isMyTurn && hidden;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!interactive}
                      onClick={() => handleCellClick(i)}
                      style={cellGeometryStyle(px)}
                      className={
                        state === 'blast'
                          ? 'border border-[rgba(248,113,113,.7)] bg-[radial-gradient(circle_at_50%_55%,rgba(248,113,113,.3),rgba(50,10,6,.5))] [box-shadow:inset_0_0_18px_rgba(248,113,113,.28)]'
                          : state === 'break'
                            ? 'border border-[rgba(74,222,128,.07)] bg-[linear-gradient(160deg,rgba(255,255,255,.02),rgba(0,0,0,.34))]'
                            : `${CELL_BASE_CLASS} ${interactive ? CELL_HOVER_CLASS : 'cursor-default'}`
                      }
                    >
                      {state === 'blast' && <MineGlyph hot size="54%" />}
                      {isLast && state === 'blast' && (
                        <>
                          <div
                            className="pointer-events-none absolute -inset-2 rounded-xl border-2"
                            style={{ borderColor: 'rgba(255,150,95,.85)', animation: 'mc-ring .75s ease-out forwards' }}
                          />
                          <div
                            className="pointer-events-none absolute -inset-4 rounded-full"
                            style={{
                              background: 'radial-gradient(circle,rgba(255,240,200,.95),rgba(255,130,45,.5) 45%,transparent 72%)',
                              animation: 'mc-flash .5s ease-out forwards',
                            }}
                          />
                        </>
                      )}
                      {/* Every swept (empty) cell keeps its smoke residue permanently —
                          this is a static layer, not the one-shot billow below, so it
                          never fades out once the attack that revealed it scrolls out
                          of "last attack" status. */}
                      {state === 'break' && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[6px]">
                          <div
                            className="absolute rounded-full"
                            style={{
                              left: '10%',
                              bottom: '5%',
                              width: '80%',
                              height: '26%',
                              background: 'radial-gradient(ellipse,rgba(84,92,86,.55),transparent 72%)',
                              filter: 'blur(2px)',
                            }}
                          />
                          <div
                            className="absolute rounded-full"
                            style={{
                              left: '18%',
                              bottom: '18%',
                              width: '64%',
                              height: '64%',
                              background: 'radial-gradient(circle at 40% 60%,rgba(206,214,208,.32),rgba(206,214,208,0) 68%)',
                              filter: 'blur(3px)',
                            }}
                          />
                          <div
                            className="absolute rounded-full"
                            style={{
                              left: '44%',
                              bottom: '34%',
                              width: '34%',
                              height: '34%',
                              background: 'radial-gradient(circle,rgba(186,196,189,.24),rgba(186,196,189,0) 70%)',
                              filter: 'blur(3px)',
                            }}
                          />
                        </div>
                      )}
                      {/* One-shot billow flourish layered on top, only for the cell that
                          was *just* swept — the persistent smoke above is what stays. */}
                      {isLast && state === 'break' && (
                        <div className="pointer-events-none absolute -inset-1.5 overflow-hidden">
                          <div
                            className="absolute rounded-full"
                            style={{
                              left: '24%',
                              bottom: '12%',
                              width: '56%',
                              height: '56%',
                              background: 'radial-gradient(circle,rgba(236,242,237,.9),rgba(210,218,212,0) 70%)',
                              filter: 'blur(3px)',
                              animation: 'mc-billow 2.4s ease-out forwards',
                            }}
                          />
                          <div
                            className="absolute rounded-full"
                            style={{
                              left: '6%',
                              bottom: '20%',
                              width: '44%',
                              height: '44%',
                              background: 'radial-gradient(circle,rgba(206,214,208,.72),rgba(206,214,208,0) 72%)',
                              filter: 'blur(3px)',
                              animation: 'mc-billow 2.4s ease-out .35s forwards',
                            }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {revealedLastAttack(lastAttack, opponentCells) && (
              <div
                key={lastAttack!.cellIndex}
                className="pointer-events-none absolute inset-0 grid place-items-center"
              >
                <div
                  className="rounded-[6px] px-8 py-[18px] text-center"
                  style={{
                    color: lastAttack!.type === 'blast' ? '#ffcdb8' : '#dfe7e0',
                    background: lastAttack!.type === 'blast' ? 'rgba(60,10,4,.78)' : 'rgba(10,16,12,.78)',
                    border: `1px solid ${lastAttack!.type === 'blast' ? 'rgba(255,140,90,.6)' : 'rgba(190,205,196,.32)'}`,
                    boxShadow: lastAttack!.type === 'blast' ? '0 0 60px rgba(248,113,113,.45)' : '0 0 46px rgba(0,0,0,.6)',
                    animation: 'mc-stamp 1500ms ease-out forwards',
                  }}
                >
                  <div className="text-[26px] leading-none font-bold tracking-[.1em] uppercase">
                    {lastAttack!.type === 'blast' ? 'Mine down' : 'All clear'}
                  </div>
                  <div className="mt-2 font-mono text-[11px] tracking-[.12em] uppercase opacity-80">
                    {coordLabel(lastAttack!.cellIndex, boardSize)}
                    {lastAttack!.type === 'blast' ? ' · +1' : ' · nothing buried'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {/* Your field */}
          <Card className="px-3.5 py-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] tracking-[.2em] text-muted uppercase">Your field</div>
              <div className="font-mono text-[11px] text-red">-{opponentFoundCount}</div>
            </div>
            <div className="flex justify-center">
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${side},${miniPx}px)`, gap: 3 }}>
                {Array.from({ length: boardSize }).map((_, i) => {
                  const revealed = ownReveals[i];
                  const isMine = ownMineSet.has(i);
                  let style: { background: string; border: string };
                  if (revealed === 'blast') style = { background: 'radial-gradient(circle,rgba(248,113,113,.75),rgba(248,113,113,.25))', border: '1px solid rgba(248,113,113,.7)' };
                  else if (revealed === 'break') style = { background: 'rgba(190,205,196,.14)', border: '1px solid rgba(74,222,128,.1)' };
                  else if (isMine) style = { background: 'rgba(248,113,113,.16)', border: '1px solid rgba(248,113,113,.35)' };
                  else style = { background: 'rgba(255,255,255,.015)', border: '1px solid rgba(74,222,128,.1)' };
                  return (
                    <div
                      key={i}
                      className="box-border rounded-[3px]"
                      style={{ width: miniPx, height: miniPx, ...style }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mt-2.5 font-mono text-[9px] leading-relaxed text-faint">
              {opponentFoundCount} of your {totalMines} mines blown
              <br />
              Red = live mine · grey = swept
            </div>
          </Card>

          {/* Combat log */}
          <Card className="px-3.5 py-3.5">
            <div className="mb-2.5 font-mono text-[10px] tracking-[.2em] text-muted uppercase">Combat log</div>
            <div className="flex flex-col gap-1.5">
              {combatLog.length === 0 && (
                <div className="font-mono text-[10px] text-faint">Awaiting first sweep…</div>
              )}
              {combatLog.map((l) => (
                <div
                  key={l.id}
                  className={`flex items-center gap-2 rounded-[3px] px-1.5 py-1 ${l.hit ? 'bg-red/10' : 'bg-white/[.015]'}`}
                >
                  <div
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: l.attacker === 'me' ? 'var(--green)' : 'var(--red)' }}
                  />
                  <div className="flex-1 truncate font-mono text-[10px] text-muted">
                    {l.attacker === 'me' ? 'You' : 'Opponent'} {l.hit ? 'hit' : 'swept'}
                  </div>
                  <div className="font-mono text-[11px] font-bold">{coordLabel(l.cellIndex, boardSize)}</div>
                  <div className={`w-[34px] text-right font-mono text-[9px] font-bold tracking-[.1em] ${l.hit ? 'text-red' : 'text-muted'}`}>
                    {l.hit ? 'MINE' : 'clear'}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function revealedLastAttack(lastAttack: { cellIndex: number; type: 'break' | 'blast' } | null, opponentCells: CellState[]) {
  return !!lastAttack && opponentCells[lastAttack.cellIndex] !== 'hidden';
}

/** Turn clock — matches ATTACK_TIMEOUT_MS on the server (backend/src/games/mine-catcher/engine.ts). */
const TURN_SECONDS = 15;

function TurnRing({ timeLeft, isMyTurn }: { timeLeft: number; isMyTurn: boolean }) {
  const low = timeLeft <= 5;
  const color = low ? 'var(--red)' : isMyTurn ? 'var(--green)' : 'var(--red)';
  return (
    <div
      className="relative mx-auto size-[84px] rounded-full"
      style={{
        background: `conic-gradient(${color} ${(timeLeft / TURN_SECONDS) * 360}deg, rgba(255,255,255,.06) 0deg)`,
        boxShadow: `0 0 26px ${low ? 'rgba(248,113,113,.35)' : 'rgba(74,222,128,.18)'}`,
      }}
    >
      <div className="absolute inset-[5px] grid place-items-center rounded-full bg-[#080d09]">
        <div className="font-mono text-[23px] leading-none font-extrabold">{timeLeft}</div>
      </div>
    </div>
  );
}

function PlayerCard({
  align,
  tone,
  active,
  name,
  found,
  totalMines,
  pipTone,
  shotsLabel,
  acc,
  lives,
}: {
  align: 'left' | 'right';
  tone: 'green' | 'red';
  active: boolean;
  name: string;
  found: number;
  totalMines: number;
  pipTone: 'green' | 'red';
  shotsLabel: string;
  acc: number;
  lives: number;
}) {
  const right = align === 'right';
  return (
    <div
      className="rounded-[6px] border bg-[linear-gradient(#0c120d,#080d09)] px-4 py-3.5 transition-opacity"
      style={{
        borderColor: active ? (tone === 'green' ? 'rgba(74,222,128,.4)' : 'rgba(248,113,113,.45)') : 'rgba(74,222,128,.1)',
        opacity: active ? 1 : 0.55,
      }}
    >
      <div className={`flex items-center gap-2 ${right ? 'justify-end' : ''}`}>
        {!right && <div className={`size-2 rounded-sm ${tone === 'green' ? 'bg-green-solid' : 'bg-red'}`} />}
        <div className="font-mono text-[10px] tracking-[.22em] text-muted uppercase">{name}</div>
        {right && <div className={`size-2 rounded-sm ${tone === 'green' ? 'bg-green-solid' : 'bg-red'}`} />}
      </div>
      <div className={`mt-1.5 flex items-end gap-2 ${right ? 'justify-end' : ''}`}>
        {right && <div className="pb-1 font-mono text-[13px] text-faint">/{totalMines} mines</div>}
        <div className={`font-mono text-[36px] leading-none font-extrabold ${tone === 'green' ? 'text-green' : 'text-red'}`}>
          {found}
        </div>
        {!right && <div className="pb-1 font-mono text-[13px] text-faint">/{totalMines} mines</div>}
      </div>
      <div className={`mt-2.5 flex gap-[3px] ${right ? 'justify-end' : ''}`}>
        {Array.from({ length: totalMines }).map((_, i) => (
          <div
            key={i}
            className="h-[13px] w-[7px] rounded-sm"
            style={
              i < found
                ? { background: `var(--${pipTone})`, boxShadow: `0 0 8px var(--${pipTone})` }
                : { background: 'rgba(255,255,255,.07)' }
            }
          />
        ))}
      </div>
      <div className={`mt-2 flex items-center gap-2 font-mono text-[10px] text-muted ${right ? 'justify-end' : ''}`}>
        {shotsLabel} · {acc}% acc
      </div>
      <div className={`mt-1.5 flex gap-1 ${right ? 'justify-end' : ''}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Heart key={i} className={`size-3.5 fill-red text-red ${i < lives ? '' : 'opacity-20'}`} />
        ))}
      </div>
    </div>
  );
}
