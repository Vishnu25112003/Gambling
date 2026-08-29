import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Dices, Heart, Layers } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { tokenStore } from '../../api/client';
import { walletApi } from '../../api/endpoints';
import { Button, Card, PageTitle, Spinner } from '../../components/shared/ui';
import { GameShell } from '../../components/shared/GameShell';
import { GameSetupWizard, GameJoinByCode, GameWaitingRoom } from '../../components/shared/gameSetup';
import { formatSol } from '../../lib/format';
import { trumpcardSetupConfig } from './trumpcardSetupConfig';
import { TrumpcardResult } from './TrumpcardResult';
import { TrumpcardCard, TrumpcardBack, type TrumpCardData } from './TrumpcardCard';
import { RoundRevealOverlay, type RevealEntry } from './RoundRevealOverlay';

/**
 * Mirror of backend TRUMPCARD_EVENTS — keep in sync with backend/src/games/trumpcard/types.ts
 */
const TRUMPCARD = {
  CREATE_MATCH: 'trumpcard:create',
  JOIN_MATCH: 'trumpcard:join',
  LIST_MATCHES: 'trumpcard:list',
  LEAVE_LOBBY: 'trumpcard:leave',
  CHOOSE_STAT: 'trumpcard:choose_stat',
  MATCH_CREATED: 'trumpcard:created',
  MATCHES_LIST: 'trumpcard:matches',
  MATCH_STATE: 'trumpcard:state',
  LEADER_TURN_START: 'trumpcard:leader:start',
  ROUND_REVEAL: 'trumpcard:round:reveal',
  LIVES_UPDATE: 'trumpcard:lives:update',
  PLAYER_ELIMINATED: 'trumpcard:player:eliminated',
  MATCH_RESULT: 'trumpcard:match:result',
  OPPONENT_DISCONNECTED: 'trumpcard:opponent:disconnect',
  OPPONENT_RECONNECTED: 'trumpcard:opponent:reconnect',
  ERROR: 'trumpcard:error',
} as const;

const STAT_CHOICE_TIMEOUT_MS = 10_000;

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
type TrumpcardPhase = 'leader_choosing' | 'reveal' | 'match_over';

interface ListedMatch {
  matchId: string;
  hostName: string;
  seatCount: number;
  cardsPerPlayer: number;
  durationMinutes: number;
  stake: string;
  betMode: BetMode;
  minBet: string | null;
}

interface PlayerInfo {
  id: string;
  displayName?: string | null;
}

interface StateSnapshot {
  seatCount?: number;
  cardsPerPlayer?: number;
  activePlayerIds?: string[];
  handCounts?: Record<string, number>;
  lives?: Record<string, number>;
  poolSize?: number;
  currentLeaderId?: string;
  leaderChoiceStartedAt?: number;
  phase?: TrumpcardPhase;
  roundNumber?: number;
  matchDeadline?: number;
  myTopCard?: TrumpCardData | null;
  players?: PlayerInfo[];
  matchId?: string;
  message?: string;
  currentPlayers?: number;
}

/** The lobby-fill notice overloads `phase` with a value outside TrumpcardPhase. */
type StateSnapshotOrWaiting = Omit<StateSnapshot, 'phase'> & { phase?: TrumpcardPhase | 'waiting_for_players' };

interface RoundRevealPayload {
  statKey: string;
  roundNumber: number;
  comparison: RevealEntry[];
  winnerId: string | null;
  tiedIds: string[];
  poolClaimedBy: string | null;
}

