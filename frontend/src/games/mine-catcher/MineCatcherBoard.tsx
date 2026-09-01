import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../hooks/useAuth';
import { tokenStore } from '../../api/client';
import { Button, Card, PageTitle, Spinner } from '../../components/shared/ui';
import { GameShell } from '../../components/shared/GameShell';
import { GameSetupWizard, GameJoinByCode, GameWaitingRoom } from '../../components/shared/gameSetup';
import { formatSol } from '../../lib/format';
import { mineCatcherSetupConfig } from './mineCatcherSetupConfig';
import { MinePlacementBoard } from './MinePlacementBoard';
import { MineAttackBoard } from './MineAttackBoard';
import { MineCatcherResult } from './MineCatcherResult';

/**
 * Mirror of backend MC_EVENTS — keep in sync with backend/src/games/mine-catcher/types.ts
 */
const MC = {
  CREATE_MATCH: 'mc:create',
  JOIN_MATCH: 'mc:join',
  LIST_MATCHES: 'mc:list',
  PLACE_MINES: 'mc:place',
  READY_UP: 'mc:ready',
  ATTACK_CELL: 'mc:attack',
  REMATCH_REQUEST: 'mc:rematch:request',
  MATCH_STATE: 'mc:state',
  MATCH_CREATED: 'mc:created',
  MATCHES_LIST: 'mc:matches',
  PLACEMENT_STARTED: 'mc:placement:started',
  MINES_PLACED: 'mc:mines:placed',
  PLAYER_READY: 'mc:player:ready',
  ATTACK_STARTED: 'mc:attack:started',
  ATTACK_RESULT: 'mc:attack:result',
  TURN_START: 'mc:turn:start',
  MATCH_RESULT: 'mc:match:result',
  LIVES_UPDATE: 'mc:lives:update',
  TIMER_TICK: 'mc:timer:tick',
  OPPONENT_DISCONNECTED: 'mc:opponent:disconnect',
  OPPONENT_RECONNECTED: 'mc:opponent:reconnect',
  ERROR: 'mc:error',
} as const;

const BASE = import.meta.env.VITE_API_URL || '';

type Page =
  | 'lobby'
  | 'create'
  | 'waiting'
  | 'waiting_friends'
  | 'join_code'
  | 'placement'
  | 'attacking'
  | 'match_result'
  | 'error';

type CellState = 'hidden' | 'break' | 'blast';
type DiscoveryMode = 'random' | 'friends';
type BoardSize = 25 | 49 | 81 | 100;

interface ListedMatch {
  matchId: string;
  hostName: string;
  stake: string;
  boardSize: number;
  betMode: string;
  minBet: string | null;
}

interface PlayerInfo {
  id: string;
  displayName?: string;
}

interface MatchResult {
  winnerId: string | null;
  foundCounts: Record<string, number>;
  breakCounts: Record<string, number>;
  lives: Record<string, number>;
  endCause: string | null;
  pot: string | null;
  feeCollected: string | null;
  payouts: { userId: string; payout: string }[];
}

