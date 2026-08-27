/**
 * Faint grid-line texture, fixed behind the page. Shared across every game
 * screen via GameShell — the ambient glow color stays with each caller
 * (GameShell's own radial gradient uses the brand green + --bg/--page-glow),
 * this component only supplies the reusable line pattern layered on top.
 */
export function GridBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
      }}
    />
  );
}
