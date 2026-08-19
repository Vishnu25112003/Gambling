import { useEffect, useState } from 'react';
import { avatarGradient } from '../../lib/avatar';
import { shortAddress } from '../../lib/format';

/**
 * The one avatar in the app.
 *
 * This used to exist three times — a local component in AccountMenu, a rival
 * five-gradient palette in LeaderboardTable, and the hue function in lib/avatar.ts
 * — which was tolerable while an avatar was only ever a generated gradient. Now
 * that it can be an uploaded image, three implementations would mean three places
 * that have to remember to render it.
 *
 * `lib/avatar.ts` remains the gradient source: one wallet is one colour, in every
 * place it appears.
 */
export function Avatar({
  src,
  address,
  name,
  size = 28,
  /** 0.29 is the design's rounded tile; pass 0.5 for a circle. */
  radiusRatio = 0.29,
  className = '',
}: {
  /** `avatarUrl` from the API. Null/undefined falls back to the gradient. */
  src?: string | null;
  /** Wallet address — the gradient seed, and the most stable identity available. */
  address?: string | null;
  /** Used for the alt text, and as the gradient seed when there is no address. */
  name?: string;
  size?: number;
  radiusRatio?: number;
  className?: string;
}) {
  /**
   * An image that fails to load must degrade to the gradient rather than showing
   * a broken-image glyph: the file can be missing (removed out of band, a failed
   * write) while the row still carries a URL.
   */
  const [failed, setFailed] = useState(false);

  // A new src deserves a fresh attempt — otherwise replacing a broken avatar with
  // a good one leaves the gradient showing until a remount.
  useEffect(() => setFailed(false), [src]);

  /**
   * The seed is ALWAYS the shortened address, never the full one.
   *
   * Different surfaces have different amounts of the address to work with: your
   * own profile has all 44 characters, a public profile and the leaderboard only
   * ever receive `walletShort`. Seeding on whatever each happened to have would
   * give the same player three different colours across the app, which defeats
   * the entire point of a deterministic avatar. `shortAddress` is idempotent — it
   * returns an already-shortened string untouched — so normalising here makes
   * every call site agree without any of them having to care.
   */
  const seed = address ? shortAddress(address) : name || '';
  const borderRadius = size * radiusRatio;
  const label = name || 'Player';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${label}'s profile picture`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`shrink-0 bg-line2 object-cover ${className}`}
        style={{ width: size, height: size, borderRadius }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`${label}'s generated avatar`}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius, background: avatarGradient(seed) }}
    />
  );
}
