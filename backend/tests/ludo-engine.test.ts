import { describe, it, expect } from 'vitest';
import {
  getValidMoves,
  executeMove,
  canOccupyTrackSquare,
  getGlobalPosition,
} from '../src/games/ludo/engine.js';
import type { Token } from '../src/games/ludo/types.js';

const A = 'player-a';
const B = 'player-b';

function track(position: number): Token {
  return { zone: 'track', position, homePosition: 0 };
}
function yard(): Token {
  return { zone: 'yard', position: 0, homePosition: 0 };
}

describe('ludo engine — token blocking', () => {
  it('lets a second token of the same color land on its own token, forming a block', () => {
    // Red token0 at global 5, token1 at global 2 rolling a 3 -> also global 5.
    const aTokens: Token[] = [track(5), track(2), yard(), yard()];
    const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
    const colors = { [A]: 'red' as const, [B]: 'yellow' as const };

    const moves = getValidMoves(aTokens, 3, 'red', allTokens, [A, B], colors);

    expect(moves).toContainEqual({ tokenIndex: 1, type: 'track' });
  });

  it('refuses a third same-color token onto an already-blocked square', () => {
    // Red tokens 0 and 1 already both sit on global 5 (a block). Token 2
    // rolling to land on global 5 too must be rejected.
    const aTokens: Token[] = [track(5), track(5), track(2), yard()];
    const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
    const colors = { [A]: 'red' as const, [B]: 'yellow' as const };

    const moves = getValidMoves(aTokens, 3, 'red', allTokens, [A, B], colors);

    expect(moves).not.toContainEqual({ tokenIndex: 2, type: 'track' });
  });

  it('refuses landing on an opponent block (two of one opposing color)', () => {
    // Red token0 at position 5 rolling a 5 lands on global 10.
    // Yellow (offset 26) needs trackPosition 36 to also land on global 10.
    const aTokens: Token[] = [track(5), yard(), yard(), yard()];
    const bTokens: Token[] = [track(36), track(36), yard(), yard()];
    expect(getGlobalPosition('yellow', 36)).toBe(10);

    const allTokens = { [A]: aTokens, [B]: bTokens };
    const colors = { [A]: 'red' as const, [B]: 'yellow' as const };

    const moves = getValidMoves(aTokens, 5, 'red', allTokens, [A, B], colors);

    expect(moves).not.toContainEqual({ tokenIndex: 0, type: 'track' });
    expect(canOccupyTrackSquare(10, allTokens, [A, B], colors)).toBe(false);
  });

  it('still allows capturing a single, unblocked opponent token (regression)', () => {
    const aTokens: Token[] = [track(5), yard(), yard(), yard()];
    const bTokens: Token[] = [track(36), yard(), yard(), yard()]; // single token, global 10
    const allTokens = { [A]: aTokens, [B]: bTokens };
    const colors = { [A]: 'red' as const, [B]: 'yellow' as const };

    const moves = getValidMoves(aTokens, 5, 'red', allTokens, [A, B], colors);
    expect(moves).toContainEqual({ tokenIndex: 0, type: 'track' });

    const result = executeMove(aTokens, 0, 5, 'red', allTokens, [A, B], colors);
    expect(result.captured).toEqual([{ playerId: B, tokenIndex: 0 }]);
    expect(result.tokens[0]!.position).toBe(10);
  });

  it('refuses leaving the yard onto a start square already blocked by an opponent', () => {
    // Yellow (offset 26) at trackPosition 26 sits on global 0 — red's own
    // start square — as a two-token block.
    expect(getGlobalPosition('yellow', 26)).toBe(0);
    const aTokens: Token[] = [yard(), yard(), yard(), yard()];
    const bTokens: Token[] = [track(26), track(26), yard(), yard()];
    const allTokens = { [A]: aTokens, [B]: bTokens };
    const colors = { [A]: 'red' as const, [B]: 'yellow' as const };

    const moves = getValidMoves(aTokens, 6, 'red', allTokens, [A, B], colors);

    expect(moves).not.toContainEqual({ tokenIndex: 0, type: 'yard' });
  });

  it('still allows the normal yard exit when the start square is clear', () => {
    const aTokens: Token[] = [yard(), yard(), yard(), yard()];
    const allTokens = { [A]: aTokens, [B]: [yard(), yard(), yard(), yard()] };
    const colors = { [A]: 'red' as const, [B]: 'yellow' as const };

    const moves = getValidMoves(aTokens, 6, 'red', allTokens, [A, B], colors);

    expect(moves).toContainEqual({ tokenIndex: 0, type: 'yard' });
  });
});
