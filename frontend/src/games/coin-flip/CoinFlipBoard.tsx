import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../hooks/useAuth';
import { tokenStore } from '../../api/client';
import { Button, Card, PageTitle, Spinner } from '../../components/shared/ui';
import { GameShell } from '../../components/shared/GameShell';
import { formatSol } from '../../lib/format';
import { CoinFlipLiveCard } from './CoinFlipLiveCard';
import type { Coin3DHandle } from './Coin3D';

/**
 * Mirror of backend CF_EVENTS — keep in sync with backend/src/games/coin-flip/types.ts
 */
const CF = {
  JOIN_MATCH: 'cf:join',
  CREATE_MATCH: 'cf:create',
  LIST_MATCHES: 'cf:list',
  SPIN: 'cf:spin',
  CALL: 'cf:call',
  REMATCH_REQUEST: 'cf:rematch:request',
  MATCH_STATE: 'cf:state',
  MATCH_CREATED: 'cf:created',
  MATCHES_LIST: 'cf:matches',
  ROUND_START: 'cf:round:start',
  COMMIT_HASH: 'cf:commit',
  SPIN_STARTED: 'cf:spin:started',
  CALL_MADE: 'cf:call:made',
  ROUND_RESULT: 'cf:round:result',
  MATCH_RESULT: 'cf:match:result',
  REMATCH_WAITING: 'cf:rematch:waiting',
  REMATCH_OFFERED: 'cf:rematch:offered',
  OPPONENT_DISCONNECTED: 'cf:opponent:disconnect',
  OPPONENT_RECONNECTED: 'cf:opponent:reconnect',
  ERROR: 'cf:error',
} as const;

const ROUND_OPTIONS = [3, 5, 7, 9, 11, 13, 15] as const;

// Mirrors backend/src/games/coin-flip/engine.ts SPIN_TIMEOUT_MS / CALL_TIMEOUT_MS —
// the two 10s action timers are deliberately symmetric (see G01-Coin-Flip.md).
const SPIN_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 10_000;

/**
 * Round phase, driven by the same server events as the round record itself:
 * ROUND_START -> pre_spin (spinner has SPIN_TIMEOUT_MS to act)
 * SPIN_STARTED -> spinning (caller has CALL_TIMEOUT_MS to call)
 * CALL_MADE -> revealing (server reveals ~2s later, no player action left)
 */
type RoundPhase = 'pre_spin' | 'spinning' | 'revealing';

type Page =
  | 'lobby'
  | 'create_mode'
  | 'create_rounds'
  | 'create_betmode'
  | 'create_amount'
  | 'create_minbet'
  | 'create_review'
  | 'waiting'
  | 'waiting_friends'
  | 'join_code'
  | 'live'
  | 'match_result'
  | 'error';

type DiscoveryMode = 'random' | 'friends';
type BetMode = 'fixed' | 'free';

interface ListedMatch {
  matchId: string;
  hostName: string;
  stake: string;
  rounds: number;
  betMode: BetMode;
  minBet: string | null;
}

interface RoundResult {
  roundNumber: number;
  winnerId: string | null;
  result: 'heads' | 'tails' | null;
  call: 'heads' | 'tails' | null;
  cause: string;
  scores: Record<string, number>;
}

interface MatchResult {
  matchId: string;
  winnerId: string;
  scores: Record<string, number>;
  totalRounds: number;
  roundsPlayed: number;
  pot: string;
  feeCollected: string;
  payouts: { userId: string; payout: string }[];
}

/** Mirrors the fields of backend CoinFlipState (types.ts) this UI needs to restore after a reconnect. */
interface CoinFlipReconnectState {
  totalRounds: number;
  currentRound: number;
  scores: Record<string, number>;
  seats: Record<string, 'spinner' | 'caller'>;
  phase: 'seat_draw' | 'waiting_spin' | 'waiting_call' | 'revealing' | 'round_over' | 'match_over';
  spinStartedAt: number | null;
  callStartedAt: number | null;
}

export function CoinFlipBoard() {
  return (
    <GameShell title="Coin Flip">
      <CoinFlipBoardInner />
    </GameShell>
  );
}

