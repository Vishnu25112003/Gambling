import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo, BrandMark } from './Brand';
import { GridBackground } from '../ui/grid-background';

/**
 * Full-screen frame for a game's own themed page. Games are mounted as
 * siblings of /dashboard (see App.tsx), not inside DashboardShell's Outlet —
 * a game gets its own page, not the dashboard's sidebar/topbar wrapped
 * around it. This is the one bit of chrome every game page still needs: a
 * way back to the games list and back to the hub itself.
 */
export function GameShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse 900px 500px at 50% -10%, rgba(24, 200, 180,var(--page-glow)), transparent 60%), radial-gradient(ellipse 700px 600px at 100% 100%, color-mix(in oklab, var(--brand-violet) calc(var(--page-glow) * 70%), transparent), transparent 70%), var(--bg)',
      }}
    >
      <GridBackground />

      <div className="relative z-10">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line2 bg-bg2 px-[clamp(14px,3vw,36px)] py-3">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <BrandMark size={34} className="sm:hidden" />
            <BrandLogo height={40} className="hidden sm:block" />
          </Link>

          <span className="truncate text-sm font-bold text-text">{title}</span>

          <Link
            to="/dashboard/games"
            className="rounded-[9px] border border-line bg-card px-3.5 py-2 text-[12.5px] font-semibold text-muted no-underline hover:text-text"
          >
            ← Games
          </Link>
        </header>

        <div className="px-[clamp(14px,3vw,36px)] py-6 pb-[60px]">{children}</div>
      </div>
    </div>
  );
}
