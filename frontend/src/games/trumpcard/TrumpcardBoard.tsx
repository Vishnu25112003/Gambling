import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Dices, Heart, Layers } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { tokenStore } from '../../api/client';
import { walletApi } from '../../api/endpoints';
import { Button, Card, PageTitle, Spinner } from '../../components/shared/ui';
import { GameShell } from '../../components/shared/GameShell';
import { GameSetupWizard, GameJoinByCode, GameWaitingRoom } from '../../components/shared/gameSetup';
import { StakeAmountStep } from '../../components/shared/gameSetup/StakeAmountStep';
import { formatSol } from '../../lib/format';
import { trumpcardSetupConfig } from './trumpcardSetupConfig';
import { TrumpcardResult } from './TrumpcardResult';
import { TrumpcardCard, TrumpcardBack, type TrumpCardData } from './TrumpcardCard';
import { RoundRevealOverlay, type RevealEntry } from './RoundRevealOverlay';
import { NarutoFrame } from './NarutoFrame';
import { RivalMiniRow } from './RivalMiniRow';
import { NARUTO, NARUTO_FONT, cardStackLayers } from './narutoTheme';

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
  STAKE_REQUIRED: 'trumpcard:stake:required',
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
  | 'stake_select'
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

/** Sent by the server when JOIN_MATCH hits a Free Bet match without a chosen
 * stake yet — see the STAKE_REQUIRED handler below. */
interface StakeRequiredInfo {
  matchId: string;
  hostName: string;
  seatCount: number;
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

/**
 * A faux stack of cards peeking out from behind the top card — port of the
 * mock's `stack(n)` + absolutely-positioned filler divs. Purely decorative
 * (reflects how many cards are left in the pile); the real card on top
 * still renders through `children`.
 */
function CardStack({ remaining, children }: { remaining: number; children: ReactNode }) {
  const layers = cardStackLayers(remaining);
  return (
    <div style={{ position: 'relative', width: '100%', paddingLeft: 14, boxSizing: 'border-box' }}>
      {layers.map((l) => (
        <div
          key={l.key}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 14,
            right: 0,
            borderRadius: 16,
            background: NARUTO.card,
            border: `2px solid ${NARUTO.ink}`,
            boxShadow: '0 10px 22px rgba(0,0,0,.4)',
            transformOrigin: '50% 100%',
            transform: l.transform,
          }}
        />
      ))}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
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

  const [joinStakeInfo, setJoinStakeInfo] = useState<StakeRequiredInfo | null>(null);
  const [joinStake, setJoinStake] = useState('0.1');
  const [stakeError, setStakeError] = useState<string | null>(null);

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

