import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useTheme } from '../../hooks/useTheme';
import { formatSol, shortAddress } from '../../lib/format';
import {
  BellIcon,
  ChevronDown,
  CloseIcon,
  Icon,
  InviteIcon,
  LogoMark,
  MenuIcon,
  MoonIcon,
  SearchIcon,
  SignOutIcon,
  SunIcon,
} from '../shared/icons';
import { NAV_ITEMS } from './nav';

const CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || 'devnet';

/** The row style the design uses for both the sidebar and the mobile drawer. */
const navRowClass = (active: boolean) =>
  `flex w-full min-h-[46px] cursor-pointer items-center gap-3 rounded-[11px] border-none px-3
   text-left text-sm font-semibold transition ${
     active ? 'bg-green-solid/[0.14] text-green' : 'bg-transparent text-muted hover:text-text'
   }`;

function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span className="font-bold tracking-[-0.01em]" style={{ fontSize: size }}>
      Gambling<span className="text-green">Hub</span>
    </span>
  );
}

function LogoBadge({ box, glyph }: { box: number; glyph: number }) {
  return (
    <div
      className="flex items-center justify-center bg-[linear-gradient(135deg,var(--green-solid),var(--green-deep))]"
      style={{ width: box, height: box, borderRadius: box * 0.29 }}
    >
      <LogoMark size={glyph} />
    </div>
  );
}

function NavRows({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.key} to={item.to} end={item.end} onClick={onNavigate} className="block">
          {({ isActive }) => (
            <span className={navRowClass(isActive)}>
              <span className="flex shrink-0">
                <Icon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </span>
          )}
        </NavLink>
      ))}
    </>
  );
}

/** Disconnect when there is a session, Connect when there is not. */
function SessionButton({ onDone, bare = false }: { onDone?: () => void; bare?: boolean }) {
  const { isAuthenticated, isAuthenticating, signIn, signOut } = useAuth();
  const navigate = useNavigate();

  const base = bare
    ? 'flex w-full min-h-[46px] cursor-pointer items-center gap-3 rounded-[11px] border-none bg-transparent px-3 text-sm font-semibold'
    : 'flex w-full min-h-[46px] cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-transparent px-3.5 text-[13.5px] font-semibold';

  if (!isAuthenticated) {
    return (
      <button
        className={`${base} text-green disabled:opacity-60`}
        disabled={isAuthenticating}
        onClick={() => {
          onDone?.();
          void signIn();
        }}
      >
        <Icon name="wallet" size={18} />
        <span>{isAuthenticating ? 'Check your wallet…' : 'Connect Wallet'}</span>
      </button>
    );
  }

  return (
    <button
      className={`${base} text-red`}
      onClick={() => {
        onDone?.();
        signOut();
        navigate('/');
      }}
    >
      <SignOutIcon />
      <span>Disconnect</span>
    </button>
  );
}

function ThemeRow({ compact = false }: { compact?: boolean }) {
  const { isDark, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        className="flex min-h-[46px] w-full cursor-pointer items-center gap-3 rounded-[11px] border-none bg-transparent px-3 text-sm font-semibold text-muted"
      >
        <span className="flex">{isDark ? <SunIcon /> : <MoonIcon />}</span>
        <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="flex min-h-[48px] w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-card px-3.5 text-[13.5px] font-semibold text-text"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex text-muted">{isDark ? <SunIcon /> : <MoonIcon />}</span>
        <span>{isDark ? 'Dark' : 'Light'}</span>
      </span>
      <ChevronDown color="var(--faint)" />
    </button>
  );
}

