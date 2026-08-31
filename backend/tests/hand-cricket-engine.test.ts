import { describe, it, expect } from 'vitest';
import {
  MAX_LIVES,
  SUPER_OVER_BALLS,
  advanceInnings,
  bothPicksIn,
  checkInningsEnd,
  checkMatchEnd,
  compareRuns,
  createInitialState,
  decrementLife,
  getOpponent,
  markDisconnected,
  markReconnected,
  resolveBall,
  startNewBall,
  startSuperOver,
  submitPick,
} from '../src/games/hand-cricket/engine.js';
import type { HandCricketState, InningsRecord } from '../src/games/hand-cricket/types.js';

const A = 'player-a';
const B = 'player-b';

function innings(overrides: Partial<InningsRecord> & { batterId: string; bowlerId: string }): InningsRecord {
  return {
    ballsPerInnings: 6,
    ballsBowled: 0,
    runs: 0,
    isOut: false,
    ballLog: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<HandCricketState> & { innings: InningsRecord[] }): HandCricketState {
  return {
    ballsPerInnings: 6,
    phase: 'batting',
    lives: { [A]: MAX_LIVES, [B]: MAX_LIVES },
    currentInningsIndex: overrides.innings.length - 1,
    pendingBall: null,
    disconnectedPlayers: [],
    winnerId: null,
    endCause: null,
    ...overrides,
  };
}

describe('hand-cricket engine — initial state', () => {
  it('creates one innings with a random first batter, both players at max lives', () => {
    const state = createInitialState(6, [A, B]);
    expect(state.innings).toHaveLength(1);
    expect([A, B]).toContain(state.innings[0]!.batterId);
    expect([A, B]).toContain(state.innings[0]!.bowlerId);
    expect(state.innings[0]!.batterId).not.toBe(state.innings[0]!.bowlerId);
    expect(state.lives).toEqual({ [A]: MAX_LIVES, [B]: MAX_LIVES });
    expect(state.phase).toBe('batting');
    expect(state.currentInningsIndex).toBe(0);
  });

  it('picks both batters across many draws (no fixed bias)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(createInitialState(6, [A, B]).innings[0]!.batterId);
    }
    expect(seen).toEqual(new Set([A, B]));
  });
});

describe('hand-cricket engine — pick submission and ball resolution', () => {
  it('resolves a non-matching pick as runs scored, no out', () => {
    let state = makeState({ innings: [innings({ batterId: A, bowlerId: B })] });
    state = startNewBall(state);
    state = submitPick(state, A, 4);
    state = submitPick(state, B, 6);

    expect(bothPicksIn(state)).toBe(true);
    const resolved = resolveBall(state);
    expect(resolved).not.toBeNull();
    expect(resolved!.ballResult).toMatchObject({ batterPick: 4, bowlerPick: 6, runsScored: 4, out: false });
    expect(resolved!.state.innings[0]!.runs).toBe(4);
    expect(resolved!.state.innings[0]!.ballsBowled).toBe(1);
    expect(resolved!.state.innings[0]!.isOut).toBe(false);
    expect(resolved!.state.pendingBall).toBeNull();
  });

  it('resolves a matching pick as an out, zero runs', () => {
    let state = makeState({ innings: [innings({ batterId: A, bowlerId: B, runs: 10, ballsBowled: 2 })] });
    state = startNewBall(state);
    state = submitPick(state, A, 3);
    state = submitPick(state, B, 3);

    const resolved = resolveBall(state);
    expect(resolved!.ballResult).toMatchObject({ batterPick: 3, bowlerPick: 3, runsScored: 0, out: true });
    expect(resolved!.state.innings[0]!.runs).toBe(10);
    expect(resolved!.state.innings[0]!.isOut).toBe(true);
  });

  it('does not resolve until both players have picked', () => {
    let state = makeState({ innings: [innings({ batterId: A, bowlerId: B })] });
    state = startNewBall(state);
    state = submitPick(state, A, 4);
    expect(bothPicksIn(state)).toBe(false);
    expect(resolveBall(state)).toBeNull();
  });

  it('rejects a pick from a player not in the current innings', () => {
    let state = makeState({ innings: [innings({ batterId: A, bowlerId: B })] });
    state = startNewBall(state);
    const before = state;
    state = submitPick(state, 'stranger', 4);
    expect(state).toEqual(before);
  });
});

describe('hand-cricket engine — innings progression', () => {
  it('checkInningsEnd is true when out, or when balls used up', () => {
    const outState = makeState({ innings: [innings({ batterId: A, bowlerId: B, isOut: true })] });
    expect(checkInningsEnd(outState)).toBe(true);

    const usedUpState = makeState({ innings: [innings({ batterId: A, bowlerId: B, ballsBowled: 6, ballsPerInnings: 6 })] });
    expect(checkInningsEnd(usedUpState)).toBe(true);

    const liveState = makeState({ innings: [innings({ batterId: A, bowlerId: B, ballsBowled: 2, ballsPerInnings: 6 })] });
    expect(checkInningsEnd(liveState)).toBe(false);
  });

  it('advanceInnings swaps batter/bowler roles for the next innings', () => {
    const state = makeState({ innings: [innings({ batterId: A, bowlerId: B, runs: 20, isOut: true })] });
    const next = advanceInnings(state);
    expect(next.innings).toHaveLength(2);
    expect(next.innings[1]!.batterId).toBe(B);
    expect(next.innings[1]!.bowlerId).toBe(A);
    expect(next.innings[1]!.runs).toBe(0);
    expect(next.currentInningsIndex).toBe(1);
  });
});

