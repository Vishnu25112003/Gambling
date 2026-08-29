import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useTheme } from '../../hooks/useTheme';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed';
import { formatSol, shortAddress } from '../../lib/format';
import { Avatar } from '../shared/Avatar';
import {
  ChevronDown,
  CloseIcon,
  Icon,
  InviteIcon,
  LogoMark,
  MenuIcon,
  MoonIcon,
  PanelIcon,
  SearchIcon,
  SignOutIcon,
  SunIcon,
} from '../shared/icons';
import { UsernamePrompt } from '../profile/UsernamePrompt';
import { AccountMenu } from './AccountMenu';
import { NotificationsMenu } from './NotificationsMenu';
import { NAV_ITEMS } from './nav';

const CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || 'devnet';

/**
 * The row style the design uses for both the sidebar and the mobile drawer.
 *
 * `fill` swaps the fixed 46px height for "share whatever height is left". The
 * drawer uses it so ten nav rows always fit the viewport instead of scrolling —
 * see MobileDrawer.
 */
const navRowClass = (active: boolean, fill = false) =>
  `flex w-full cursor-pointer items-center gap-3 rounded-[11px] border-none px-3
   text-left text-sm font-semibold transition ${fill ? 'h-full min-h-0' : 'min-h-[46px]'} ${
     active ? 'bg-green-solid/[0.14] text-green' : 'bg-transparent text-muted hover:text-text'
   }`;

function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span className="font-bold tracking-[-0.01em]" style={{ fontSize: size }}>
      Infinit <span className="text-green">Respawn</span>
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

