import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../hooks/useAuth';
import { tokenStore } from '../../api/client';
import { Button, Card, PageTitle, Spinner } from '../../components/shared/ui';
import { GameShell } from '../../components/shared/GameShell';
import { GameSetupWizard, GameJoinByCode, GameWaitingRoom } from '../../components/shared/gameSetup';
import { StakeAmountStep } from '../../components/shared/gameSetup/StakeAmountStep';
import { gameVisual } from '../../lib/gameVisuals';
import { formatSol } from '../../lib/format';
import { handCricketSetupConfig } from './handCricketSetupConfig';
import { HandCricketPickBoard, type BallReveal, type FinishedInningsSummary } from './HandCricketPickBoard';
import { HandCricketResult } from './HandCricketResult';

/**
 * Mirror of backend HC_EVENTS — keep in sync with backend/src/games/hand-cricket/types.ts
 */
const HC = {
  CREATE_MATCH: 'hc:create',
  JOIN_MATCH: 'hc:join',
  LIST_MATCHES: 'hc:list',
  PICK_NUMBER: 'hc:pick',
  REMATCH_REQUEST: 'hc:rematch:request',
  REMATCH_WAITING: 'hc:rematch:waiting',
  REMATCH_OFFERED: 'hc:rematch:offered',
  MATCH_STATE: 'hc:state',
  MATCH_CREATED: 'hc:created',
  MATCHES_LIST: 'hc:matches',
  STAKE_REQUIRED: 'hc:stake:required',
  INNINGS_STARTED: 'hc:innings:started',
  BALL_STARTED: 'hc:ball:started',
  BALL_RESULT: 'hc:ball:result',
  INNINGS_OVER: 'hc:innings:over',
  SUPER_OVER_STARTED: 'hc:superover:started',
  MATCH_RESULT: 'hc:match:result',
  LIVES_UPDATE: 'hc:lives:update',
  OPPONENT_DISCONNECTED: 'hc:opponent:disconnect',
  OPPONENT_RECONNECTED: 'hc:opponent:reconnect',
  ERROR: 'hc:error',
} as const;

const BASE = import.meta.env.VITE_API_URL || '';
const PICK_TIMEOUT_SEC = 10;

type Page =
  | 'lobby'
  | 'create'
  | 'waiting'
  | 'waiting_friends'
  | 'join_code'
  | 'stake_select'
  | 'batting'
  | 'super_over'
  | 'match_result'
  | 'error';

type DiscoveryMode = 'random' | 'friends';

interface ListedMatch {
  matchId: string;
  hostName: string;
  stake: string;
  ballsPerInnings: number;
  betMode: string;
  minBet: string | null;
}

/** Sent by the server when JOIN_MATCH hits a Free Bet match without a chosen
 * stake yet — see the STAKE_REQUIRED handler below. */
interface StakeRequiredInfo {
  matchId: string;
  hostName: string;
  minBet: string | null;
}

interface PlayerInfo {
  id: string;
  displayName?: string;
}

interface InningsResult {
  batterId: string;
  bowlerId: string;
  runs: number;
  isOut: boolean;
  ballsBowled: number;
  ballsPerInnings: number;
}

interface MatchResult {
  winnerId: string | null;
  split: boolean;
  innings: InningsResult[];
  lives: Record<string, number>;
  endCause: string | null;
  pot: string | null;
  feeCollected: string | null;
  payouts: { userId: string; payout: string }[];
}

function inningsLabelFor(index: number): string {
  return ['Innings 1', 'Innings 2', 'Super Over 1'][index] ?? `Innings ${index + 1}`;
}

