import { Link, NavLink, Outlet } from 'react-router-dom';
import { ConnectWalletButton } from './ConnectWalletButton';

const CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || 'devnet';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <span className="text-2xl" aria-hidden>
        🎲
      </span>
      <span>
        Gambling<span className="text-neon-400">Hub</span>
      </span>
    </Link>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Devnet banner — the compliance note in 00-Overview.md means this must
          never be mistaken for real-money play. */}
      <div className="bg-gold-500/10 px-4 py-1.5 text-center text-xs font-medium text-gold-400">
        Playing on Solana <span className="uppercase">{CLUSTER}</span> — test SOL only, no real
        money.
      </div>

      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {[
              { to: '/dashboard', label: 'Games' },
              { to: '/dashboard/leaderboard', label: 'Leaderboard' },
              { to: '/dashboard/wallet', label: 'Wallet' },
              { to: '/dashboard/history', label: 'History' },
              { to: '/dashboard/profile', label: 'Profile' },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 font-medium transition ${
                    isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-400 hover:text-ink-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <ConnectWalletButton size="sm" />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink-800 px-4 py-6">
        <p className="mx-auto max-w-6xl text-center text-xs text-ink-400">
          Gambling Hub · Devnet build · Not for real-money play pending legal review.
        </p>
      </footer>
    </div>
  );
}
