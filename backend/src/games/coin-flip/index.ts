import type { GameModule } from '../types.js';
import { coinFlipManifest } from './manifest.js';
import { registerCoinFlipSocket } from './socket.js';

/**
 * Game 01: Coin Flip — a 1v1 coin-flip prediction game.
 *
 * One player spins, the other calls Head or Tail under a countdown,
 * across multiple rounds, with the round-winner spinning next.
 *
 * Fee mode: pooled (5% of pot taken at settlement by escrow).
 * Player count: 1v1 (winner-take-all).
 * Discovery: Random + Friends + Rematch (all three Rule 4 modes).
 *
 * See Gambling_Docs/Games/G01-Coin-Flip.md for the full specification.
 */
const coinFlipGame: GameModule = {
  manifest: coinFlipManifest,

  registerSocket: registerCoinFlipSocket,

  init() {
    // No persistent state to initialise — active matches live in-memory
    // and round records go to the DB on the fly.
  },

  shutdown() {
    // Active matches will be orphaned and recovered by escrow's
    // recoverOpenMatches() on next boot — doc 03's crash rule.
  },
};

export default coinFlipGame;