describe('hand-cricket engine — compareRuns and checkMatchEnd', () => {
  it('compareRuns returns tied when the last two innings scores are equal', () => {
    const state = makeState({
      innings: [
        innings({ batterId: A, bowlerId: B, runs: 30, isOut: true }),
        innings({ batterId: B, bowlerId: A, runs: 30, isOut: true }),
      ],
    });
    expect(compareRuns(state)).toEqual({ decided: false, winnerId: null, tied: true });
  });

  it('compareRuns declares the higher scorer the winner', () => {
    const state = makeState({
      innings: [
        innings({ batterId: A, bowlerId: B, runs: 30, isOut: true }),
        innings({ batterId: B, bowlerId: A, runs: 45, isOut: true }),
      ],
    });
    expect(compareRuns(state)).toEqual({ decided: true, winnerId: B, tied: false });
  });

  it('checkMatchEnd: main match decided by runs', () => {
    const state = makeState({
      innings: [
        innings({ batterId: A, bowlerId: B, runs: 30, isOut: true }),
        innings({ batterId: B, bowlerId: A, runs: 20, isOut: true }),
      ],
    });
    expect(checkMatchEnd(state)).toEqual({ over: true, winnerId: A, endCause: 'runs_higher' });
  });

  it('checkMatchEnd: main match tied -> not over, no winner (caller starts Super Over)', () => {
    const state = makeState({
      innings: [
        innings({ batterId: A, bowlerId: B, runs: 30, isOut: true }),
        innings({ batterId: B, bowlerId: A, runs: 30, isOut: true }),
      ],
    });
    expect(checkMatchEnd(state)).toEqual({ over: false, winnerId: null, endCause: null });
  });

  it('checkMatchEnd: Super Over decides it', () => {
    const state = makeState({
      innings: [
        innings({ batterId: A, bowlerId: B, runs: 30, isOut: true }),
        innings({ batterId: B, bowlerId: A, runs: 30, isOut: true }),
        innings({ batterId: A, bowlerId: B, runs: 8, isOut: true, ballsPerInnings: SUPER_OVER_BALLS }),
        innings({ batterId: B, bowlerId: A, runs: 5, isOut: true, ballsPerInnings: SUPER_OVER_BALLS }),
      ],
    });
    expect(checkMatchEnd(state)).toEqual({ over: true, winnerId: A, endCause: 'super_over_decided' });
  });

  it('checkMatchEnd: Super Over also ties -> even split, no further Super Overs', () => {
    const state = makeState({
      innings: [
        innings({ batterId: A, bowlerId: B, runs: 30, isOut: true }),
        innings({ batterId: B, bowlerId: A, runs: 30, isOut: true }),
        innings({ batterId: A, bowlerId: B, runs: 6, isOut: true, ballsPerInnings: SUPER_OVER_BALLS }),
        innings({ batterId: B, bowlerId: A, runs: 6, isOut: true, ballsPerInnings: SUPER_OVER_BALLS }),
      ],
    });
    expect(checkMatchEnd(state)).toEqual({ over: true, winnerId: null, endCause: 'super_over_tied_split' });
  });

  it('startSuperOver pushes a 6-ball third innings', () => {
    const state = makeState({
      innings: [
        innings({ batterId: A, bowlerId: B, runs: 30, isOut: true }),
        innings({ batterId: B, bowlerId: A, runs: 30, isOut: true }),
      ],
    });
    const withSuperOver = startSuperOver(state);
    expect(withSuperOver.phase).toBe('super_over');
    expect(withSuperOver.innings).toHaveLength(3);
    expect(withSuperOver.innings[2]!.ballsPerInnings).toBe(SUPER_OVER_BALLS);
    expect([A, B]).toContain(withSuperOver.innings[2]!.batterId);
    expect(withSuperOver.currentInningsIndex).toBe(2);
  });
});

describe('hand-cricket engine — lives system', () => {
  it('decrements a life without ending the match while lives remain', () => {
    const state = makeState({ innings: [innings({ batterId: A, bowlerId: B })], lives: { [A]: 2, [B]: 3 } });
    const result = decrementLife(state, A);
    expect(result.lifeLost).toBe(true);
    expect(result.gameOver).toBe(false);
    expect(result.state.lives[A]).toBe(1);
  });

  it('opponent wins by forfeit when a player hits 0 lives and the opponent is reachable', () => {
    const state = makeState({ innings: [innings({ batterId: A, bowlerId: B })], lives: { [A]: 1, [B]: 3 } });
    const result = decrementLife(state, A);
    expect(result.gameOver).toBe(true);
    expect(result.winnerId).toBe(B);
    expect(result.state.endCause).toBe('lives_forfeit');
    expect(result.state.phase).toBe('match_over');
  });

  it('dual-unreachable: platform keeps the pot when the opponent is also disconnected at 0 lives', () => {
    const state = makeState({
      innings: [innings({ batterId: A, bowlerId: B })],
      lives: { [A]: 1, [B]: 3 },
      disconnectedPlayers: [B],
    });
    const result = decrementLife(state, A);
    expect(result.gameOver).toBe(true);
    expect(result.winnerId).toBeNull();
    expect(result.state.endCause).toBe('dual_unreachable');
  });

  it('markDisconnected/markReconnected are idempotent', () => {
    const state = makeState({ innings: [innings({ batterId: A, bowlerId: B })] });
    const once = markDisconnected(state, A);
    const twice = markDisconnected(once, A);
    expect(twice.disconnectedPlayers).toEqual([A]);

    const reconnected = markReconnected(twice, A);
    expect(reconnected.disconnectedPlayers).toEqual([]);
    expect(markReconnected(reconnected, A).disconnectedPlayers).toEqual([]);
  });

  it('getOpponent returns the other player', () => {
    const state = makeState({ innings: [innings({ batterId: A, bowlerId: B })] });
    expect(getOpponent(state, A)).toBe(B);
    expect(getOpponent(state, B)).toBe(A);
  });
});
