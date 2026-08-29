import { trumpcardManifest } from './manifest.js';
import { registerTrumpcardSocket } from './socket.js';
/**
 * Game 04: Trumpcard — a 2-4 player Top-Trumps-style stat battle.
 *
 * Each player holds an equal-sized pile of 52-card-deck cards. Whoever leads
 * a round picks a stat from their top card; every active player's top card is
 * compared, and the single highest value takes everyone else's card. A
 * combined 3-lives system overrides the generic disconnect rule.
 *
 * Fee mode: pooled (5% of pot taken at settlement by escrow).
 * Player count: 2-4 (host chooses at creation).
 * Discovery: Random + Friends (Rule 4's multiplayer extension). No Rematch —
 * Rule 4's Rematch path is written for two players only.
 *
 * See Gambling_Docs/Games/G04-Trumpcard.md for the full specification.
 */
const trumpcardGame = {
    manifest: trumpcardManifest,
    registerSocket: registerTrumpcardSocket,
    init() {
        // No persistent state to initialise — active matches live in-memory.
    },
    shutdown() {
        // Active matches will be orphaned and recovered by escrow's
        // recoverOpenMatches() on next boot — doc 03's crash rule.
    },
};
export default trumpcardGame;
//# sourceMappingURL=index.js.map