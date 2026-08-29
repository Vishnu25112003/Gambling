import { ludoManifest } from './manifest.js';
import { registerLudoSocket } from './socket.js';
/**
 * Game 02: Ludo — a 2–4 player Ludo game.
 *
 * Players race 4 tokens around the board to get them all home.
 * The number of paid places scales with how many players actually joined.
 *
 * Fee mode: pooled (5% of pot taken at settlement by escrow).
 * Player count: 2–4 (host chooses at creation).
 * Discovery: Random + Friends (Rule 4's multiplayer extension).
 *
 * See Gambling_Docs/Games/G02-Ludo.md for the full specification.
 */
const ludoGame = {
    manifest: ludoManifest,
    registerSocket: registerLudoSocket,
    init() {
        // No persistent state to initialise — active matches live in-memory
        // and move records go to the DB on the fly.
    },
    shutdown() {
        // Active matches will be orphaned and recovered by escrow's
        // recoverOpenMatches() on next boot — doc 03's crash rule.
    },
};
export default ludoGame;
//# sourceMappingURL=index.js.map