interface MatchResultPayload {
  rankings: { playerId: string; rank: number; cardCount: number; eliminatedAt: 'cards' | 'lives' | null }[];
  seatCount: number;
  pot: string;
  feeCollected: string;
  payouts: { userId: string; payout: string }[];
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TrumpcardBoard() {
  return (
    <GameShell title="Trumpcard">
      <TrumpcardBoardInner />
    </GameShell>
  );
}

function TrumpcardBoardInner() {
  const { user } = useAuth();

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  const [balance, setBalance] = useState<string | null>(null);
  const fetchedBalance = useRef(false);

  const [page, setPage] = useState<Page>('lobby');
  const [matches, setMatches] = useState<ListedMatch[]>([]);

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [seatCount, setSeatCount] = useState(2);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(26);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [betMode, setBetMode] = useState<BetMode>('fixed');
  const [stake, setStake] = useState('0.1');

  const [myId, setMyId] = useState<string | null>(user?.id ?? null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [activePlayerIds, setActivePlayerIds] = useState<string[]>([]);
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [lives, setLives] = useState<Record<string, number>>({});
  const [poolSize, setPoolSize] = useState(0);
  const [currentLeaderId, setCurrentLeaderId] = useState<string | null>(null);
  const [phase, setPhase] = useState<TrumpcardPhase | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [myTopCard, setMyTopCard] = useState<TrumpCardData | null>(null);
  const [pendingStat, setPendingStat] = useState<string | null>(null);

  const [leaderDeadline, setLeaderDeadline] = useState<number | null>(null);
  const [matchDeadlineAt, setMatchDeadlineAt] = useState<number | null>(null);
  const [leaderTimeLeft, setLeaderTimeLeft] = useState(0);
  const [matchTimeLeft, setMatchTimeLeft] = useState(0);

  const [revealData, setRevealData] = useState<RoundRevealPayload | null>(null);
  const [waitingReason, setWaitingReason] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerNameMap = useRef<Map<string, string>>(new Map());
  const getDisplayName = (id: string): string => {
    const p = players.find((pl) => pl.id === id);
    if (p?.displayName) return p.displayName;
    return playerNameMap.current.get(id) ?? 'Player';
  };

  // Client-side countdown ticks, computed from server-sent deadlines — the
  // server is the source of truth, this just renders time remaining.
  useEffect(() => {
    const id = setInterval(() => {
      setLeaderTimeLeft(leaderDeadline ? Math.max(0, Math.ceil((leaderDeadline - Date.now()) / 1000)) : 0);
      setMatchTimeLeft(matchDeadlineAt ? Math.max(0, Math.ceil((matchDeadlineAt - Date.now()) / 1000)) : 0);
    }, 250);
    return () => clearInterval(id);
  }, [leaderDeadline, matchDeadlineAt]);

  const applySnapshot = useCallback((data: StateSnapshot) => {
    if (data.activePlayerIds) setActivePlayerIds(data.activePlayerIds);
    if (data.handCounts) setHandCounts(data.handCounts);
    if (data.lives) setLives(data.lives);
    if (data.poolSize !== undefined) setPoolSize(data.poolSize);
    if (data.currentLeaderId) setCurrentLeaderId(data.currentLeaderId);
    if (data.phase) setPhase(data.phase);
    if (data.roundNumber !== undefined) setRoundNumber(data.roundNumber);
    if (data.matchDeadline !== undefined) setMatchDeadlineAt(data.matchDeadline);
    if (data.myTopCard !== undefined) setMyTopCard(data.myTopCard);
    if (data.leaderChoiceStartedAt) setLeaderDeadline(data.leaderChoiceStartedAt + STAT_CHOICE_TIMEOUT_MS);
    if (data.seatCount) setSeatCount(data.seatCount);
    if (data.cardsPerPlayer) setCardsPerPlayer(data.cardsPerPlayer);
    if (data.players) {
      setPlayers(data.players);
      for (const p of data.players) {
        if (p.displayName) playerNameMap.current.set(p.id, p.displayName);
      }
    }
    setPendingStat(null);
  }, []);

  // --- Connect socket ---
  useEffect(() => {
    const token = tokenStore.get();
    if (!token || !user) return;

    const BASE = import.meta.env.VITE_API_URL || '';
    const s = io(BASE || '/', { auth: { token }, transports: ['websocket'] });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      setMyId(user.id);
      s.emit(TRUMPCARD.LIST_MATCHES);
    });

    s.on(TRUMPCARD.MATCHES_LIST, (data: { matches: ListedMatch[] }) => {
      setMatches(data.matches);
    });

    s.on(TRUMPCARD.MATCH_CREATED, (data: {
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

    s.on(TRUMPCARD.MATCH_STATE, (data: StateSnapshotOrWaiting) => {
      // A partial "N/seatCount joined" notice, sent while the lobby fills —
      // not a full game-state snapshot.
      if (data.phase === 'waiting_for_players' && data.message) {
        setWaitingReason(data.message);
        setPage('waiting');
        return;
      }

      if (data.activePlayerIds) {
        // The waiting_for_players branch above always returns early, so a
        // snapshot reaching here never carries that overloaded phase value.
        applySnapshot(data as StateSnapshot);
        setRevealData(null);
        if (data.message?.includes('Reconnected')) {
          setWaitingReason(null);
        }
        setPage('live');
      }
    });

    s.on(TRUMPCARD.LEADER_TURN_START, (data: { leaderId: string; roundNumber: number; startedAt: number }) => {
      setCurrentLeaderId(data.leaderId);
      setRoundNumber(data.roundNumber);
      setPhase('leader_choosing');
      setLeaderDeadline(data.startedAt + STAT_CHOICE_TIMEOUT_MS);
      setPendingStat(null);
      setRevealData(null);
      setWaitingReason(data.leaderId === user.id ? null : `Waiting for ${getDisplayName(data.leaderId)} to choose a stat…`);
    });

    s.on(TRUMPCARD.ROUND_REVEAL, (data: RoundRevealPayload) => {
      setPhase('reveal');
      setRevealData(data);
      setWaitingReason(null);
      setPendingStat(null);
    });

    s.on(TRUMPCARD.LIVES_UPDATE, (data: { userId: string; lives: number }) => {
      setLives((prev) => ({ ...prev, [data.userId]: data.lives }));
    });

    s.on(TRUMPCARD.PLAYER_ELIMINATED, (data: { userId: string }) => {
      setActivePlayerIds((prev) => prev.filter((id) => id !== data.userId));
    });

    s.on(TRUMPCARD.MATCH_RESULT, (data: MatchResultPayload) => {
      setMatchResult(data);
      setPage('match_result');
    });

    s.on(TRUMPCARD.OPPONENT_DISCONNECTED, (data: { userId: string }) => {
      setWaitingReason(`${getDisplayName(data.userId)} disconnected…`);
    });

    s.on(TRUMPCARD.OPPONENT_RECONNECTED, () => {
      setWaitingReason(null);
    });

    s.on(TRUMPCARD.ERROR, (data: { message: string }) => {
      setError(data.message);
      setPage('error');
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, applySnapshot]);

  // --- Fetch balance ---
  useEffect(() => {
    if (fetchedBalance.current || !user) return;
    fetchedBalance.current = true;
    void walletApi.balance().then((b) => setBalance(b.availableBalance)).catch(() => {});
  }, [user]);

  useEffect(() => {
    return () => { socketRef.current?.disconnect(); };
  }, []);

  // --- Actions ---
  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const handlePublish = (settings: {
    discovery: DiscoveryMode;
    seatCount: string | number;
    cardsPerPlayer: string | number;
    durationMinutes: string | number;
    betMode: BetMode;
    stake: number;
    minBet: number | null;
  }) => {
    const sc = Number(settings.seatCount);
    const cpp = Number(settings.cardsPerPlayer);
    const dur = Number(settings.durationMinutes);
    setSeatCount(sc);
    setCardsPerPlayer(cpp);
    setDurationMinutes(dur);
    setStake(String(settings.stake));
    setBetMode(settings.betMode);
    emit(TRUMPCARD.CREATE_MATCH, {
      discovery: settings.discovery,
      seatCount: sc,
      cardsPerPlayer: cpp,
      durationMinutes: dur,
      betMode: settings.betMode,
      stake: settings.stake,
      minBet: settings.minBet ?? undefined,
    });
  };

  const handleJoinRandom = (matchId: string) => emit(TRUMPCARD.JOIN_MATCH, { matchId });

  const handleJoinByCode = (code: string) => {
    if (!code.trim()) return;
    emit(TRUMPCARD.JOIN_MATCH, { roomCode: code });
    setPage('waiting');
  };

  const handleChooseStat = (statKey: string) => {
    setPendingStat(statKey);
    emit(TRUMPCARD.CHOOSE_STAT, { statKey });
  };

  const goHome = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setPage('lobby');
    setMatchResult(null);
    setPlayers([]);
    setActivePlayerIds([]);
    setHandCounts({});
    setLives({});
    setPoolSize(0);
    setCurrentLeaderId(null);
    setPhase(null);
    setMyTopCard(null);
    setPendingStat(null);
    setRevealData(null);
    setWaitingReason(null);
    setRoomCode(null);
    setError(null);
    setLeaderDeadline(null);
    setMatchDeadlineAt(null);

    const token = tokenStore.get();
    if (!token || !user) return;
    const BASE = import.meta.env.VITE_API_URL || '';
    const s = io(BASE || '/', { auth: { token }, transports: ['websocket'] });
    socketRef.current = s;
    s.on('connect', () => { setConnected(true); s.emit(TRUMPCARD.LIST_MATCHES); });
    s.on(TRUMPCARD.MATCHES_LIST, (data: { matches: ListedMatch[] }) => setMatches(data.matches));
  };

  // --- Lobby ---
  if (page === 'lobby') {
    return (
      <>
        <div className="mb-6 flex items-center justify-between">
          <PageTitle title="Trumpcard" subtitle="Join a match or create your own." />
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
            <Layers className="mx-auto mb-3 size-8 text-muted" />
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
                      {m.seatCount} players · {m.cardsPerPlayer} cards each · {m.durationMinutes} min ·{' '}
                      {m.betMode === 'fixed' ? 'Fixed' : 'Free'} bet
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
        config={trumpcardSetupConfig}
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
        summary={`${formatSol(stake)} SOL · ${seatCount} players · ${cardsPerPlayer} cards each · ${durationMinutes} min · ${betMode === 'fixed' ? 'Fixed' : 'Free'} bet`}
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
        summary={`${formatSol(stake)} SOL · ${seatCount} players · ${cardsPerPlayer} cards each · ${betMode === 'fixed' ? 'Fixed' : 'Free'} bet`}
        onCancel={goHome}
      />
    );
  }

  // --- Error ---
  if (page === 'error' || error) {
    return (
      <>
        <PageTitle title="Trumpcard" />
        <Card className="mx-auto max-w-md px-6 py-12 text-center">
          <p className="mb-4 text-sm text-red">{error ?? 'Something went wrong.'}</p>
          <Button variant="secondary" onClick={goHome}>Back to Lobby</Button>
        </Card>
      </>
    );
  }

  // --- Match Result ---
  if (page === 'match_result' && matchResult) {
    const myRanking = matchResult.rankings.find((r) => r.playerId === myId);
    const won = myRanking?.rank === 1;
    const myPayout = matchResult.payouts.find((p) => p.userId === myId);
    const nameMap: Record<string, string> = {};
    for (const p of players) {
      if (p.displayName) nameMap[p.id] = p.displayName;
    }

    return (
      <>
        <PageTitle title="Trumpcard — Match Over" />
        <TrumpcardResult
          won={won}
          stake={stake}
          payout={myPayout?.payout ?? '0'}
          rankings={matchResult.rankings}
          seatCount={matchResult.seatCount}
          myId={myId ?? ''}
          pot={matchResult.pot}
          feeCollected={matchResult.feeCollected}
          playerNames={nameMap}
          onBackToLobby={goHome}
        />
      </>
    );
  }

  // --- Live game board ---
  const isMyTurn = phase === 'leader_choosing' && currentLeaderId === myId;
  const leaderTimerColor = leaderTimeLeft <= 3 ? 'text-red' : leaderTimeLeft <= 5 ? 'text-gold' : 'text-green';
  const opponents = players.filter((p) => p.id !== myId);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <PageTitle
          title="Trumpcard"
          subtitle={isMyTurn ? 'Your turn — pick a stat!' : (waitingReason ?? 'Round in progress...')}
        />
        <div className="flex items-center gap-2 text-xs font-bold text-muted">
          <span>Round {roundNumber}</span>
          <span>⏳ {formatClock(matchTimeLeft)}</span>
          {poolSize > 0 && <span className="text-gold">· Pool: {poolSize}</span>}
        </div>
      </div>

      <div className="mx-auto max-w-lg">
        {/* Opponents row */}
        <Card className="mb-4 px-5 py-3">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {opponents.map((p) => {
              const isEliminated = !activePlayerIds.includes(p.id);
              const isLeader = currentLeaderId === p.id;
              return (
                <div key={p.id} className={`flex flex-col items-center gap-1 ${isEliminated ? 'opacity-40' : ''}`}>
                  <div className="relative">
                    <TrumpcardBack size="sm" className={isLeader ? 'border-gold' : ''} />
                    <span className="absolute -bottom-1.5 -right-1.5 rounded-full border border-line bg-bg2 px-1.5 py-0.5 text-[10px] font-bold">
                      {handCounts[p.id] ?? 0}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold">{p.displayName ?? 'Player'}</p>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: Math.max(0, lives[p.id] ?? 0) }).map((_, i) => (
                      <Heart key={i} className="size-2.5 fill-red text-red" />
                    ))}
                  </div>
                  {isEliminated && <p className="text-[10px] text-faint">Eliminated</p>}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Your card / turn area */}
        <Card className="mb-4 flex flex-col items-center px-6 py-8">
          {activePlayerIds.includes(myId ?? '') ? (
            <>
              <p className="mb-3 text-xs font-bold text-muted">Your Top Card</p>
              {myTopCard && (
                <TrumpcardCard
                  card={myTopCard}
                  size="lg"
                  selectedStat={pendingStat}
                  onStatTap={isMyTurn ? handleChooseStat : undefined}
                />
              )}
              <div className="mt-4 flex items-center gap-1.5">
                {Array.from({ length: Math.max(0, lives[myId ?? ''] ?? 0) }).map((_, i) => (
                  <Heart key={i} className="size-3.5 fill-red text-red" />
                ))}
              </div>
              {isMyTurn ? (
                <p className={`mt-3 text-2xl font-extrabold ${leaderTimerColor}`}>{leaderTimeLeft}s</p>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <Spinner className="size-4" />
                  {waitingReason ?? "Waiting for the leader..."}
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <Dices className="mx-auto mb-2 size-8 text-faint" />
              <p className="text-sm font-bold">You've been eliminated</p>
              <p className="text-xs text-muted">Watching the rest of the match play out.</p>
            </div>
          )}
        </Card>
      </div>

      {revealData && (
        <RoundRevealOverlay
          statKey={revealData.statKey}
          comparison={revealData.comparison}
          winnerId={revealData.winnerId}
          tiedIds={revealData.tiedIds}
          poolClaimedBy={revealData.poolClaimedBy}
          getDisplayName={getDisplayName}
          myId={myId}
        />
      )}
    </>
  );
}