export function MineCatcherBoard() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [page, setPage] = useState<Page>('lobby');
  const [error, setError] = useState<string>('');
  const [listedMatches, setListedMatches] = useState<ListedMatch[]>([]);

  // Match state
  const [matchId, setMatchId] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [boardSize, setBoardSize] = useState<BoardSize>(25);
  const [stake, setStake] = useState<number>(0);
  // Display-only, set from GameSetupWizard's onPublish — the waiting-room
  // summary text is the only thing that needs it.
  const [betMode, setBetMode] = useState<'fixed' | 'free'>('fixed');

  // Placement state
  const [placementTimeLeft, setPlacementTimeLeft] = useState(30);
  const [myReady, setMyReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  // Attack state
  const [opponentCells, setOpponentCells] = useState<CellState[]>([]);
  const [currentAttacker, setCurrentAttacker] = useState<string | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState(15);
  const [myFoundCount, setMyFoundCount] = useState(0);
  const [opponentFoundCount, setOpponentFoundCount] = useState(0);
  const [myBreakCount, setMyBreakCount] = useState(0);
  const [myLives, setMyLives] = useState(3);
  const [opponentLives, setOpponentLives] = useState(3);
  const [lastAttack, setLastAttack] = useState<{ cellIndex: number; type: 'break' | 'blast' } | null>(null);

  // Result state
  const [result, setResult] = useState<MatchResult | null>(null);
  const [rematchAvailable, setRematchAvailable] = useState(false);

  const myId = user?.id ?? '';
  const opponentId = players.find((p) => p.id !== myId)?.id ?? '';

  // Mirrored into refs so the socket-connection effect below (which must
  // stay mounted for the lifetime of a match — see its dependency array)
  // can read current values without tearing the socket down and
  // reconnecting mid-match every time a match/player update changes them.
  const opponentIdRef = useRef(opponentId);
  useEffect(() => {
    opponentIdRef.current = opponentId;
  }, [opponentId]);

  const boardSizeRef = useRef(boardSize);
  useEffect(() => {
    boardSizeRef.current = boardSize;
  }, [boardSize]);

  // Socket connection
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;

    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit(MC.LIST_MATCHES);
    });

    socket.on(MC.MATCHES_LIST, (data: { matches: ListedMatch[] }) => {
      setListedMatches(data.matches);
    });

    socket.on(MC.MATCH_CREATED, (data: { matchId: string; roomCode?: string }) => {
      setMatchId(data.matchId);
      if (data.roomCode) {
        setRoomCode(data.roomCode);
        setPage('waiting_friends');
      } else {
        setPage('waiting');
      }
    });

    socket.on(MC.MATCH_STATE, (data: {
      matchId?: string;
      players?: PlayerInfo[];
      boardSize?: number;
      stake?: number;
      state?: {
        phase: string;
        currentAttacker: string | null;
        boards: Record<string, { mines: number[]; revealed: CellState[]; foundCount: number }>;
        foundCounts: Record<string, number>;
        breakCounts: Record<string, number>;
        lives: Record<string, number>;
        turnStartedAt: number | null;
        readyPlayers: string[];
      };
      message?: string;
    }) => {
      if (data.matchId) setMatchId(data.matchId);
      if (data.players) setPlayers(data.players);
      if (data.boardSize) setBoardSize(data.boardSize as BoardSize);
      if (data.stake) setStake(data.stake);

      if (data.state) {
        const myBoard = data.state.boards[myId];
        if (myBoard) {
          setMyFoundCount(data.state.foundCounts[myId] ?? 0);
          setMyBreakCount(data.state.breakCounts[myId] ?? 0);
        }
        const oppId = opponentIdRef.current;
        const oppBoard = data.state.boards[oppId];
        if (oppBoard) {
          // opponentCells is "the opponent's board as revealed to me" — it
          // must come from the opponent's board, not my own.
          setOpponentCells(oppBoard.revealed);
          setOpponentFoundCount(data.state.foundCounts[oppId] ?? 0);
        }
        setMyLives(data.state.lives[myId] ?? 3);
        setOpponentLives(data.state.lives[oppId] ?? 3);
        setCurrentAttacker(data.state.currentAttacker);
        setMyReady(data.state.readyPlayers.includes(myId));
        setOpponentReady(data.state.readyPlayers.includes(oppId));

        if (data.state.phase === 'attacking') {
          setPage('attacking');
          if (data.state.turnStartedAt) {
            const elapsed = Math.floor((Date.now() - data.state.turnStartedAt) / 1000);
            setTurnTimeLeft(Math.max(0, 15 - elapsed));
          }
        } else if (data.state.phase === 'placement') {
          setPage('placement');
        }
      }
    });

    socket.on(MC.PLACEMENT_STARTED, (data: {
      boardSize: number;
      totalMines: number;
      placementTimeout: number;
      placementStartedAt: number;
    }) => {
      setPage('placement');
      setBoardSize(data.boardSize as BoardSize);
      const elapsed = Math.floor((Date.now() - data.placementStartedAt) / 1000);
      setPlacementTimeLeft(Math.max(0, Math.floor(data.placementTimeout / 1000) - elapsed));
    });

    socket.on(MC.MINES_PLACED, (_data: { userId: string; mineCount: number }) => {
      // Could show opponent's placement progress here
    });

    socket.on(MC.PLAYER_READY, (data: { userId: string }) => {
      if (data.userId === myId) {
        setMyReady(true);
      } else {
        setOpponentReady(true);
      }
    });

    socket.on(MC.ATTACK_STARTED, (data: {
      currentAttacker: string;
      turnStartedAt: number;
    }) => {
      setPage('attacking');
      setCurrentAttacker(data.currentAttacker);
      const elapsed = Math.floor((Date.now() - data.turnStartedAt) / 1000);
      setTurnTimeLeft(Math.max(0, 15 - elapsed));
      setLastAttack(null);

      // Initialize opponent cells as all hidden if not already set
      setOpponentCells((prev) => {
        if (prev.length === 0) {
          const size = boardSizeRef.current;
          const dims = size === 25 ? 25 : size === 49 ? 49 : size === 81 ? 81 : 100;
          return Array.from({ length: dims }, () => 'hidden' as CellState);
        }
        return prev;
      });
    });

    socket.on(MC.ATTACK_RESULT, (data: {
      attackerId: string;
      cellIndex: number;
      result: 'break' | 'blast';
      foundCounts: Record<string, number>;
      breakCounts: Record<string, number>;
    }) => {
      if (data.attackerId === myId) {
        // I attacked — update opponent's board as I see it
        setOpponentCells((prev) => {
          const next = [...prev];
          next[data.cellIndex] = data.result;
          return next;
        });
        setMyFoundCount(data.foundCounts[myId] ?? 0);
        setMyBreakCount(data.breakCounts[myId] ?? 0);
      } else {
        // Opponent attacked me — no update to opponentCells (my board is hidden from me)
        setOpponentFoundCount(data.foundCounts[opponentIdRef.current] ?? 0);
      }
      setLastAttack({ cellIndex: data.cellIndex, type: data.result });
    });

    socket.on(MC.TURN_START, (data: {
      currentAttacker: string;
      turnStartedAt: number;
    }) => {
      setCurrentAttacker(data.currentAttacker);
      const elapsed = Math.floor((Date.now() - data.turnStartedAt) / 1000);
      setTurnTimeLeft(Math.max(0, 15 - elapsed));
    });

    socket.on(MC.MATCH_RESULT, (data: MatchResult & { matchId?: string }) => {
      setResult(data);
      setPage('match_result');
      setRematchAvailable(
        data.winnerId !== null &&
        data.endCause !== 'dual_unreachable' &&
        data.endCause !== 'lives_forfeit',
      );
      clearTimer();
    });

    socket.on(MC.LIVES_UPDATE, (data: { userId: string; lives: number }) => {
      if (data.userId === myId) {
        setMyLives(data.lives);
      } else {
        setOpponentLives(data.lives);
      }
    });

    socket.on(MC.OPPONENT_DISCONNECTED, (_data: { userId: string }) => {
      // Could show a banner
    });

    socket.on(MC.OPPONENT_RECONNECTED, (_data: { userId: string }) => {
      // Could hide the disconnect banner
    });

    socket.on(MC.ERROR, (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(''), 3000);
    });

    socket.on('disconnect', () => {
      // Could show reconnection state
    });

    return () => {
      clearTimer();
      socket.disconnect();
    };
    // Deliberately excludes opponentId/boardSize: those are server-pushed
    // match state that changes right as a match starts, and including them
    // here tore the socket down and reconnected both players mid-join (see
    // opponentIdRef/boardSizeRef above for how handlers stay current instead).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // Timer for placement and turn countdowns
  useEffect(() => {
    if (page === 'placement' && !myReady) {
      timerRef.current = setInterval(() => {
        setPlacementTimeLeft((prev) => {
          if (prev <= 1) {
            clearTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (page === 'attacking' && currentAttacker === myId) {
      timerRef.current = setInterval(() => {
        setTurnTimeLeft((prev) => {
          if (prev <= 1) {
            clearTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearTimer();
    }

    return () => clearTimer();
  }, [page, myReady, currentAttacker, myId]);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const handleCreate = useCallback((settings: {
    discovery: DiscoveryMode;
    boardSize: string | number;
    betMode: 'fixed' | 'free';
    stake: number;
    minBet: number | null;
  }) => {
    const boardSize = Number(settings.boardSize) as BoardSize;
    setBoardSize(boardSize);
    setStake(settings.stake);
    setBetMode(settings.betMode);
    socketRef.current?.emit(MC.CREATE_MATCH, {
      boardSize,
      betMode: settings.betMode,
      stake: settings.stake,
      discovery: settings.discovery,
      minBet: settings.minBet ?? undefined,
    });
  }, []);

  const handleJoin = useCallback((matchId: string) => {
    socketRef.current?.emit(MC.JOIN_MATCH, { matchId });
  }, []);

  const handlePlace = useCallback((cells: number[]) => {
    socketRef.current?.emit(MC.PLACE_MINES, { cells });
  }, []);

  const handleReady = useCallback(() => {
    socketRef.current?.emit(MC.READY_UP);
  }, []);

  const handleAttack = useCallback((cellIndex: number) => {
    socketRef.current?.emit(MC.ATTACK_CELL, { cellIndex });
  }, []);

  const handleRematch = useCallback(() => {
    socketRef.current?.emit(MC.REMATCH_REQUEST, { matchId });
  }, [matchId]);

  const handleBackToGames = useCallback(() => {
    window.location.href = '/dashboard/games';
  }, []);

  const handleRefresh = useCallback(() => {
    socketRef.current?.emit(MC.LIST_MATCHES);
  }, []);

  // --- Render ---

  if (page === 'lobby') {
    return (
      <GameShell title="Mine Catcher">
        <PageTitle title="Mine Catcher" subtitle="1v1 mine-hiding race" />
        {error && (
          <div className="mx-auto mb-4 max-w-sm rounded-[10px] border border-red/30 bg-red/10 px-4 py-2 text-center text-xs text-red">
            {error}
          </div>
        )}

        <div className="mx-auto max-w-sm space-y-4">
          <Button variant="primary" size="lg" className="w-full" onClick={() => setPage('create')}>
            Create Match
          </Button>

          <Button variant="ghost" size="sm" className="w-full" onClick={() => setPage('join_code')}>
            Join by Room Code
          </Button>

          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted">Random Play</p>
            <button
              type="button"
              onClick={handleRefresh}
              className="text-xs text-green hover:underline"
            >
              Refresh
            </button>
          </div>

          {listedMatches.length === 0 && (
            <Card className="px-4 py-8 text-center">
              <p className="text-sm text-muted">No open matches. Create one!</p>
            </Card>
          )}

          {listedMatches.map((m) => (
            <Card key={m.matchId} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-bold">{m.hostName}</p>
                <p className="text-xs text-muted">
                  {m.boardSize === 25 ? '5×5' : m.boardSize === 49 ? '7×7' : m.boardSize === 81 ? '9×9' : '10×10'} ·{' '}
                  {m.betMode === 'fixed' ? 'Fixed' : 'Free'} bet
                  {m.betMode === 'free' && m.minBet ? ` · min ${formatSol(m.minBet)}` : ''} · {formatSol(m.stake)} SOL
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={() => handleJoin(m.matchId)}>
                Join
              </Button>
            </Card>
          ))}
        </div>
      </GameShell>
    );
  }

  if (page === 'create') {
    return (
      <GameShell title="Mine Catcher">
        <GameSetupWizard
          config={mineCatcherSetupConfig}
          balance={user?.availableBalance?.toString() ?? null}
          onPublish={handleCreate}
          onBack={() => setPage('lobby')}
        />
      </GameShell>
    );
  }

  if (page === 'waiting' || page === 'waiting_friends') {
    const boardLabel = boardSize === 25 ? '5×5' : boardSize === 49 ? '7×7' : boardSize === 81 ? '9×9' : '10×10';
    return (
      <GameShell title="Mine Catcher">
        <GameWaitingRoom
          mode={page === 'waiting_friends' ? 'friends' : 'random'}
          roomCode={roomCode}
          waitingText="Waiting for an opponent to join…"
          summary={`${boardLabel} · ${betMode === 'fixed' ? 'Fixed' : 'Free'} bet · ${formatSol(String(stake))} SOL`}
          onCancel={handleBackToGames}
        />
      </GameShell>
    );
  }

  if (page === 'join_code') {
    return (
      <GameShell title="Mine Catcher">
        <GameJoinByCode
          onJoin={(code) => socketRef.current?.emit(MC.JOIN_MATCH, { roomCode: code })}
          onBack={() => setPage('lobby')}
        />
      </GameShell>
    );
  }

  if (page === 'placement') {
    return (
      <GameShell title="Mine Catcher">
        <PageTitle title="Mine Catcher" subtitle="Hide your mines!" />
        {error && (
          <div className="mx-auto mb-4 max-w-sm rounded-[10px] border border-red/30 bg-red/10 px-4 py-2 text-center text-xs text-red">
            {error}
          </div>
        )}
        <MinePlacementBoard
          boardSize={boardSize}
          totalMines={10}
          placementTimeLeft={placementTimeLeft}
          onPlace={handlePlace}
          onReady={handleReady}
          isReady={myReady}
          opponentReady={opponentReady}
        />
      </GameShell>
    );
  }

  if (page === 'attacking') {
    return (
      <GameShell title="Mine Catcher">
        <PageTitle title="Mine Catcher" subtitle="Find the opponent's mines!" />
        {error && (
          <div className="mx-auto mb-4 max-w-sm rounded-[10px] border border-red/30 bg-red/10 px-4 py-2 text-center text-xs text-red">
            {error}
          </div>
        )}
        <MineAttackBoard
          boardSize={boardSize}
          myId={myId}
          currentAttacker={currentAttacker}
          opponentCells={opponentCells}
          foundCount={myFoundCount}
          breakCount={myBreakCount}
          opponentFoundCount={opponentFoundCount}
          turnTimeLeft={turnTimeLeft}
          myLives={myLives}
          opponentLives={opponentLives}
          lastAttack={lastAttack}
          onAttack={handleAttack}
        />
      </GameShell>
    );
  }

  if (page === 'match_result' && result) {
    return (
      <GameShell title="Mine Catcher">
        <PageTitle title="Mine Catcher" subtitle="Match Result" />
        <MineCatcherResult
          won={result.winnerId === myId}
          myId={myId}
          winnerId={result.winnerId}
          foundCounts={result.foundCounts}
          breakCounts={result.breakCounts}
          lives={result.lives}
          endCause={result.endCause}
          pot={result.pot}
          feeCollected={result.feeCollected}
          payouts={result.payouts}
          playerNames={Object.fromEntries(players.map((p) => [p.id, p.displayName ?? 'Player']))}
          onRematch={rematchAvailable ? handleRematch : undefined}
          onBackToGames={handleBackToGames}
        />
      </GameShell>
    );
  }

  return (
    <GameShell title="Mine Catcher">
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="mx-auto" />
      </div>
    </GameShell>
  );
}
