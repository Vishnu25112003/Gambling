import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Dices } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { tokenStore } from '../../api/client';
import { walletApi } from '../../api/endpoints';
import { Button, Card, PageTitle, Spinner } from '../../components/shared/ui';
import { GameShell } from '../../components/shared/GameShell';
import { GameSetupWizard, GameJoinByCode, GameWaitingRoom } from '../../components/shared/gameSetup';
import { formatSol } from '../../lib/format';
import { ludoSetupConfig } from './ludoSetupConfig';
import { LudoResult } from './LudoResult';
import { LudoBoardGrid } from './LudoBoardGrid';
import { LUDO_COLOR_VAR } from './boardGeometry';

/**
 * Mirror of backend LUDO_EVENTS — keep in sync with backend/src/games/ludo/types.ts
 */
const LUDO = {
  CREATE_MATCH: 'ludo:create',
  JOIN_MATCH: 'ludo:join',
  LIST_MATCHES: 'ludo:list',
  ROLL_DICE: 'ludo:roll',
  MOVE_TOKEN: 'ludo:move',
  LEAVE_LOBBY: 'ludo:leave',
  MATCH_STATE: 'ludo:state',
  MATCH_CREATED: 'ludo:created',
  MATCHES_LIST: 'ludo:matches',
  DICE_ROLLED: 'ludo:dice:rolled',
  TOKEN_MOVED: 'ludo:token:moved',
  TURN_START: 'ludo:turn:start',
  MATCH_RESULT: 'ludo:match:result',
  OPPONENT_DISCONNECTED: 'ludo:opponent:disconnect',
  OPPONENT_RECONNECTED: 'ludo:opponent:reconnect',
  ERROR: 'ludo:error',
} as const;

const ROLL_TIMEOUT_MS = 15_000;
const MOVE_TIMEOUT_MS = 10_000;

type Page =
  | 'lobby'
  | 'create'
  | 'waiting'
  | 'waiting_friends'
  | 'join_code'
  | 'live'
  | 'match_result'
  | 'error';

type DiscoveryMode = 'random' | 'friends';
type BetMode = 'fixed' | 'free';
type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

interface ListedMatch {
  matchId: string;
  hostName: string;
  seatCount: number;
  stake: string;
  betMode: BetMode;
  minBet: string | null;
}

interface PlayerInfo {
  id: string;
  displayName?: string | null;
  color: LudoColor;
}

interface TokenState {
  zone: 'yard' | 'track' | 'home';
  position: number;
  homePosition: number;
}

interface LudoState {
  seatCount: number;
  playerIds: string[];
  colors: Record<string, LudoColor>;
  tokens: Record<string, TokenState[]>;
  totalSteps: Record<string, number>;
  currentPlayerId: string;
  phase: string;
  currentDice: number | null;
  consecutiveSixes: number;
  turnNumber: number;
  disconnectedPlayers: string[];
}

interface ValidMove {
  tokenIndex: number;
  type: 'yard' | 'track' | 'home';
}

interface MatchResult {
  winnerId: string | null;
  rankings: { playerId: string; rank: number; totalSteps: number }[];
  seatCount: number;
  pot: string;
  feeCollected: string;
  payouts: { userId: string; payout: string }[];
}

export function LudoBoard() {
  return (
    <GameShell title="Ludo">
      <LudoBoardInner />
    </GameShell>
  );
}