    s.on(TRUMPCARD.STAKE_REQUIRED, (data: StakeRequiredInfo) => {
      // The match we tried to join is Free Bet — the server needs our own
      // stake before it'll actually lock anything and start the match.
      setJoinStakeInfo(data);
      setJoinStake(data.minBet ?? '0.1');
      setStakeError(null);
      setPage('stake_select');
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

  const handleConfirmStake = () => {
    if (!joinStakeInfo) return;
    const amount = Number(joinStake);
    const minBetNum = joinStakeInfo.minBet != null ? Number(joinStakeInfo.minBet) : 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      setStakeError('Enter a valid stake amount.');
      return;
    }
    if (amount < minBetNum) {
      setStakeError(`Must be at least ${formatSol(joinStakeInfo.minBet ?? '0')} SOL.`);
      return;
    }
    setStakeError(null);
    // Stay off 'stake_select' — MATCH_STATE/waiting-room events move us
    // forward once the server accepts this stake.
    setPage('waiting');
    emit(TRUMPCARD.JOIN_MATCH, { matchId: joinStakeInfo.matchId, stake: amount });
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
    setJoinStakeInfo(null);
    setStakeError(null);

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

  // --- Free Bet joiner: pick a stake before the match can start ---
  if (page === 'stake_select' && joinStakeInfo) {
    const stakeNum = Number(joinStake) || 0;
    const minBetNum = joinStakeInfo.minBet != null ? Number(joinStakeInfo.minBet) : 0;
    const canAfford = balance === null || stakeNum <= Number(balance);
    const meetsMinimum = stakeNum >= minBetNum;
    return (
      <>
        <PageTitle
          title="Choose Your Bet"
          subtitle={`Joining ${joinStakeInfo.hostName}'s Free Bet match — ${joinStakeInfo.seatCount} players.`}
        />
        <Card className="mx-auto max-w-sm px-6 py-6">
          {joinStakeInfo.minBet && (
            <p className="mb-4 text-xs text-muted">
              Minimum stake: <span className="font-bold text-text">{formatSol(joinStakeInfo.minBet)} SOL</span>
            </p>
          )}
          <StakeAmountStep
            balance={balance}
            stake={joinStake}
            onStakeChange={setJoinStake}
            accentColor={NARUTO.gold}
            canAfford={canAfford}
          />
          {!meetsMinimum && (
            <p className="mb-1 text-xs text-red">Must be at least {formatSol(joinStakeInfo.minBet ?? '0')} SOL.</p>
          )}
          {stakeError && <p className="mb-1 text-xs text-red">{stakeError}</p>}
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full border-none"
            disabled={!joinStake || stakeNum <= 0 || !canAfford || !meetsMinimum}
            onClick={handleConfirmStake}
            style={{ background: NARUTO.gold, color: NARUTO.ink }}
          >
            Join Match
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            onClick={() => { setJoinStakeInfo(null); setStakeError(null); setPage('lobby'); }}
          >
            Back to Lobby
          </Button>
        </Card>
      </>
    );
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
      <NarutoFrame>
        <div
          className="mb-5 text-center"
          style={{ fontFamily: NARUTO_FONT.display, fontSize: 'clamp(20px,4vw,32px)', color: NARUTO.cream }}
        >
          MATCH OVER
        </div>
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
      </NarutoFrame>
    );
  }

  // --- Live game board ---
  const isMyTurn = phase === 'leader_choosing' && currentLeaderId === myId;
  const opponents = players.filter((p) => p.id !== myId);
  const singleOpponent = opponents.length === 1 ? opponents[0] : null;
  const iAmActive = activePlayerIds.includes(myId ?? '');
  const myCount = handCounts[myId ?? ''] ?? 0;
  const myLives = Math.max(0, lives[myId ?? ''] ?? 0);

  let bannerTitle = 'GET READY';
  let bannerNote = waitingReason ?? '';
  let bannerColor: string = NARUTO.cream;
  if (phase === 'reveal') {
    bannerTitle = 'REVEALING…';
    bannerNote = '';
    bannerColor = NARUTO.gold;
  } else if (isMyTurn) {
    bannerTitle = 'PICK A STAT';
    bannerNote = '';
  } else if (phase === 'leader_choosing' && currentLeaderId) {
    bannerTitle = `${getDisplayName(currentLeaderId).toUpperCase()}'S TURN`;
    bannerNote = waitingReason ?? 'Waiting for their pick…';
  }

  const labelStyle = (color: string) => ({
    fontFamily: NARUTO_FONT.condensed,
    fontWeight: 700 as const,
    fontSize: 'clamp(9px,2.2vw,12px)',
    letterSpacing: '.2em',
    color,
    textAlign: 'center' as const,
  });

  return (
    <NarutoFrame>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div
            style={{
              fontFamily: NARUTO_FONT.condensed,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '.32em',
              color: NARUTO.orange,
              textTransform: 'uppercase',
            }}
          >
            Real-Time Duel · 52 Card Deck
          </div>
          <div
            style={{
              fontFamily: NARUTO_FONT.display,
              fontSize: 'clamp(22px,4.6vw,38px)',
              color: NARUTO.cream,
              letterSpacing: '-.01em',
              lineHeight: 1.05,
            }}
          >
            NARUTO TRUMP CARDS
          </div>
        </div>
        <div
          className="flex items-center gap-3"
          style={{ fontFamily: NARUTO_FONT.condensed, fontWeight: 700, fontSize: 12, letterSpacing: '.14em', color: NARUTO.muted }}
        >
          <span>ROUND {roundNumber}</span>
          <span>⏳ {formatClock(matchTimeLeft)}</span>
          {poolSize > 0 && <span style={{ color: NARUTO.gold }}>· POOL {poolSize}</span>}
        </div>
      </div>

      {!iAmActive ? (
        <div className="mx-auto max-w-md py-10 text-center">
          <Dices className="mx-auto mb-2 size-8" style={{ color: NARUTO.faint }} />
          <p className="text-sm font-bold" style={{ color: NARUTO.cream }}>You've been eliminated</p>
          <p className="text-xs" style={{ color: NARUTO.muted }}>Watching the rest of the match play out.</p>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-5">
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-center">
            <div style={{ fontFamily: NARUTO_FONT.display, fontSize: 'clamp(15px,3.6vw,22px)', lineHeight: 1.15, color: bannerColor }}>
              {bannerTitle}
            </div>
            {bannerNote && <div style={{ fontSize: 'clamp(12px,3vw,14px)', color: NARUTO.muted }}>{bannerNote}</div>}
          </div>

          {singleOpponent ? (
            <div className="grid w-full grid-cols-1 items-start justify-items-center gap-3 sm:grid-cols-[2.4fr_1fr] sm:gap-9">
              <div className="flex w-full max-w-[400px] flex-col items-stretch gap-2">
                <div style={labelStyle(NARUTO.gold)}>YOUR CARD</div>
                {myTopCard && (
                  <CardStack remaining={myCount}>
                    <TrumpcardCard
                      card={myTopCard}
                      selectedStat={pendingStat}
                      onStatTap={isMyTurn ? handleChooseStat : undefined}
                      footerHint={isMyTurn ? 'TAP A STAT' : 'WAITING…'}
                    />
                  </CardStack>
                )}
                <div style={labelStyle(NARUTO.faint)}>{myCount} LEFT</div>
              </div>

              {/* Wide layout: face-down rival card. Narrow layout swaps to the mini row below. */}
              <div className="hidden w-full max-w-[330px] flex-col items-stretch gap-2 sm:flex">
                <div style={labelStyle(NARUTO.orange)}>RIVAL CARD</div>
                <CardStack remaining={handCounts[singleOpponent.id] ?? 0}>
                  <TrumpcardBack />
                </CardStack>
                <div style={labelStyle(NARUTO.faint)}>{handCounts[singleOpponent.id] ?? 0} LEFT</div>
              </div>
              <div className="w-full sm:hidden">
                <RivalMiniRow
                  displayName={singleOpponent.displayName ?? 'Player'}
                  cardsLeft={handCounts[singleOpponent.id] ?? 0}
                  lives={Math.max(0, lives[singleOpponent.id] ?? 0)}
                  isLeader={currentLeaderId === singleOpponent.id}
                  isEliminated={!activePlayerIds.includes(singleOpponent.id)}
                />
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-5">
              <div className="flex w-full max-w-[400px] flex-col items-stretch gap-2">
                <div style={labelStyle(NARUTO.gold)}>YOUR CARD</div>
                {myTopCard && (
                  <CardStack remaining={myCount}>
                    <TrumpcardCard
                      card={myTopCard}
                      selectedStat={pendingStat}
                      onStatTap={isMyTurn ? handleChooseStat : undefined}
                      footerHint={isMyTurn ? 'TAP A STAT' : 'WAITING…'}
                    />
                  </CardStack>
                )}
                <div style={labelStyle(NARUTO.faint)}>{myCount} LEFT</div>
              </div>
              <div className="flex w-full max-w-[560px] flex-col gap-2">
                {opponents.map((p) => (
                  <RivalMiniRow
                    key={p.id}
                    displayName={p.displayName ?? 'Player'}
                    cardsLeft={handCounts[p.id] ?? 0}
                    lives={Math.max(0, lives[p.id] ?? 0)}
                    isLeader={currentLeaderId === p.id}
                    isEliminated={!activePlayerIds.includes(p.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {Array.from({ length: myLives }).map((_, i) => (
              <Heart key={i} className="size-3.5" style={{ fill: NARUTO.lose, color: NARUTO.lose }} />
            ))}
          </div>

          {isMyTurn && (
            <p
              style={{
                fontFamily: NARUTO_FONT.display,
                fontSize: 26,
                color: leaderTimeLeft <= 3 ? NARUTO.lose : leaderTimeLeft <= 5 ? NARUTO.gold : NARUTO.win,
              }}
            >
              {leaderTimeLeft}s
            </p>
          )}
        </div>
      )}

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
    </NarutoFrame>
  );
}