function NavRows({
  onNavigate,
  fill = false,
  collapsed = false,
}: {
  onNavigate?: () => void;
  fill?: boolean;
  collapsed?: boolean;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          // basis-0 makes every row an equal share of the leftover space; the
          // max stops them stretching absurdly tall on a big phone, and the min
          // keeps them tappable on a very short one.
          className={fill ? 'block max-h-[46px] min-h-[34px] flex-1 basis-0' : 'block'}
        >
          {({ isActive }) => (
            <span
              className={`${navRowClass(isActive, fill)} ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex shrink-0">
                <Icon name={item.icon} />
              </span>
              {!collapsed && <span>{item.label}</span>}
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

  // The `bare` variant sits in the drawer's fixed footer, where every pixel is
  // taken from the nav above it — so it sizes to its content instead of
  // reserving a 46px slot.
  const base = bare
    ? 'flex w-full cursor-pointer items-center gap-3 rounded-[11px] border-none bg-transparent px-3 py-2.5 text-sm font-semibold'
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
        void signOut();
        navigate('/');
      }}
    >
      <SignOutIcon />
      <span>Disconnect</span>
    </button>
  );
}

function ThemeRow({ compact = false, collapsed = false }: { compact?: boolean; collapsed?: boolean }) {
  const { isDark, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        title={collapsed ? (isDark ? 'Light mode' : 'Dark mode') : undefined}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-[11px] border-none bg-transparent px-3 py-2.5 text-sm font-semibold text-muted ${
          collapsed ? 'justify-center px-0' : ''
        }`}
      >
        <span className="flex">{isDark ? <SunIcon /> : <MoonIcon />}</span>
        {!collapsed && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
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

/** Live since doc 09 — the copy now states the real rule, not the design's placeholder. */
function InviteCard() {
  return (
    <div className="relative overflow-hidden rounded-[15px] border border-green-solid/[0.24] bg-[linear-gradient(150deg,rgba(34,197,94,0.16),transparent_70%)] p-[18px]">
      <div className="mb-1.5 text-[14.5px] font-bold text-green">Invite &amp; Earn</div>
      <div className="mb-3.5 max-w-[150px] text-[12.5px] leading-[1.5] text-muted">
        Earn 5% of your friend&rsquo;s first winning game.
      </div>
      <NavLink
        to="/dashboard/affiliates"
        className="flex w-fit cursor-pointer items-center gap-2 rounded-[9px] border border-green-solid/30 bg-green-solid/[0.16] px-3.5 py-[9px] text-[12.5px] font-bold text-green"
      >
        <InviteIcon />
        Invite Now
      </NavLink>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    /*
      Fixed, not sticky: the sidebar pins to the viewport edge and never
      scrolls with the page. The inner nav scrolls independently (with a neat
      slim scrollbar) only when its rows outgrow the leftover space.
    */
    <aside
      className={`fixed inset-y-0 left-0 z-20 flex shrink-0 flex-col border-r border-line2 bg-bg2 px-3 pt-[18px] pb-5 transition-[width] duration-200 ease-out ${
        collapsed ? 'w-[82px]' : 'w-[264px]'
      }`}
    >
      <div className="flex shrink-0 items-center gap-[11px] no-underline">
        <Link to="/" className="flex items-center gap-[11px] no-underline">
          <LogoBadge box={38} glyph={20} />
          {!collapsed && <Wordmark />}
        </Link>
      </div>

      {/* A minimal, styled scrollbar for when the nav overflows its height. */}
      <nav
        className="nav-scroll mt-5 flex min-h-0 flex-1 flex-col gap-[3px] overflow-x-hidden overflow-y-auto pb-2"
      >
        <NavRows collapsed={collapsed} />
      </nav>

      {/* Collapse / expand toggle, pinned to the bottom above the footer. */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-card text-[13px] font-semibold text-muted transition hover:text-text ${
          collapsed ? 'justify-center px-0' : 'px-3.5'
        }`}
      >
        <PanelIcon />
        {!collapsed && <span>Collapse</span>}
      </button>

      <div className="mt-3 flex shrink-0 flex-col gap-3">
        {!collapsed && <InviteCard />}
        <ThemeRow compact={collapsed} collapsed={collapsed} />
        {!collapsed && (
          <p className="text-[11.5px] leading-[1.5] text-faint">
            © 2026 Infinit Respawn
            <br />
            All rights reserved.
          </p>
        )}
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
      <div onClick={onClose} aria-hidden className="fixed inset-0 z-[90] bg-black/55" />

      {/*
        Exactly one viewport tall, and never scrolls.
        `dvh` rather than `vh` because mobile browsers shrink the visible area
        when their address bar is showing — `100vh` measures the *expanded*
        viewport, so the footer would sit below the fold on first paint.
        `overflow-hidden` is the guarantee: the nav in the middle is the only
        flexible part, and its rows divide whatever is left over.
      */}
      <div className="fixed top-0 bottom-0 left-0 z-[100] flex h-[100dvh] w-[min(78vw,272px)] flex-col overflow-hidden border-r border-line bg-bg2 px-3.5 py-3.5">
        <div className="flex shrink-0 items-center justify-between">
          <Link to="/" onClick={onClose} className="flex items-center gap-2.5 no-underline">
            <LogoBadge box={32} glyph={17} />
            <Wordmark size={15.5} />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-card text-muted"
          >
            <CloseIcon />
          </button>
        </div>

        <DrawerAccount onNavigate={onClose} />

        <nav className="flex min-h-0 flex-1 flex-col gap-[3px] py-2.5">
          <NavRows onNavigate={onClose} fill />
        </nav>

        <div className="flex shrink-0 flex-col gap-0.5 border-t border-line2 pt-2">
          <ThemeRow compact />
          <SessionButton bare onDone={onClose} />
        </div>
      </div>
    </>
  );
}

/**
 * Who you are, in the drawer.
 *
 * The top bar's account menu is desktop-only — there is no room for it beside a
 * hamburger and a balance chip — so on mobile this is where the wallet address
 * lives. Tapping it opens Settings rather than doing anything destructive.
 */
function DrawerAccount({ onNavigate }: { onNavigate: () => void }) {
  const { isAuthenticated, user, balance } = useAuth();

  if (!isAuthenticated || !user) return null;

  return (
    <NavLink
      to="/dashboard/settings"
      onClick={onNavigate}
      // Hidden below 620px of viewport height. The nav rows are the only thing
      // that can absorb this block's ~62px, and below that they would be pushed
      // under their 34px floor — at which point the last item is clipped by the
      // drawer's `overflow-hidden`. Losing a convenience beats losing Support.
      className="mt-3 flex shrink-0 items-center gap-2.5 rounded-xl border border-line bg-card px-2.5 py-2 [@media(max-height:619px)]:hidden"
    >
      <Avatar
        src={user.avatarUrl}
        address={user.walletAddress}
        name={user.username ?? undefined}
        size={32}
        radiusRatio={0.28}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[12px] font-semibold">
          {user.username || shortAddress(user.walletAddress, 5)}
        </span>
        <span className="block text-[11px] text-green">
          {formatSol(balance?.availableBalance ?? '0')} SOL
        </span>
      </span>
    </NavLink>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const isMobile = useIsMobile();
  const { isAuthenticated, isAuthenticating, balance, signIn } = useAuth();

  return (
    <div className="sticky top-0 z-40 mb-4 border-b border-line2 bg-bg pt-3.5 pb-3">
      <div className="mb-3.5 max-w-full rounded-[9px] bg-banner p-[7px] text-center text-[12.5px] font-medium text-gold">
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

          {/*
            The bell is shown on every width — a settled match or a credited
            deposit is worth knowing about on a phone too. The account menu is
            desktop-only, because there is no room for it beside a hamburger and
            a balance chip; on mobile that identity lives in the drawer.
          */}
          {isAuthenticated && <NotificationsMenu enabled={isAuthenticated} />}

          {!isMobile &&
            (isAuthenticated ? (
              <AccountMenu />
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
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { pathname } = useLocation();

  // The drawer belongs to a viewport, not to a route — close it on both changes.
  useEffect(() => setMenuOpen(false), [pathname, isMobile]);

  return (
    <div
      className={`flex min-h-screen ${isMobile ? '' : collapsed ? 'pl-[82px]' : 'pl-[264px]'}`}
      style={{
        background:
          'radial-gradient(ellipse 900px 500px at 50% -10%, rgba(34,197,94,var(--page-glow)), transparent 60%), var(--bg)',
      }}
    >
      {!isMobile && <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />}
      {isMobile && <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />}

      <div className="min-w-0 flex-1 px-[clamp(14px,3vw,36px)] pb-[60px]">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <Outlet />
      </div>

      {/* Doc 11 — one-time, skippable, and renders nothing unless the signed-in
          account still has no handle. Mounted here rather than per-page so it
          appears from whichever dashboard section the sign-in happened on. */}
      <UsernamePrompt />
    </div>
  );
}