function LudoBoardInner() {
  const { user } = useAuth();

  // --- Socket ---
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  // --- Balance ---
  const [balance, setBalance] = useState<string | null>(null);
  const fetchedBalance = useRef(false);

  // --- Page navigation ---
  const [page, setPage] = useState<Page>('lobby');

  // --- Lobby ---
  const [matches, setMatches] = useState<ListedMatch[]>([]);

  // --- Create flow ---
  // Populated from GameSetupWizard's onPublish, purely so the waiting-room
  // summary text below has something to show.
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [seatCount, setSeatCount] = useState(2);
  const [betMode, setBetMode] = useState<BetMode>('fixed');
  const [stake, setStake] = useState('0.1');

  // --- Live game ---
  const [myId, setMyId] = useState<string | null>(user?.id ?? null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [gameState, setGameState] = useState<LudoState | null>(null);
  const [validMoves, setValidMoves] = useState<ValidMove[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastDice, setLastDice] = useState<number | null>(null);
  const [lastMoveResult, setLastMoveResult] = useState<{
    playerId: string;
    tokenIndex: number;
    captures: { playerId: string; tokenIndex: number }[];
  } | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [waitingReason, setWaitingReason] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (ms: number) => {
      clearTimer();
      const end = Date.now() + ms;
      setTimeLeft(Math.ceil(ms / 1000));
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) clearTimer();
      }, 100);
    },
    [clearTimer],
  );

  // --- Player name map ---
  const playerNameMap = useRef<Map<string, string>>(new Map());
  const getDisplayName = (id: string): string => {
    const p = players.find((pl) => pl.id === id);
    if (p?.displayName) return p.displayName;
    return playerNameMap.current.get(id) ?? 'Player';
  };

  // --- Connect socket ---
  useEffect(() => {
    const token = tokenStore.get();
    if (!token || !user) return;

    const BASE = import.meta.env.VITE_API_URL || '';
    const s = io(BASE || '/', {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      setMyId(user.id);
      s.emit(LUDO.LIST_MATCHES, { gameType: 'ludo' });
    });

    s.on(LUDO.MATCHES_LIST, (data: { matches: ListedMatch[] }) => {
      setMatches(data.matches);
    });

    s.on(LUDO.MATCH_CREATED, (data: {
      matchId: string;
      roomCode?: string;
      phase?: string;
      currentPlayers?: number;
      seatCount?: number;
      message?: string;
    }) => {
      if (data.roomCode) {
        setRoomCode(data.roomCode);
        setPage('waiting_friends');
      } else if (data.phase === 'waiting_for_players') {
        setPage('waiting');
      } else if (data.message?.includes('Left')) {
        setPage('lobby');
      } else {
        setPage('waiting');
      }
    });

    s.on(LUDO.MATCH_STATE, (data: {
      state?: LudoState;
      moveRecords?: unknown[];
      message?: string;
      matchId?: string;
      players?: PlayerInfo[];
      totalRounds?: string;
      phase?: string;
      currentPlayers?: number;
      seatCount?: number;
      diceValue?: number;
      validMoves?: ValidMove[];
    }) => {
      // Reconnection
      if (data.state && data.message?.includes('Reconnected')) {
        setGameState(data.state);
        setPage('live');
        if (data.state.currentPlayerId === user.id) {
          setIsMyTurn(true);
          startTimer(ROLL_TIMEOUT_MS);
        }
        return;
      }

      // Match start
      if (data.players) {
        setPlayers(data.players);
        for (const p of data.players) {
          if (p.displayName) playerNameMap.current.set(p.id, p.displayName);
        }
        if (data.seatCount) setSeatCount(data.seatCount);
        setPage('live');
      }

      // Waiting for lobby fill
      if (data.phase === 'waiting_for_players' && data.message) {
        setWaitingReason(data.message);
        setPage('waiting');
      }
    });

    s.on(LUDO.TURN_START, (data: {
      currentPlayerId: string;
      turnNumber: number;
      dice: number | null;
      reason?: string;
    }) => {
      setLastDice(null);
      setLastMoveResult(null);
      setValidMoves([]);

      if (data.currentPlayerId === user.id) {
        setIsMyTurn(true);
        setWaitingReason(null);
        startTimer(ROLL_TIMEOUT_MS);
      } else {
        setIsMyTurn(false);
        setWaitingReason(`Waiting for ${getDisplayName(data.currentPlayerId)} to roll...`);
      }
    });

    s.on(LUDO.DICE_ROLLED, (data: {
      playerId: string;
      diceValue: number;
      color: LudoColor;
    }) => {
      setLastDice(data.diceValue);
      clearTimer();
    });

    s.on(LUDO.MATCH_STATE, (data: {
      phase?: string;
      diceValue?: number;
      validMoves?: ValidMove[];
    }) => {
      if (data.phase === 'moving' && data.validMoves) {
        setValidMoves(data.validMoves);
        startTimer(MOVE_TIMEOUT_MS);
      }
    });

    s.on(LUDO.TOKEN_MOVED, (data: {
      playerId: string;
      tokenIndex: number;
      diceValue: number;
      newPosition: TokenState;
      totalSteps: number;
      captures: { playerId: string; tokenIndex: number }[];
    }) => {
      setLastMoveResult({
        playerId: data.playerId,
        tokenIndex: data.tokenIndex,
        captures: data.captures,
      });

      // Update local game state
      setGameState((prev) => {
        if (!prev) return prev;
        const newTokens = { ...prev.tokens };
        const playerTokens = [...(newTokens[data.playerId] ?? [])];
        playerTokens[data.tokenIndex] = data.newPosition;
        newTokens[data.playerId] = playerTokens;
        return {
          ...prev,
          tokens: newTokens,
          totalSteps: {
            ...prev.totalSteps,
            [data.playerId]: data.totalSteps,
          },
        };
      });
    });

    s.on(LUDO.MATCH_RESULT, (data: MatchResult) => {
      clearTimer();
      setMatchResult(data);
      setPage('match_result');
    });

    s.on(LUDO.OPPONENT_DISCONNECTED, (data: { userId: string }) => {
      setWaitingReason(`${getDisplayName(data.userId)} disconnected...`);
    });

    s.on(LUDO.OPPONENT_RECONNECTED, (_data: { userId: string }) => {
      setWaitingReason(null);
    });

    s.on(LUDO.ERROR, (data: { message: string }) => {
      setError(data.message);
      setPage('error');
    });

    s.on('disconnect', () => {
      setConnected(false);
      clearTimer();
    });

    return () => {
      clearTimer();
      s.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, clearTimer, startTimer]);

  // --- Fetch balance ---
  useEffect(() => {
    if (fetchedBalance.current || !user) return;
    fetchedBalance.current = true;
    void walletApi.balance().then((b) => setBalance(b.availableBalance)).catch(() => {});
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { clearTimer(); socketRef.current?.disconnect(); };
  }, [clearTimer]);

  // --- Actions ---
  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const handlePublish = (settings: {
    discovery: DiscoveryMode;
    seatCount: string | number;
    betMode: BetMode;
    stake: number;
    minBet: number | null;
  }) => {
    const seatCount = Number(settings.seatCount);
    setSeatCount(seatCount);
    setStake(String(settings.stake));
    setBetMode(settings.betMode);
    emit(LUDO.CREATE_MATCH, {
      discovery: settings.discovery,
      seatCount,
      betMode: settings.betMode,
      stake: settings.stake,
      minBet: settings.minBet ?? undefined,
    });
  };

  const handleJoinRandom = (matchId: string) => {
    emit(LUDO.JOIN_MATCH, { matchId });
  };

  const handleJoinByCode = (code: string) => {
    if (!code.trim()) return;
    emit(LUDO.JOIN_MATCH, { roomCode: code });
    setPage('waiting');
  };

  const handleRollDice = () => emit(LUDO.ROLL_DICE);
  const handleMoveToken = (tokenIndex: number) => emit(LUDO.MOVE_TOKEN, { tokenIndex });

  const goHome = () => {
    clearTimer();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setPage('lobby');
    setMatchResult(null);
    setGameState(null);
    setPlayers([]);
    setLastDice(null);
    setLastMoveResult(null);
    setValidMoves([]);
    setIsMyTurn(false);
    setWaitingReason(null);
    setRoomCode(null);
    setError(null);
    // Reconnect
    const token = tokenStore.get();
    if (!token || !user) return;
    const BASE = import.meta.env.VITE_API_URL || '';
    const s = io(BASE || '/', { auth: { token }, transports: ['websocket'] });
    socketRef.current = s;
    s.on('connect', () => { setConnected(true); s.emit(LUDO.LIST_MATCHES, { gameType: 'ludo' }); });
    s.on(LUDO.MATCHES_LIST, (data: { matches: ListedMatch[] }) => setMatches(data.matches));
  };

  // --- Lobby ---
  if (page === 'lobby') {
    return (
      <>
        <div className="mb-6 flex items-center justify-between">
          <PageTitle title="Ludo" subtitle="Join a match or create your own." />
          <Button variant="primary" size="sm" onClick={() => setPage('create')} disabled={!connected}>
            + Create Game
          </Button>
        </div>

        {!connected ? (
          <Card className="px-6 py-12 text-center">
            <Spinner className="mb-3 size-5" />
            <p className="text-sm text-muted">Connecting...</p>
          </Card>
        ) : matches.length === 0 ? (
          <Card className="px-6 py-12 text-center">
            <Dices className="mx-auto mb-3 size-8 text-muted" />
            <p className="mb-1 text-sm font-bold">No open matches</p>
            <p className="text-xs text-muted">Create one or join with a room code.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setPage('join_code')}>
              Join with Code
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPage('join_code')}>
                Join with Code
              </Button>
            </div>
            <div className="space-y-2">
              {matches.map((m) => (
                <Card key={m.matchId} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-bold">{m.hostName}</p>
                    <p className="text-xs text-muted">
                      {m.seatCount} players · {m.betMode === 'fixed' ? 'Fixed' : 'Free'} bet
                      {m.betMode === 'free' && m.minBet ? ` · min ${formatSol(m.minBet)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-green">{formatSol(m.stake)} SOL</span>
                    <Button variant="solid" size="sm" onClick={() => handleJoinRandom(m.matchId)}>
                      Join
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  // --- Friends Play: Join with code ---
  if (page === 'join_code') {
    return <GameJoinByCode onJoin={handleJoinByCode} onBack={() => setPage('lobby')} />;
  }

  // --- Create flow ---
  if (page === 'create') {
    return (
      <GameSetupWizard
        config={ludoSetupConfig}
        balance={balance}
        onPublish={handlePublish}
        onBack={() => setPage('lobby')}
      />
    );
  }

  // --- Waiting (Friends Play) ---
  if (page === 'waiting_friends') {
    return (
      <GameWaitingRoom
        mode="friends"
        roomCode={roomCode}
        waitingText="Waiting for players to join…"
        summary={`${formatSol(stake)} SOL · ${seatCount} players · ${betMode === 'fixed' ? 'Fixed' : 'Free'} bet`}
        onCancel={goHome}
      />
    );
  }

  // --- Waiting (Random or filling) ---
  if (page === 'waiting') {
    return (
      <GameWaitingRoom
        mode="random"
        roomCode={roomCode}
        waitingText={waitingReason ?? 'Waiting for players to join…'}
        summary={`${formatSol(stake)} SOL · ${seatCount} players`}
        onCancel={goHome}
      />
    );
  }

  // --- Error ---
  if (page === 'error' || error) {
    return (
      <>
        <PageTitle title="Ludo" />
        <Card className="mx-auto max-w-md px-6 py-12 text-center">
          <p className="mb-4 text-sm text-red">{error ?? 'Something went wrong.'}</p>
          <Button variant="secondary" onClick={goHome}>Back to Lobby</Button>
        </Card>
      </>
    );
  }

  // --- Match Result ---
  if (page === 'match_result' && matchResult) {
    const iWon = matchResult.winnerId === myId;
    const myPayout = matchResult.payouts.find((p) => p.userId === myId);
    const nameMap: Record<string, string> = {};
    for (const p of players) {
      if (p.displayName) nameMap[p.id] = p.displayName;
    }

    return (
      <>
        <PageTitle title="Ludo — Match Over" />
        <LudoResult
          won={iWon}
          stake={stake}
          payout={myPayout?.payout ?? '0'}
          rankings={matchResult.rankings}
          seatCount={matchResult.seatCount}
          myId={myId ?? ''}
          pot={matchResult.pot}
          feeCollected={matchResult.feeCollected}
          playerNames={nameMap}
          onPlayAgain={goHome}
        />
      </>
    );
  }

  // --- Live game board ---
  const timerColor = timeLeft <= 3 ? 'text-red' : timeLeft <= 5 ? 'text-gold' : 'text-green';

  return (
    <>
      <PageTitle
        title="Ludo"
        subtitle={isMyTurn ? 'Your turn — roll the dice!' : (waitingReason ?? 'Opponent\'s turn...')}
      />
      <div className="mx-auto max-w-lg">
        {/* Player bar */}
        <Card className="mb-4 px-5 py-3">
          <div className="flex items-center justify-between">
            {players.map((p) => (
              <div key={p.id} className="text-center">
                <p className="text-[11px] text-muted">
                  {p.id === myId ? 'You' : p.displayName ?? 'Player'}
                </p>
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: LUDO_COLOR_VAR[p.color] }}
                  />
                  <p className="text-xl font-bold">{gameState?.totalSteps[p.id] ?? 0}</p>
                </div>
                <p className="text-[10px] text-faint">
                  {gameState?.tokens[p.id]?.filter((t) => t.zone === 'home').length ?? 0}/4 home
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Board */}
        <div className="mb-4">
          <LudoBoardGrid
            players={players}
            tokens={gameState?.tokens ?? {}}
            myId={myId}
            validMoves={validMoves}
            onMoveToken={handleMoveToken}
          />
        </div>

        {/* Dice + Action area */}
        <Card className="mb-4 flex flex-col items-center px-6 py-8">
          {/* Dice display */}
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[12px] border-2 border-line bg-bg2">
              {lastDice ? (
                <span className="text-3xl font-extrabold">{lastDice}</span>
              ) : (
                <span className="text-2xl text-faint">?</span>
              )}
            </div>
            {lastDice === 6 && (
              <span className="text-sm font-bold text-gold">+ Extra turn!</span>
            )}
          </div>

          {/* Roll button or move selection */}
          {isMyTurn && validMoves.length === 0 && !lastDice && (
            <>
              <p className="mb-3 text-sm text-muted">Tap to roll the dice</p>
              <button
                type="button"
                onClick={handleRollDice}
                className="mb-2 flex h-20 w-20 items-center justify-center rounded-full border-2 border-green-solid bg-green-solid/20 text-green transition hover:bg-green-solid/30"
              >
                <Dices className="size-8" />
              </button>
              <p className={`text-2xl font-extrabold ${timerColor}`}>{timeLeft}s</p>
            </>
          )}

          {isMyTurn && validMoves.length > 0 && (
            <>
              <p className="mb-3 text-sm font-bold text-green">
                Choose a token to move ({lastDice})
              </p>
              <div className="flex gap-3">
                {validMoves.map((m) => (
                  <button
                    key={m.tokenIndex}
                    type="button"
                    onClick={() => handleMoveToken(m.tokenIndex)}
                    className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-solid bg-green-solid/20 text-lg font-bold transition hover:bg-green-solid/30"
                  >
                    T{m.tokenIndex + 1}
                  </button>
                ))}
              </div>
              <p className={`mt-2 text-2xl font-extrabold ${timerColor}`}>{timeLeft}s</p>
            </>
          )}

          {!isMyTurn && (
            <>
              <p className="text-sm text-muted">
                {waitingReason ?? 'Waiting for opponent...'}
              </p>
            </>
          )}

          {/* Last move result */}
          {lastMoveResult && (
            <div className="mt-4 rounded-[10px] border border-line bg-bg2 px-4 py-2 text-center">
              <p className="text-xs text-muted">
                {getDisplayName(lastMoveResult.playerId)} moved token {lastMoveResult.tokenIndex + 1}
                {lastMoveResult.captures.length > 0 && (
                  <span className="text-gold"> — captured!</span>
                )}
              </p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
