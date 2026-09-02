/**
 * A CSS 3D-cube die: six real faces built from perspective/preserve-3d,
 * rotated into view by `transform`. Purely presentational — mirrors the
 * `Dice3D.dc.html` component from the Ludo Royale design handoff exactly
 * (same face order, pip layout and rotation math), so the rotation-state
 * logic (spin counters, settle-on-value) lives in the caller, not here.
 */

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  5: [
    [1, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [3, 3],
  ],
  6: [
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
};

/** Face order matches the design: front=1, top=2, right=3, left=4, bottom=5, back=6. */
const FACES: { rotate: string; value: number }[] = [
  { rotate: 'rotateY(0deg)', value: 1 },
  { rotate: 'rotateX(-90deg)', value: 2 },
  { rotate: 'rotateY(90deg)', value: 3 },
  { rotate: 'rotateY(-90deg)', value: 4 },
  { rotate: 'rotateX(90deg)', value: 5 },
  { rotate: 'rotateY(180deg)', value: 6 },
];

function Face({ rotate, value, size }: { rotate: string; value: number; size: string }) {
  return (
    <div
      className="absolute inset-0 box-border grid grid-cols-3 grid-rows-3 rounded-[16%]"
      style={{
        padding: '14%',
        background: 'linear-gradient(150deg,#464c56,#22262d 55%,#15181d)',
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.14), inset 0 -6px 12px rgba(0,0,0,.5)',
        transform: `${rotate} translateZ(calc(${size} * 0.31))`,
      }}
    >
      {PIP_LAYOUT[value].map(([row, col], i) => (
        <span
          key={i}
          className="aspect-square w-[76%] self-center justify-self-center rounded-full"
          style={{
            gridRow: row,
            gridColumn: col,
            background: 'radial-gradient(circle at 34% 28%, #ffffff, #cfd4dd 70%)',
          }}
        />
      ))}
    </div>
  );
}

export interface Dice3DProps {
  /** CSS length, e.g. `"52px"` or `"clamp(40px,min(12vw,11vh),58px)"`. */
  size: string;
  /** CSS transform, e.g. `"rotateX(-18deg) rotateY(24deg)"`. */
  transform: string;
}

export function Dice3D({ size, transform }: Dice3DProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: 900,
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))',
      }}
      className="flex items-center justify-center overflow-hidden"
    >
      <div
        style={{
          position: 'relative',
          width: '62%',
          height: '62%',
          transformStyle: 'preserve-3d',
          transform,
          transition: 'transform 1.15s cubic-bezier(.19,.75,.22,1)',
        }}
      >
        {FACES.map((f) => (
          <Face key={f.value} rotate={f.rotate} value={f.value} size={size} />
        ))}
      </div>
    </div>
  );
}