export function HandCricketBoard() {
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
  const [ballsPerInnings, setBallsPerInnings] = useState<number>(6);
  const [stake, setStake] = useState<number>(0);
  const [betMode, setBetMode] = useState<'fixed' | 'free'>('fixed');

  // Live-play state
  const [myRole, setMyRole] = useState<'batting' | 'bowling' | null>(null);
  const [myRuns, setMyRuns] = useState(0);
  const [opponentRuns, setOpponentRuns] = useState(0);
  const [finishedInnings, setFinishedInnings] = useState<FinishedInningsSummary[]>([]);
  const [ballNumber, setBallNumber] = useState(1);
  const [pickTimeLeft, setPickTimeLeft] = useState(PICK_TIMEOUT_SEC);
  const [myLives, setMyLives] = useState(3);
  const [opponentLives, setOpponentLives] = useState(3);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [reveal, setReveal] = useState<BallReveal | null>(null);
  const [nextRoundNumber, setNextRoundNumber] = useState<number | null>(null);

  // Free Bet join flow
  const [joinStakeInfo, setJoinStakeInfo] = useState<StakeRequiredInfo | null>(null);
  const [joinStake, setJoinStake] = useState('0.1');
  const [stakeError, setStakeError] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<MatchResult | null>(null);
  const [rematchAvailable, setRematchAvailable] = useState(false);
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'waiting' | 'offered'>('idle');

  const myId = user?.id ?? '';
  // players[0] is always the match creator — see backend JOIN_MATCH, which
  // keeps dbMatch.participants[0] (the host) first when building playerIds.
  const isHost = players.length > 0 && players[0]?.id === myId;

  // runsRef/revealRef mirror the equivalent state into refs the socket
  // handlers can read synchronously. They're updated directly inside the
  // handlers below — NOT via a useEffect keyed on the state — because the
  // server routinely emits the next event (BALL_STARTED / INNINGS_STARTED /
  // SUPER_OVER_STARTED / MATCH_RESULT) in the very same tick as the one
  // that produced this state, before React has run any effects. An
  // effect-mirrored ref would still read the *previous* value in that case,
  // which silently skipped the reveal hold below (and, for a wicket, could
  // clear the OUT overlay before it ever painted).
  const runsRef = useRef({ myRuns: 0, opponentRuns: 0 });
  const revealRef = useRef<BallReveal | null>(null);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearHoldTimer() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  // Every transition that follows a resolved ball — the next ball, the next
  // innings, a Super Over, or the match result — waits for the reveal (or
  // wicket overlay) currently on screen to sit for 2.5s before advancing.
  // With nothing on screen yet (e.g. the very first ball of the match) it
  // applies immediately.
  function afterReveal(apply: () => void) {
    clearHoldTimer();
    if (revealRef.current) {
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        apply();
      }, 2500);
    } else {
      apply();
    }
  }

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function pushFinishedInnings(label: string) {
    setFinishedInnings((prev) => [
      ...prev,
      { label, myRuns: runsRef.current.myRuns, opponentRuns: runsRef.current.opponentRuns },
    ]);
  }

  // Socket connection
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) return;

    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit(HC.LIST_MATCHES);
    });

    socket.on(HC.MATCHES_LIST, (data: { matches: ListedMatch[] }) => {
      setListedMatches(data.matches);
    });

    socket.on(HC.STAKE_REQUIRED, (data: StakeRequiredInfo) => {
      setJoinStakeInfo(data);
      setJoinStake(data.minBet ?? '0.1');
      setStakeError(null);
      setPage('stake_select');
    });

    socket.on(HC.MATCH_CREATED, (data: { matchId: string; roomCode?: string }) => {
      setMatchId(data.matchId);
      if (data.roomCode) {
        setRoomCode(data.roomCode);
        setPage('waiting_friends');
      } else {
        setPage('waiting');
      }
    });

    socket.on(HC.MATCH_STATE, (data: {
      matchId?: string;
      players?: PlayerInfo[];
      ballsPerInnings?: number;
      stake?: number;
      picked?: boolean;
      state?: {
        phase: string;
        currentInningsIndex: number | null;
        innings: InningsResult[];
        lives: Record<string, number>;
        pendingBall: { ballStartedAt: number; picks: Record<string, number> } | null;
      };
      message?: string;
    }) => {
      if (data.matchId) setMatchId(data.matchId);
      if (data.players) setPlayers(data.players);
      if (data.ballsPerInnings) setBallsPerInnings(data.ballsPerInnings);
      if (data.stake) setStake(data.stake);
      if (data.picked) setMySubmitted(true);

      if (data.state) {
        const { innings, currentInningsIndex, lives } = data.state;
        setMyLives(lives[myId] ?? 3);
        const oppId = Object.keys(lives).find((id) => id !== myId) ?? '';
        setOpponentLives(lives[oppId] ?? 3);

        if (currentInningsIndex !== null) {
          const live = innings[currentInningsIndex];
          if (live) {
            const mine = live.batterId === myId ? live.runs : 0;
            const theirs = live.batterId === myId ? 0 : live.runs;
            setMyRole(live.batterId === myId ? 'batting' : 'bowling');
            setMyRuns(mine);
            setOpponentRuns(theirs);
            runsRef.current = { myRuns: mine, opponentRuns: theirs };
            setBallNumber(live.ballsBowled + 1);
          }
          setFinishedInnings(
            innings.slice(0, currentInningsIndex).map((inn, i) => ({
              label: inningsLabelFor(i),
              myRuns: inn.batterId === myId ? inn.runs : 0,
              opponentRuns: inn.batterId === myId ? 0 : inn.runs,
            })),
          );
        }

        if (data.state.pendingBall) {
          // A ball is actively awaiting picks — any reveal/hold left over
          // from before a reconnect no longer applies.
          clearHoldTimer();
          revealRef.current = null;
          setReveal(null);
          setNextRoundNumber(null);
          const elapsed = Math.floor((Date.now() - data.state.pendingBall.ballStartedAt) / 1000);
          setPickTimeLeft(Math.max(0, PICK_TIMEOUT_SEC - elapsed));
          setMySubmitted(data.state.pendingBall.picks[myId] !== undefined);
        }

        if (data.state.phase === 'batting') setPage('batting');
        else if (data.state.phase === 'super_over') setPage('super_over');
      }
    });

    // The server advances the instant a ball resolves — no pause of its
    // own — for every kind of transition: the next ball, the next innings,
    // a Super Over, or the match result. Applying any of these immediately
    // would wipe the reveal (or the wicket overlay) before a player could
    // read it, so each one runs through afterReveal() to hold for 2.5s
    // first whenever there's something on screen to hold for.
    socket.on(HC.INNINGS_STARTED, (data: {
      inningsId: 'first' | 'second' | 'super_second';
      batterId: string;
      bowlerId: string;
      ballsPerInnings: number;
    }) => {
      afterReveal(() => {
        if (data.inningsId === 'second') pushFinishedInnings('Innings 1');
        if (data.inningsId === 'super_second') pushFinishedInnings('Super Over 1');

        revealRef.current = null;
        setNextRoundNumber(null);
        setMyRole(data.batterId === myId ? 'batting' : 'bowling');
        setMyRuns(0);
        setOpponentRuns(0);
        runsRef.current = { myRuns: 0, opponentRuns: 0 };
        setBallNumber(1);
        setMySubmitted(false);
        setReveal(null);
        setRematchStatus('idle');
        setPage(data.inningsId === 'super_second' ? 'super_over' : 'batting');
      });
    });

    socket.on(HC.SUPER_OVER_STARTED, (data: { batterId: string; bowlerId: string; ballsPerInnings: number }) => {
      afterReveal(() => {
        pushFinishedInnings('Innings 2');
        revealRef.current = null;
        setNextRoundNumber(null);
        setMyRole(data.batterId === myId ? 'batting' : 'bowling');
        setMyRuns(0);
        setOpponentRuns(0);
        runsRef.current = { myRuns: 0, opponentRuns: 0 };
        setBallNumber(1);
        setMySubmitted(false);
        setReveal(null);
        setPage('super_over');
      });
    });

    socket.on(HC.BALL_STARTED, (data: { ballNumber: number; ballStartedAt: number }) => {
      // Only the same-innings case gets a "Round N" title — a wicket
      // already has its own OUT overlay to hold on, and doesn't reach here
      // (a wicket's next event is INNINGS_STARTED/SUPER_OVER_STARTED, not
      // another BALL_STARTED).
      if (revealRef.current) setNextRoundNumber(data.ballNumber);
      afterReveal(() => {
        revealRef.current = null;
        setReveal(null);
        setNextRoundNumber(null);
        setMySubmitted(false);
        setBallNumber(data.ballNumber);
        const elapsed = Math.floor((Date.now() - data.ballStartedAt) / 1000);
        setPickTimeLeft(Math.max(0, PICK_TIMEOUT_SEC - elapsed));
      });
    });

    socket.on(HC.BALL_RESULT, (data: {
      batterPick: number;
      bowlerPick: number;
      runsScored: number;
      out: boolean;
      batterId: string;
      totalRuns: number;
    }) => {
      const nextReveal: BallReveal = {
        batterPick: data.batterPick,
        bowlerPick: data.bowlerPick,
        runsScored: data.runsScored,
        out: data.out,
      };
      // Set synchronously (not just via setState) so the very next socket
      // event — which can arrive before this render commits — sees it.
      revealRef.current = nextReveal;
      setReveal(nextReveal);
      if (data.batterId === myId) {
        setMyRuns(data.totalRuns);
        runsRef.current.myRuns = data.totalRuns;
      } else {
        setOpponentRuns(data.totalRuns);
        runsRef.current.opponentRuns = data.totalRuns;
      }
      clearTimer();
    });

    socket.on(HC.INNINGS_OVER, () => {
      // Purely informational — the next INNINGS_STARTED / SUPER_OVER_STARTED /
      // MATCH_RESULT event drives the actual page transition.
    });

    socket.on(HC.LIVES_UPDATE, (data: { userId: string; lives: number }) => {
      if (data.userId === myId) setMyLives(data.lives);
      else setOpponentLives(data.lives);
    });

    socket.on(HC.MATCH_RESULT, (data: MatchResult & { matchId?: string }) => {
      // Only holds when the match ended on a resolved ball (revealRef set);
      // a forfeit/disconnect end has nothing on screen to wait for.
      afterReveal(() => {
        revealRef.current = null;
        setReveal(null);
        setNextRoundNumber(null);
        setResult(data);
        setPage('match_result');
        setRematchAvailable(data.endCause !== 'dual_unreachable' && data.endCause !== 'lives_forfeit');
        setRematchStatus('idle');
      });
      clearTimer();
    });

    // First player to ask waits; the other gets offered the same request —
    // accepting just re-emits REMATCH_REQUEST, which starts the match once
    // both have confirmed (see backend REMATCH_REQUEST).
    socket.on(HC.REMATCH_WAITING, () => {
      setRematchStatus('waiting');
    });

    socket.on(HC.REMATCH_OFFERED, () => {
      setRematchStatus('offered');
    });

    socket.on(HC.OPPONENT_DISCONNECTED, (_data: { userId: string }) => {
      // Could show a banner
    });

    socket.on(HC.OPPONENT_RECONNECTED, (_data: { userId: string }) => {
      // Could hide the disconnect banner
    });

    socket.on(HC.ERROR, (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(''), 3000);
    });

    socket.on('disconnect', () => {
      // Could show reconnection state
    });

    return () => {
      clearTimer();
      clearHoldTimer();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // Pick timer countdown — only while a ball is in progress and unresolved.
  useEffect(() => {
    if ((page === 'batting' || page === 'super_over') && !reveal) {
      timerRef.current = setInterval(() => {
        setPickTimeLeft((prev) => {
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
  }, [page, reveal]);

  const handleCreate = useCallback((settings: {
    discovery: DiscoveryMode;
    ballsPerInnings: string | number;
    betMode: 'fixed' | 'free';
    stake: number;
    minBet: number | null;
  }) => {
    const balls = Number(settings.ballsPerInnings);
    setBallsPerInnings(balls);
    setStake(settings.stake);
    setBetMode(settings.betMode);
    socketRef.current?.emit(HC.CREATE_MATCH, {
      ballsPerInnings: balls,
      betMode: settings.betMode,
      stake: settings.stake,
      discovery: settings.discovery,
      minBet: settings.minBet ?? undefined,
    });
  }, []);

  const handleJoin = useCallback((id: string) => {
    socketRef.current?.emit(HC.JOIN_MATCH, { matchId: id });
  }, []);

  const handleConfirmStake = useCallback(() => {
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
    // Stay on a waiting state — MATCH_STATE/INNINGS_STARTED move us forward
    // once the server accepts this stake.
    setPage('waiting');
    socketRef.current?.emit(HC.JOIN_MATCH, { matchId: joinStakeInfo.matchId, stake: amount });
  }, [joinStakeInfo, joinStake]);

  const handlePick = useCallback((n: 1 | 2 | 3 | 4 | 5 | 6) => {
    setMySubmitted(true);
    socketRef.current?.emit(HC.PICK_NUMBER, { pick: n });
  }, []);

  const handleRematch = useCallback(() => {
    socketRef.current?.emit(HC.REMATCH_REQUEST, { matchId });
  }, [matchId]);

  const handleBackToGames = useCallback(() => {
    window.location.href = '/dashboard/games';
  }, []);

  const handleRefresh = useCallback(() => {
    socketRef.current?.emit(HC.LIST_MATCHES);
  }, []);

  // --- Render ---

  if (page === 'lobby') {
    return (
      <GameShell title="Hand Cricket">
        <PageTitle title="Hand Cricket" subtitle="1v1 simultaneous-pick cricket" />
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
            <button type="button" onClick={handleRefresh} className="text-xs text-green hover:underline">
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
                  {m.ballsPerInnings} balls/innings ·{' '}
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
      <GameShell title="Hand Cricket">
        <GameSetupWizard
          config={handCricketSetupConfig}
          balance={user?.availableBalance?.toString() ?? null}
          onPublish={handleCreate}
          onBack={() => setPage('lobby')}
        />
      </GameShell>
    );
  }

  if (page === 'waiting' || page === 'waiting_friends') {
    return (
      <GameShell title="Hand Cricket">
        <GameWaitingRoom
          mode={page === 'waiting_friends' ? 'friends' : 'random'}
          roomCode={roomCode}
          waitingText="Waiting for an opponent to join…"
          summary={`${ballsPerInnings} balls/innings · ${betMode === 'fixed' ? 'Fixed' : 'Free'} bet · ${formatSol(String(stake))} SOL`}
          onCancel={handleBackToGames}
        />
      </GameShell>
    );
  }

  if (page === 'join_code') {
    return (
      <GameShell title="Hand Cricket">
        <GameJoinByCode
          onJoin={(code) => socketRef.current?.emit(HC.JOIN_MATCH, { roomCode: code })}
          onBack={() => setPage('lobby')}
        />
      </GameShell>
    );
  }

  // Free Bet joiner: pick a stake before the match can start.
  if (page === 'stake_select' && joinStakeInfo) {
    const accentColor = gameVisual({ name: 'Hand Cricket' }).tone;
    const balance = user?.availableBalance?.toString() ?? null;
    const stakeNum = Number(joinStake) || 0;
    const minBetNum = joinStakeInfo.minBet != null ? Number(joinStakeInfo.minBet) : 0;
    const canAfford = balance === null || stakeNum <= Number(balance);
    const meetsMinimum = stakeNum >= minBetNum;
    return (
      <GameShell title="Hand Cricket">
        <PageTitle
          title="Choose Your Bet"
          subtitle={`Joining ${joinStakeInfo.hostName}'s Free Bet match.`}
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
            accentColor={accentColor}
            canAfford={canAfford}
          />
          {!meetsMinimum && (
            <p className="mb-1 text-xs text-red">Must be at least {formatSol(joinStakeInfo.minBet ?? '0')} SOL.</p>
          )}
          {stakeError && <p className="mb-1 text-xs text-red">{stakeError}</p>}
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            disabled={!joinStake || stakeNum <= 0 || !canAfford || !meetsMinimum}
            onClick={handleConfirmStake}
            style={{ background: accentColor }}
          >
            Join Match
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setJoinStakeInfo(null);
              setStakeError(null);
              setPage('lobby');
            }}
          >
            Back to Lobby
          </Button>
        </Card>
      </GameShell>
    );
  }

  if (page === 'batting' || page === 'super_over') {
    return (
      <GameShell title="Hand Cricket">
        <PageTitle title="Hand Cricket" subtitle={myRole === 'batting' ? 'You are batting' : 'You are bowling'} />
        {error && (
          <div className="mx-auto mb-4 max-w-sm rounded-[10px] border border-red/30 bg-red/10 px-4 py-2 text-center text-xs text-red">
            {error}
          </div>
        )}
        <HandCricketPickBoard
          isSuperOver={page === 'super_over'}
          isHost={isHost}
          myRole={myRole ?? 'batting'}
          myRuns={myRuns}
          opponentRuns={opponentRuns}
          ballsPerInnings={page === 'super_over' ? 6 : ballsPerInnings}
          finishedInnings={finishedInnings}
          ballNumber={ballNumber}
          pickTimeLeft={pickTimeLeft}
          myLives={myLives}
          opponentLives={opponentLives}
          mySubmitted={mySubmitted}
          reveal={reveal}
          nextRoundNumber={nextRoundNumber}
          onPick={handlePick}
        />
      </GameShell>
    );
  }

  if (page === 'match_result' && result) {
    return (
      <GameShell title="Hand Cricket">
        <PageTitle title="Hand Cricket" subtitle="Match Result" />
        <HandCricketResult
          won={result.winnerId === myId}
          myId={myId}
          winnerId={result.winnerId}
          split={result.split}
          innings={result.innings}
          lives={result.lives}
          endCause={result.endCause}
          pot={result.pot}
          feeCollected={result.feeCollected}
          payouts={result.payouts}
          playerNames={Object.fromEntries(players.map((p) => [p.id, p.displayName ?? 'Player']))}
          rematchStatus={rematchStatus}
          onRematch={rematchAvailable ? handleRematch : undefined}
          onBackToGames={handleBackToGames}
        />
      </GameShell>
    );
  }

  return (
    <GameShell title="Hand Cricket">
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="mx-auto" />
      </div>
    </GameShell>
  );
}