function CoinFlipBoardInner() {
  // `balance` here is the one shared, socket-kept-fresh copy from AuthProvider
  // — every ledger-moving event (deposit, settled match, refund, referral
  // bonus) refreshes it there. This game must not keep its own separate
  // REST-fetched-once copy: that was the actual bug — stake checks here used
  // to run against the pre-match balance until a full page refresh.
  const { user, balance: authBalance, refreshBalance } = useAuth();
  const balance = authBalance?.availableBalance ?? null;

  // --- Socket ---
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  // --- Page navigation ---
  const [page, setPage] = useState<Page>('lobby');
  // Mirrors `page` for the socket-event effect below, which registers its
  // handlers once and would otherwise close over `page`'s initial value —
  // reading state directly there is always stale, since that effect doesn't
  // re-run when `page` changes.
  const pageRef = useRef<Page>('lobby');
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // --- Lobby ---
  const [matches, setMatches] = useState<ListedMatch[]>([]);

  // --- Create flow ---
  const [discovery, setDiscovery] = useState<DiscoveryMode>('random');
  const [rounds, setRounds] = useState<number>(3);
  const [betMode, setBetMode] = useState<BetMode>('fixed');
  const [stake, setStake] = useState('0.1');
  const [minBet, setMinBet] = useState('0.05');
  const [roomCode, setRoomCode] = useState<string | null>(null);

  // --- Friends join ---
  const [joinCode, setJoinCode] = useState('');

  // --- Live game ---
  const [myId, setMyId] = useState<string | null>(user?.id ?? null);
  const [matchId, setMatchId] = useState<string | null>(null);
  // Mirrored into a ref so the 'connect' handler below — registered once,
  // when the socket effect first runs — can read the *current* matchId on a
  // later reconnect instead of closing over the null it started with.
  const matchIdRef = useRef<string | null>(null);
  useEffect(() => {
    matchIdRef.current = matchId;
  }, [matchId]);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<'spinner' | 'caller' | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('pre_spin');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Rematch (Rule 4's third discovery path — same opponent, same
  // settings, both confirm) ---
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'waiting' | 'offered'>('idle');

  // Driven directly from SPIN_STARTED / ROUND_RESULT below — the 3D coin's
  // own spin/land animation has no state of its own in this component.
  const coinRef = useRef<Coin3DHandle>(null);

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
      // Load available matches
      s.emit(CF.LIST_MATCHES, { gameType: 'coin-flip' });

      // A reconnect (network blip, backgrounded tab, socket.io's own ping
      // timeout) drops this socket and opens a brand new one with a new
      // socket.id — the server's per-match socketIds map (used to target
      // every broadcast, see backend socket.ts's broadcastToMatch) still
      // points at the dead one. If we were mid-match when that happened,
      // rejoin with the known matchId so the server updates that mapping
      // and replies with a fresh snapshot — otherwise every event for the
      // rest of the match silently goes nowhere and the screen just never
      // updates again. No-op on the very first connect (matchIdRef is null
      // until a match actually starts).
      if (matchIdRef.current) {
        s.emit(CF.JOIN_MATCH, { matchId: matchIdRef.current });
      }
    });

    s.on(CF.MATCHES_LIST, (data: { matches: ListedMatch[] }) => {
      setMatches(data.matches);
    });

    s.on(CF.MATCH_CREATED, (data: { matchId: string; roomCode?: string }) => {
      // Deliberately doesn't set matchId here — the match doesn't exist in
      // the server's ActiveMatch map until a second player joins (see
      // beginMatch in socket.ts), only in the pre-match public listing. If
      // matchIdRef pointed at it and this socket reconnected while still
      // waiting for a friend, the 'connect' handler's rejoin below would
      // hit JOIN_MATCH's "already in this match" branch and bounce us to
      // an error page. matchId is set once the match actually begins,
      // below in MATCH_STATE's `data.players` branch.
      if (data.roomCode) {
        setRoomCode(data.roomCode);
        setPage('waiting_friends');
      } else {
        setPage('waiting');
      }
    });

    s.on(CF.MATCH_STATE, (data: {
      matchId?: string;
      state?: CoinFlipReconnectState;
      message?: string;
      totalRounds?: number;
      players?: { id: string; displayName?: string | null }[];
    }) => {
      if (data.matchId) setMatchId(data.matchId);

      // Reconnect snapshot: the server resends the live state wholesale
      // instead of relying on the events we missed while disconnected.
      if (data.state && data.message?.includes('Reconnected')) {
        const state = data.state;
        setRoundNumber(state.currentRound);
        setTotalRounds(state.totalRounds);
        setScores(state.scores);
        setMyRole(state.seats[user.id] === 'spinner' ? 'spinner' : 'caller');
        setRoundPhase(
          state.phase === 'waiting_call'
            ? 'spinning'
            : state.phase === 'revealing' || state.phase === 'round_over'
              ? 'revealing'
              : 'pre_spin',
        );
        setPage('live');

        if (state.phase === 'waiting_spin' && state.spinStartedAt) {
          startTimer(Math.max(0, SPIN_TIMEOUT_MS - (Date.now() - state.spinStartedAt)));
        } else if (state.phase === 'waiting_call' && state.callStartedAt) {
          startTimer(Math.max(0, CALL_TIMEOUT_MS - (Date.now() - state.callStartedAt)));
        } else {
          clearTimer();
        }
        return;
      }

      // Sent on the initial join — carries `players` + `totalRounds` at the
      // top level.
      const opponent = data.players?.find((p) => p.id !== user.id);
      if (opponent) setOpponentName(opponent.displayName ?? 'Opponent');
      if (data.totalRounds) setTotalRounds(data.totalRounds);
      if (data.message?.includes('Waiting')) setPage('waiting');
    });

    s.on(CF.ROUND_START, (data: { roundNumber: number; spinnerId: string; callerId: string; totalRounds: number }) => {
      setRoundNumber(data.roundNumber);
      setTotalRounds(data.totalRounds);
      setMyRole(data.spinnerId === user.id ? 'spinner' : 'caller');
      setRoundPhase('pre_spin');
      setLastResult(null);
      setPage('live');
      if (data.roundNumber === 1) {
        // A brand-new match — including a rematch's fresh matchId — starts
        // here. Clear the previous match's tally and result so they don't
        // flash stale before the first ROUND_RESULT of this one arrives.
        setScores({});
        setMatchResult(null);
        setRematchStatus('idle');
      }
      // The spinner has SPIN_TIMEOUT_MS to act — both seats see it count down.
      startTimer(SPIN_TIMEOUT_MS);
    });

    s.on(CF.COMMIT_HASH, () => {});

    s.on(CF.SPIN_STARTED, () => {
      setRoundPhase('spinning');
      // The caller has CALL_TIMEOUT_MS to call heads/tails.
      startTimer(CALL_TIMEOUT_MS);
      // Free-spin until ROUND_RESULT tells us the actual face — the result
      // isn't known client-side before then (see the comment there).
      coinRef.current?.setSpinning(true);
    });

    s.on(CF.CALL_MADE, () => {
      // The call is in; the server reveals in ~2s. Nobody is waiting on a
      // clock here, so this is a short "revealing" beat, not a fresh countdown.
      setRoundPhase('revealing');
      clearTimer();
      setTimeLeft(0);
      // Keep the coin spinning through the reveal delay — the caller's
      // guess doesn't determine the coin's actual face, so there's nothing
      // to land on yet.
    });

    s.on(CF.ROUND_RESULT, (data: RoundResult) => {
      clearTimer();
      setLastResult(data);
      setScores(data.scores);
      // No result (e.g. the spinner never spun at all — "no_spin") means
      // there's nothing to land on; otherwise land on the real face.
      if (data.result) coinRef.current?.landOn(data.result);
    });

    s.on(CF.MATCH_RESULT, (data: MatchResult) => {
      clearTimer();
      setMatchResult(data);
      setScores(data.scores);
      setPage('match_result');
      // Belt-and-suspenders: settleMatch's `ledger:new` reaches the shared
      // AuthProvider socket independently and refreshes balance the same
      // way, but this game runs its own separate socket connection — don't
      // depend on event ordering across the two when the result is already
      // known right here.
      void refreshBalance();
    });

    s.on(CF.OPPONENT_DISCONNECTED, () => {});
    s.on(CF.OPPONENT_RECONNECTED, () => {});

    s.on(CF.REMATCH_WAITING, () => setRematchStatus('waiting'));
    s.on(CF.REMATCH_OFFERED, () => setRematchStatus('offered'));

    s.on(CF.ERROR, (data: { message: string }) => {
      // A failed rematch request (offer expired, stake no longer covers it)
      // shouldn't blow away the result screen the player is still looking
      // at — just drop back to plain "Rematch" so they can retry or leave.
      if (pageRef.current === 'match_result') {
        setRematchStatus('idle');
        return;
      }
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
  }, [user, clearTimer, startTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { clearTimer(); socketRef.current?.disconnect(); };
  }, [clearTimer]);

  // --- Actions ---
  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const handleCreateGame = () => {
    setPage('create_mode');
  };

  const handlePublish = () => {
    const s = Number(stake);
    if (!s || s <= 0) { setError('Enter a valid stake.'); setPage('error'); return; }
    if (balance !== null && s > Number(balance)) { setError('Insufficient balance.'); setPage('error'); return; }

    emit(CF.CREATE_MATCH, {
      gameType: 'coin-flip',
      discovery,
      rounds,
      betMode,
      stake: s,
      minBet: betMode === 'free' ? Number(minBet) : undefined,
    });
  };

  const handleJoinRandom = (matchId: string) => {
    // matchId is captured from the server's own MATCH_STATE broadcast once
    // the match actually begins, not here — see the comment in the
    // MATCH_CREATED handler above for why.
    emit(CF.JOIN_MATCH, { matchId });
  };

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return;
    emit(CF.JOIN_MATCH, { roomCode: joinCode.trim().toUpperCase() });
    setPage('waiting');
  };

  const handleSpin = () => emit(CF.SPIN);
  const handleCall = (call: 'heads' | 'tails') => emit(CF.CALL, { call });

  const handleRematch = () => {
    if (!matchResult) return;
    emit(CF.REMATCH_REQUEST, { matchId: matchResult.matchId });
    setRematchStatus('waiting');
  };

  const goHome = () => {
    clearTimer();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setPage('lobby');
    setMatchId(null);
    setMatchResult(null);
    setLastResult(null);
    setScores({});
    setRoundNumber(0);
    setMyRole(null);
    setRoundPhase('pre_spin');
    setOpponentName(null);
    setRoomCode(null);
    setError(null);
    setRematchStatus('idle');
    // Reconnect
    const token = tokenStore.get();
    if (!token || !user) return;
    const BASE = import.meta.env.VITE_API_URL || '';
    const s = io(BASE || '/', { auth: { token }, transports: ['websocket'] });
    socketRef.current = s;
    s.on('connect', () => { setConnected(true); s.emit(CF.LIST_MATCHES, { gameType: 'coin-flip' }); });
    s.on(CF.MATCHES_LIST, (data: { matches: ListedMatch[] }) => setMatches(data.matches));
  };

  const stakeNum = Number(stake) || 0;
  const canAfford = balance === null || stakeNum <= Number(balance);

  // =====================================================================
  // RENDER
  // =====================================================================

  // --- Lobby ---
  if (page === 'lobby') {
    return (
      <>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <PageTitle title="Coin Flip" subtitle="Two ways to play — jump into a random match, or join a friend." />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPage('join_code')} disabled={!connected}>
              👥 Join with Code
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateGame} disabled={!connected}>
              + Create Game
            </Button>
          </div>
        </div>

        {/*
          Random Play (a public, auto-populated list) and Friends Play (a
          private code you enter) are two distinct discovery modes — see Rule
          4. They used to share one screen, with "Join with Code" tucked
          inside/above the random list as if it were a variant of it. Giving
          each its own header-level action keeps them structurally separate:
          this section is Random Play only, and always is.
        */}
        <h2 className="mb-3 text-xs font-bold tracking-wide text-muted uppercase">
          🎲 Random Play — Open Matches
        </h2>

        {!connected ? (
          <Card className="px-6 py-12 text-center">
            <Spinner className="mb-3 size-5" />
            <p className="text-sm text-muted">Connecting…</p>
          </Card>
        ) : matches.length === 0 ? (
          <Card className="px-6 py-12 text-center">
            <span className="mb-3 block text-3xl">🪙</span>
            <p className="mb-1 text-sm font-bold">No open random matches right now</p>
            <p className="text-xs text-muted">
              Create one, or use "Join with Code" above if a friend sent you one.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => (
              <Card key={m.matchId} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-bold">{m.hostName}</p>
                  <p className="text-xs text-muted">
                    {m.rounds} rounds · {m.betMode === 'fixed' ? 'Fixed' : 'Free'} bet
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
        )}
      </>
    );
  }

  // --- Friends Play: Join with code ---
  if (page === 'join_code') {
    return (
      <>
        <PageTitle title="Join with Code" subtitle="Enter a room code from your friend." />
        <Card className="mx-auto max-w-sm px-6 py-8">
          <label className="mb-1 block text-xs font-semibold text-muted">Room Code</label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="mb-4 w-full rounded-[9px] border border-line bg-bg2 px-3.5 py-[11px] text-center text-lg font-bold tracking-widest text-text placeholder:text-faint focus:border-green focus:outline-none"
            placeholder="ABCD"
            maxLength={8}
            autoFocus
          />
          <Button variant="primary" size="lg" className="w-full" onClick={handleJoinByCode} disabled={!joinCode.trim()}>
            Join Match
          </Button>
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setPage('lobby')}>
            Back to Lobby
          </Button>
        </Card>
      </>
    );
  }

  // --- Create: Step 1 — Discovery mode ---
  if (page === 'create_mode') {
    return (
      <>
        <PageTitle title="Create Match" subtitle="Step 1 — How do you want to play?" />
        <div className="mx-auto max-w-sm space-y-3">
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setDiscovery('random'); setPage('create_rounds'); }}
          >
            <p className="mb-1 text-sm font-bold">🎲 Random Play</p>
            <p className="text-xs text-muted">Listed publicly. Anyone can join instantly.</p>
          </button>
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setDiscovery('friends'); setPage('create_rounds'); }}
          >
            <p className="mb-1 text-sm font-bold">👥 Friends Play</p>
            <p className="text-xs text-muted">Private room code. Share it with a friend.</p>
          </button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setPage('lobby')}>
            Back
          </Button>
        </div>
      </>
    );
  }

  // --- Create: Step 2 — Rounds ---
  if (page === 'create_rounds') {
    return (
      <>
        <PageTitle title="Create Match" subtitle="Step 2 — Number of rounds (odd only)" />
        <Card className="mx-auto max-w-sm px-6 py-6">
          <div className="grid grid-cols-4 gap-2">
            {ROUND_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setRounds(r); setPage('create_betmode'); }}
                className={`rounded-[10px] border px-4 py-3 text-sm font-bold transition ${
                  rounds === r
                    ? 'border-green-solid bg-green-solid/15 text-green'
                    : 'border-line bg-bg2 text-text hover:border-green-solid/40'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => setPage('create_mode')}>
            Back
          </Button>
        </Card>
      </>
    );
  }

  // --- Create: Step 3 — Bet mode ---
  if (page === 'create_betmode') {
    return (
      <>
        <PageTitle title="Create Match" subtitle="Step 3 — Bet mode" />
        <div className="mx-auto max-w-sm space-y-3">
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setBetMode('fixed'); setPage('create_amount'); }}
          >
            <p className="mb-1 text-sm font-bold">🔒 Fixed Bet</p>
            <p className="text-xs text-muted">Every player bets the same amount.</p>
          </button>
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setBetMode('free'); setPage('create_amount'); }}
          >
            <p className="mb-1 text-sm font-bold">🆓 Free Bet</p>
            <p className="text-xs text-muted">Each player picks their own amount. Set a minimum to prevent lowball.</p>
          </button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setPage('create_rounds')}>
            Back
          </Button>
        </div>
      </>
    );
  }

  // --- Create: Step 4 — Bet amount ---
  if (page === 'create_amount') {
    return (
      <>
        <PageTitle title="Create Match" subtitle={`Step 4 — ${betMode === 'fixed' ? 'Bet' : 'Your bet'} amount (SOL)`} />
        <Card className="mx-auto max-w-sm px-6 py-6">
          {balance !== null && (
            <p className="mb-4 text-xs text-muted">
              Balance: <span className="font-bold text-text">{formatSol(balance)} SOL</span>
            </p>
          )}
          <label className="mb-1 block text-xs font-semibold text-muted">Amount (SOL)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="mb-1 w-full rounded-[9px] border border-line bg-bg2 px-3.5 py-[11px] text-sm text-text placeholder:text-faint focus:border-green focus:outline-none"
            placeholder="0.1"
          />
          {!canAfford && <p className="mb-2 text-xs text-red">Insufficient balance.</p>}
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            disabled={!stake || Number(stake) <= 0 || !canAfford}
            onClick={() => betMode === 'free' ? setPage('create_minbet') : setPage('create_review')}
          >
            {betMode === 'free' ? 'Next' : 'Review'}
          </Button>
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setPage('create_betmode')}>
            Back
          </Button>
        </Card>
      </>
    );
  }

  // --- Create: Step 5 — Min bet (free bet only) ---
  if (page === 'create_minbet') {
    return (
      <>
        <PageTitle title="Create Match" subtitle="Step 5 — Minimum bet for joiners (SOL)" />
        <Card className="mx-auto max-w-sm px-6 py-6">
          <p className="mb-4 text-xs text-muted">
            Joiners must stake at least this much. Protects against lowball.
          </p>
          <label className="mb-1 block text-xs font-semibold text-muted">Minimum bet (SOL)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={minBet}
            onChange={(e) => setMinBet(e.target.value)}
            className="mb-1 w-full rounded-[9px] border border-line bg-bg2 px-3.5 py-[11px] text-sm text-text placeholder:text-faint focus:border-green focus:outline-none"
            placeholder="0.05"
          />
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            disabled={!minBet || Number(minBet) <= 0}
            onClick={() => setPage('create_review')}
          >
            Review
          </Button>
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setPage('create_amount')}>
            Back
          </Button>
        </Card>
      </>
    );
  }

  // --- Create: Step 6 — Review & Publish ---
  if (page === 'create_review') {
    return (
      <>
        <PageTitle title="Create Match" subtitle="Review your match settings" />
        <Card className="mx-auto max-w-sm px-6 py-6">
          <div className="mb-5 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Mode</span><span className="font-bold">{discovery === 'random' ? '🎲 Random Play' : '👥 Friends Play'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Rounds</span><span className="font-bold">{rounds}</span></div>
            <div className="flex justify-between"><span className="text-muted">Bet mode</span><span className="font-bold">{betMode === 'fixed' ? '🔒 Fixed' : '🆓 Free'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Your stake</span><span className="font-bold text-green">{formatSol(stake)} SOL</span></div>
            {betMode === 'free' && (
              <div className="flex justify-between"><span className="text-muted">Min for joiner</span><span className="font-bold">{formatSol(minBet)} SOL</span></div>
            )}
          </div>
          {!canAfford && <p className="mb-3 text-xs text-red">Insufficient balance.</p>}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!canAfford}
            onClick={handlePublish}
          >
            Publish Match
          </Button>
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setPage(betMode === 'free' ? 'create_minbet' : 'create_amount')}>
            Back
          </Button>
        </Card>
      </>
    );
  }

  // --- Waiting (Friends Play) — show the room code ---
  if (page === 'waiting_friends') {
    return (
      <>
        <PageTitle title="Friends Play" subtitle="Share this code with your friend." />
        <Card className="mx-auto max-w-md px-6 py-10 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Room Code</p>
          <p className="mb-1 text-4xl font-extrabold tracking-[0.35em] text-green">{roomCode}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => { if (roomCode) void navigator.clipboard?.writeText(roomCode); }}
          >
            Copy Code
          </Button>

          <div className="mt-8 flex flex-col items-center">
            <Spinner className="mb-3 size-5" />
            <p className="text-sm text-muted">Waiting for your friend to join…</p>
          </div>

          <p className="mt-4 text-xs text-faint">
            {formatSol(stake)} SOL · {rounds} rounds · {betMode === 'fixed' ? 'Fixed' : 'Free'} bet
          </p>
          <Button variant="ghost" size="sm" className="mt-6" onClick={goHome}>Cancel</Button>
        </Card>
      </>
    );
  }

  // --- Waiting (Random) ---
  if (page === 'waiting') {
    return (
      <>
        <PageTitle title="Coin Flip" />
        <Card className="mx-auto max-w-md px-6 py-12 text-center">
          <Spinner className="mb-4 size-6" />
          <p className="text-sm text-muted">
            {roomCode ? 'Waiting for friend to confirm…' : 'Waiting for an opponent to join…'}
          </p>
          {roomCode && (
            <div className="mt-4 rounded-[10px] border border-line bg-bg2 px-4 py-3">
              <p className="mb-1 text-xs text-muted">Share this code:</p>
              <p className="text-2xl font-extrabold tracking-widest">{roomCode}</p>
            </div>
          )}
          <p className="mt-3 text-xs text-faint">
            {formatSol(stake)} SOL · {rounds} rounds
          </p>
          <Button variant="ghost" size="sm" className="mt-6" onClick={goHome}>Cancel</Button>
        </Card>
      </>
    );
  }

  // --- Error ---
  if (page === 'error' || error) {
    return (
      <>
        <PageTitle title="Coin Flip" />
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
    return (
      <>
        <PageTitle title="Coin Flip — Match Over" />
        <Card className="mx-auto max-w-md px-6 py-10 text-center">
          <span className="mb-3 block text-5xl">{iWon ? '🏆' : '😢'}</span>
          <p className="mb-1 text-xl font-extrabold">{iWon ? 'You won!' : 'You lost.'}</p>
          <p className="mb-6 text-sm text-muted">{matchResult.roundsPlayed} / {matchResult.totalRounds} rounds</p>
          <div className="mb-6 flex justify-center gap-8">
            <div className="text-center">
              <p className="text-xs text-muted">You</p>
              <p className="text-2xl font-bold">{scores[myId ?? ''] ?? 0}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted">{opponentName ?? 'Opponent'}</p>
              <p className="text-2xl font-bold">{scores[Object.keys(scores).find((k) => k !== myId) ?? ''] ?? 0}</p>
            </div>
          </div>
          <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Pot</span>
              <span className="font-bold">{formatSol(matchResult.pot)} SOL</span>
            </div>
            {iWon && myPayout && (
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-green">Your payout</span>
                <span className="font-bold text-green">{formatSol(myPayout.payout)} SOL</span>
              </div>
            )}
            {Number(matchResult.feeCollected) > 0 && (
              <div className="mt-1 flex justify-between text-xs text-faint">
                <span>Platform fee</span>
                <span>{formatSol(matchResult.feeCollected)} SOL</span>
              </div>
            )}
          </div>
          <Button
            variant="primary"
            className="w-full"
            onClick={handleRematch}
            disabled={rematchStatus === 'waiting'}
          >
            {rematchStatus === 'offered'
              ? 'Accept Rematch'
              : rematchStatus === 'waiting'
                ? 'Waiting for opponent…'
                : 'Rematch'}
          </Button>
          {rematchStatus === 'waiting' && (
            <p className="mt-2 text-xs text-faint">Ask your opponent to click Rematch too.</p>
          )}
          {rematchStatus === 'offered' && (
            <p className="mt-2 text-xs text-green">Your opponent wants a rematch!</p>
          )}
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={goHome}>
            Back to Lobby
          </Button>
        </Card>
      </>
    );
  }

  // --- Live game board ---
  const opponentLabel = opponentName ?? 'your opponent';
  const opponentId = Object.keys(scores).find((k) => k !== myId);

  return (
    <>
      <PageTitle
        title={`Coin Flip — Round ${roundNumber}/${totalRounds}`}
        subtitle={myRole === 'spinner' ? `You spin — ${opponentLabel} calls.` : `${opponentLabel} spins — you call.`}
      />
      <div className="mx-auto max-w-lg">
        {roundNumber === 1 && !lastResult && (
          <div className="mb-4 rounded-[12px] border border-green-solid/30 bg-green-solid/10 px-4 py-3 text-center">
            <p className="text-sm font-bold text-green">
              🎉 Match started — {myRole === 'spinner' ? 'you spin' : `${opponentLabel} spins`} first!
            </p>
          </div>
        )}

        <CoinFlipLiveCard
          coinRef={coinRef}
          roundNumber={roundNumber}
          totalRounds={totalRounds}
          myScore={scores[myId ?? ''] ?? 0}
          oppScore={scores[opponentId ?? ''] ?? 0}
          opponentLabel={opponentLabel}
          myRole={myRole}
          roundPhase={roundPhase}
          timeLeft={timeLeft}
          lastResult={lastResult}
          iWonLastRound={lastResult?.winnerId === myId}
          onSpin={handleSpin}
          onCall={handleCall}
          onDismissResult={() => setLastResult(null)}
        />
      </div>
    </>
  );
}
