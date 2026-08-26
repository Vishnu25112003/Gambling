import type { GameModule } from '../types.js';
import { mineCatcherManifest } from './manifest.js';
import { registerMineCatcherSocket } from './socket.js';

/**
 * Game 03: Mine Catcher — a 1v1 Battleship-style mine-hunting race.
 *
 * Each player hides 10 mines on their own grid, then takes turns
 * attacking the opponent's board. First to find all 10 wins instantly.
 * A 3-lives system overrides the generic disconnect rule.
 *
 * Fee mode: pooled (5% of pot taken at settlement by escrow).
 * Player count: 1v1 (winner-take-all).
 * Discovery: Random + Friends + Rematch (all three Rule 4 modes).
 *
 * See Gambling_Docs/Games/G03-Mine-Catcher.md for the full specification.
 */
const mineCatcherGame: GameModule = {
  manifest: mineCatcherManifest,

  registerSocket: registerMineCatcherSocket,

  init() {
    // No persistent state to initialise — active matches live in-memory.
  },

  shutdown() {
    // Active matches will be orphaned and recovered by escrow's
    // recoverOpenMatches() on next boot — doc 03's crash rule.
  },
};

export default mineCatcherGame;
