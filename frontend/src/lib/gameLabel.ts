/**
 * Turn a game id into something readable: `coin-flip` -> `Coin Flip`.
 *
 * The registry is the real source of display names, but a settled match only
 * stores `gameType` — and a game can be retired from the registry while its
 * matches stay in somebody's history forever. So history has to be able to label a
 * game the registry no longer knows about.
 */
export function gameLabel(gameType: string): string {
  return gameType
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
