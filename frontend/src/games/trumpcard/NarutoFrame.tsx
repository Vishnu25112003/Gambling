import type { ReactNode } from 'react';
import { NARUTO_FONT, NARUTO_PAGE_BACKGROUND } from './narutoTheme';

/**
 * The mock's page-level shell: the ember/noise backdrop + Barlow base font,
 * scoped to whichever Trumpcard screens we reskin (live duel, match result)
 * so the rest of the platform's green theme is untouched.
 */
export function NarutoFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: NARUTO_PAGE_BACKGROUND,
        fontFamily: NARUTO_FONT.body,
        borderRadius: 20,
        padding: 'clamp(14px,3vw,40px) clamp(12px,3vw,32px)',
      }}
    >
      {children}
    </div>
  );
}
