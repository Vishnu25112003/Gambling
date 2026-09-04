/**
 * Shared "it's your turn" attention cue — a big centered popup shown only on
 * the active player's own screen when a fresh turn starts. Modeled on
 * `games/trumpcard/RoundRevealOverlay.tsx`'s pattern (`fixed inset-0 z-50`,
 * the existing `.animate-fade-up` utility, no animation library).
 *
 * This component only renders the popup — it does not own timing. The caller
 * decides when to show/hide it (see `Gambling_Docs/12-Game-UI-Conventions.md`
 * for the standard sequencing every game should use: show for ~2.5s, then
 * hide and start that game's own turn countdown).
 */
export function TurnBanner({ show, label = 'Your Turn' }: { show: boolean; label?: string }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,26,0.55)] px-4 backdrop-blur-sm">
      <div className="animate-fade-up rounded-[28px] border border-gold/40 bg-[rgba(13,34,78,0.92)] px-12 py-8 text-center shadow-[0_20px_60px_rgba(0,0,0,.5)]">
        <p className="text-3xl font-extrabold tracking-wide text-gold sm:text-4xl">{label}</p>
      </div>
    </div>
  );
}