function InviteCard() {
  return (
    <div className="relative overflow-hidden rounded-[15px] border border-green-solid/[0.24] bg-[linear-gradient(150deg,rgba(34,197,94,0.16),transparent_70%)] p-[18px]">
      <div className="mb-1.5 text-[14.5px] font-bold text-green">Invite &amp; Earn</div>
      <div className="mb-3.5 max-w-[150px] text-[12.5px] leading-[1.5] text-muted">
        Earn 5% of every bet made by your friends.
      </div>
      <button
        className="flex cursor-pointer items-center gap-2 rounded-[9px] border border-green-solid/30 bg-green-solid/[0.16] px-3.5 py-[9px] text-[12.5px] font-bold text-green disabled:cursor-not-allowed disabled:opacity-70"
        disabled
        title="Referrals arrive with the Affiliates section"
      >
        <InviteIcon />
        Invite Now
      </button>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen max-h-screen w-[264px] shrink-0 flex-col gap-5 self-start overflow-y-auto border-r border-line2 bg-bg2 px-4 pt-[18px] pb-5">
      <div className="flex shrink-0 items-center gap-[11px]">
        <LogoBadge box={38} glyph={20} />
        <Wordmark />
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-x-hidden overflow-y-auto pb-2"
        style={{
          maskImage:
            'linear-gradient(to bottom,transparent 0,#000 10px,#000 calc(100% - 14px),transparent 100%)',
        }}
      >
        <NavRows />
      </nav>

      <div className="mt-auto flex shrink-0 flex-col gap-3">
        <InviteCard />
        <ThemeRow />
        <SessionButton />
        <p className="text-[11.5px] leading-[1.5] text-faint">
          © 2026 GamblingHub
          <br />
          All rights reserved.
        </p>
      </div>
    </aside>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Escape closes the drawer, and the body must not scroll behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className="fixed inset-0 z-[90] bg-black/55"
      />
      <div className="fixed top-0 bottom-0 left-0 z-[100] flex w-[min(76vw,270px)] flex-col gap-4 overflow-y-auto border-r border-line bg-bg2 px-4 py-[18px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoBadge box={34} glyph={18} />
            <Wordmark size={16} />
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-card text-muted"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          <NavRows onNavigate={onClose} />
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-line2 pt-3">
          <ThemeRow compact />
          <SessionButton bare onDone={onClose} />
        </div>
      </div>
    </>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const isMobile = useIsMobile();
  const { isAuthenticated, isAuthenticating, user, balance, signIn, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-40 mb-4 border-b border-line2 bg-bg pt-3.5 pb-3">
      <div className="mb-3.5 rounded-[9px] bg-banner p-[7px] text-center text-[12.5px] font-medium text-gold">
        Playing on Solana <span className="uppercase">{CLUSTER}</span> — test SOL only, no real
        money.
      </div>

      <div className="flex items-center justify-between gap-2.5">
        {isMobile && (
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-line bg-card text-text"
          >
            <MenuIcon />
          </button>
        )}

        {/* Search lands with the first games; shown as designed but inert. */}
        <div
          aria-hidden
          title="Search arrives with the first games"
          className="flex max-w-[500px] min-w-0 flex-1 items-center gap-[11px] rounded-xl border border-line bg-card px-3.5 py-3"
        >
          <SearchIcon />
          <span className="flex-1 truncate text-[13.5px] text-faint">Search games, players...</span>
          {!isMobile && (
            <span className="shrink-0 rounded-md border border-line bg-line2 px-[7px] py-[3px] font-mono text-[11px] text-faint">
              ⌘ K
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-[11px] border border-green-solid/25 bg-green-solid/10 px-[15px] py-[11px]">
            <Icon name="coin" size={15} className="text-green" />
            <span className="text-sm font-bold whitespace-nowrap text-green">
              {formatSol(balance?.availableBalance ?? '0')} SOL
            </span>
          </div>

          {!isMobile &&
            (isAuthenticated && user ? (
              <>
                <button
                  className="relative flex size-[42px] cursor-pointer items-center justify-center rounded-[11px] border border-line bg-card text-muted"
                  title="Notifications"
                  aria-label="Notifications"
                >
                  <BellIcon />
                  <span className="absolute top-[9px] right-2.5 size-[7px] rounded-full border-[1.5px] border-bg2 bg-green" />
                </button>

                <button
                  onClick={() => {
                    signOut();
                    navigate('/');
                  }}
                  title="Disconnect wallet"
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-card py-[7px] pr-3 pl-2"
                >
                  <span className="size-7 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#2563eb)]" />
                  <span className="font-mono text-[12.5px] font-medium">
                    {user.displayName || shortAddress(user.walletAddress)}
                  </span>
                  <ChevronDown size={14} color="var(--faint)" />
                </button>
              </>
            ) : (
              <button
                onClick={() => void signIn()}
                disabled={isAuthenticating}
                className="cursor-pointer rounded-xl border-none bg-[linear-gradient(135deg,var(--green-solid),var(--green-deep))] px-[18px] py-3 text-[13.5px] font-bold whitespace-nowrap text-on-green disabled:opacity-60"
              >
                {isAuthenticating ? 'Check your wallet…' : 'Connect Wallet'}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The dashboard chrome from the design: a 264px sidebar above 900px, a drawer
 * below it, and a sticky search/balance row over the routed content.
 */
export function DashboardShell() {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // The drawer belongs to a viewport, not to a route — close it on both changes.
  useEffect(() => setMenuOpen(false), [pathname, isMobile]);

  return (
    <div
      className="flex min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse 900px 500px at 50% -10%, rgba(34,197,94,var(--page-glow)), transparent 60%), var(--bg)',
      }}
    >
      {!isMobile && <Sidebar />}
      {isMobile && <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />}

      <div className="min-w-0 flex-1 px-[clamp(14px,3vw,36px)] pb-[60px]">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <Outlet />
      </div>
    </div>
  );
}
