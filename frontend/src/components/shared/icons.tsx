import type { SVGProps } from 'react';

/**
 * The icon set from GamblingHub.dc.html, transcribed path-for-path. The design
 * inlines these as raw SVG strings; here they are components so the stroke
 * colour inherits from `currentColor` the same way.
 */

export type IconName =
  | 'home'
  | 'dice'
  | 'trophy'
  | 'wallet'
  | 'clock'
  | 'user'
  | 'coin'
  | 'bomb'
  | 'chart'
  | 'gamepad'
  | 'shield'
  | 'percent'
  | 'key'
  | 'bolt'
  | 'ticket'
  | 'receipt'
  | 'lockbox'
  | 'gift'
  | 'users'
  | 'cog'
  | 'help'
  | 'play'
  | 'roulette'
  | 'rocket'
  | 'cards'
  | 'lock';

/** The design draws each icon at a specific size; these are those defaults. */
const DEFAULT_SIZE: Record<IconName, number> = {
  home: 19,
  dice: 19,
  trophy: 19,
  wallet: 19,
  clock: 19,
  user: 19,
  coin: 20,
  bomb: 20,
  chart: 20,
  gamepad: 20,
  shield: 20,
  percent: 20,
  key: 18,
  bolt: 18,
  ticket: 19,
  receipt: 19,
  lockbox: 19,
  gift: 19,
  users: 19,
  cog: 19,
  help: 19,
  play: 19,
  roulette: 20,
  rocket: 20,
  cards: 20,
  lock: 18,
};

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h5v-5h2v5h5v-9" />
    </>
  ),
  dice: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5a2 2 0 0 0 2 4" />
      <path d="M16 6h3a2 2 0 0 1-2 4" />
      <path d="M9 21h6" />
      <path d="M12 12v5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5 20c1.2-4 4-5.8 7-5.8s5.8 1.8 7 5.8" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.2" />
    </>
  ),
  bomb: (
    <>
      <circle cx="11" cy="14" r="7" />
      <path d="M15.5 8.5 18 6" />
      <path d="M17 4l3 1-1 3" />
    </>
  ),
  chart: (
    <>
      <path d="M4 17l5-6 4 3 6-8" />
      <path d="M15 6h4v4" />
    </>
  ),
  gamepad: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <path d="M7 10v4M5 12h4" />
      <circle cx="16" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  shield: <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />,
  percent: (
    <>
      <circle cx="7.5" cy="7.5" r="2.6" />
      <circle cx="16.5" cy="16.5" r="2.6" />
      <path d="M18 6L6 18" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M14 9l2 2" />
    </>
  ),
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z" strokeLinejoin="round" />,
  ticket: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M8 6v12" />
      <path d="M12 10h5M12 14h5" />
    </>
  ),
  receipt: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  lockbox: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2.5" />
      <path d="M8 8V6.5a4 4 0 0 1 8 0V8" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="9" width="18" height="11" rx="2" />
      <path d="M3 13h18M12 9v11" />
      <path d="M12 9S10.4 5 8.2 5a2.3 2.3 0 0 0 0 4.6M12 9s1.6-4 3.8-4a2.3 2.3 0 0 1 0 4.6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.9-3.2 3-4.7 5.5-4.7s4.6 1.5 5.5 4.7" />
      <path d="M16 6.4a3 3 0 0 1 0 5.6M17.5 19c-.3-1.6-.9-2.9-1.8-3.8 2.2.2 3.8 1.6 4.5 3.8z" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.2M12 18.8V21M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4A2.5 2.5 0 0 1 14.5 10c0 1.7-2.5 1.9-2.5 3.6" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M8 5.5l10 6.5-10 6.5z" strokeLinejoin="round" />,
  roulette: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6" />
    </>
  ),
  rocket: (
    <>
      <path d="M13.5 4c3.5 0 6.5 3 6.5 6.5 0 4.5-5 8-8 9.5-1.5-3-5-8-5-9.5C7 6.5 10 4 13.5 4z" />
      <circle cx="13.5" cy="10" r="1.8" />
      <path d="M8 16l-2 4 4-2" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="6" width="11" height="14" rx="2.2" />
      <path d="M8 9.5l2.5 3-2.5 3-2.5-3z" />
      <path d="M17 5l3.6 1a2 2 0 0 1 1.3 2.4l-2.6 9.3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </>
  ),
};

export function Icon({
  name,
  size,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const s = size ?? DEFAULT_SIZE[name];
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/* ── one-off chrome icons ─────────────────────────────────────────── */

/** The logo mark: a five-pip die face. */
export function LogoMark({ size = 18, color = 'var(--on-green)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="8.5" cy="8.5" r="1.4" fill={color} stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.4" fill={color} stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.4" fill={color} stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.4" fill={color} stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
    </svg>
  );
}

export function SunIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19v2.4M4.5 12H2M22 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" />
    </svg>
  );
}

export function MoonIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export function ChevronDown({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MenuIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function SearchIcon({ size = 16, color = 'var(--faint)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function BellIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function SignOutIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function InviteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M3 12h18M12 8v12" />
      <path d="M12 8S10 4 7.5 4a2.5 2.5 0 0 0 0 5M12 8s2-4 4.5-4a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

/** The podium marker beside the top three players. */
export function PodiumBadge({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        d="M12 2l2.4 1.8 3-.2 1 2.8 2.4 1.8-1 2.8 1 2.8-2.4 1.8-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8L3.2 15.8l1-2.8-1-2.8 2.4-1.8 1-2.8 3 .2z"
        opacity="0.9"
      />
      <path
        d="M8.6 12.2l2.2 2.2 4.6-4.6"
        stroke="var(--bg2)"
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The "featured game art" placeholder illustration on the overview. */
export function FeaturedArtIcon({ size = 66 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth={1.4} aria-hidden>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <path d="M7 10v4M5 12h4" />
      <circle cx="16" cy="11.5" r="1.2" fill="var(--faint)" stroke="none" />
      <circle cx="18.5" cy="14" r="1.2" fill="var(--faint)" stroke="none" />
    </svg>
  );
}

/** The document glyph on the empty transaction history card. */
export function DocumentIcon({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--muted)"
      strokeWidth={1.6}
      aria-hidden
    >
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}
