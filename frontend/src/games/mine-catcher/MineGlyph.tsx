/**
 * The layered fuse+sphere bomb graphic from `Mine Catcher.dc.html`, built
 * from plain divs (no image asset) so it can be recolored and resized
 * per-context — muted on the placement board, glowing hot on a struck
 * attack cell.
 */
export function MineGlyph({ hot = false, size = '54%' }: { hot?: boolean; size?: string }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute rounded-sm"
        style={{
          left: '52%',
          top: '-24%',
          width: '11%',
          height: '28%',
          transform: 'translateX(-50%) rotate(16deg)',
          background: 'linear-gradient(#8a7660,#39302a)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: '60%',
          top: hot ? '-38%' : '-30%',
          width: hot ? '26%' : '22%',
          height: hot ? '26%' : '22%',
          background: `radial-gradient(circle,#fffbe8,${hot ? '#ff9c2a' : '#ffae3d'} 42%,rgba(255,110,20,0) 74%)`,
          animation: 'mc-spark 1s ease-in-out infinite',
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 32% 26%,#767c82,#2b2f33 48%,#0a0c0e)',
          boxShadow: hot
            ? 'inset -3px -4px 9px rgba(0,0,0,.85), 0 4px 12px rgba(0,0,0,.6), 0 0 18px rgba(248,113,113,.32)'
            : 'inset -3px -4px 8px rgba(0,0,0,.85), 0 3px 9px rgba(0,0,0,.55)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: '22%',
          top: '15%',
          width: '27%',
          height: '17%',
          background: 'linear-gradient(140deg,rgba(255,255,255,.7),rgba(255,255,255,0))',
          filter: 'blur(1px)',
        }}
      />
    </div>
  );
}
