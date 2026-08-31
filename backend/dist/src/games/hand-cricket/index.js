import { handCricketManifest } from './manifest.js';
import { registerHandCricketSocket } from './socket.js';
/**
 * Game 05: Hand Cricket — a strictly 1v1 hand cricket game.
 *
 * Each ball, both players simultaneously pick a number 1-6 — matching
 * numbers is an out, otherwise the batter scores that many runs. Two
 * innings, most runs wins; ties go to a 6-ball Super Over. A 3-lives system
 * overrides the generic disconnect rule.
 *
 * Fee mode: pooled (5% of pot taken at settlement by escrow).
 * Player count: 1v1 (winner-take-all).
 * Discovery: Random + Friends + Rematch (all three Rule 4 modes).
 *
 * See Gambling_Docs/Games/G05-Hand-Cricket.md for the full specification.
 */
const handCricketGame = {
    manifest: handCricketManifest,
    registerSocket: registerHandCricketSocket,
    init() {
        // No persistent state to initialise — active matches live in-memory.
    },
    shutdown() {
        // Active matches will be orphaned and recovered by escrow's
        // recoverOpenMatches() on next boot — doc 03's crash rule.
    },
};
export default handCricketGame;
//# sourceMappingURL=index.js.map