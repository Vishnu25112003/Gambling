/**
 * A profit curve, hand-rolled as inline SVG.
 *
 * No chart library is installed and adding one for a single 30-point line would
 * mean shipping a whole rendering engine to draw one polyline. This is ~40 lines
 * and themes itself, because it draws in `currentColor` and lets the caller decide
 * the colour with a Tailwind text class.
 */
export function Sparkline({
  points,
  height = 72,
  className = '',
  ariaLabel,
}: {
  /** Y values in order. Money as strings — parsed for geometry only, never summed. */
  points: string[];
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  // Parsing money to a number is safe here and only here: the result becomes an
  // SVG coordinate and is never written back as a balance. Same licence
  // lib/format.ts takes for display.
  const values = points.map((p) => Number(p) || 0);

  if (values.length < 2) return null;

  const width = 300;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  // A flat series has zero span, which would divide by nothing and put every
  // point at NaN. Falling back to 1 draws the flat line it actually is.
  const span = max - min || 1;

  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * height;

  const line = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  // Closed back along the baseline so the area under the curve can be tinted.
  const area = `${x(0)},${y(min)} ${line} ${x(values.length - 1)},${y(min)}`;
  const zeroY = y(0);

  const last = values[values.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // The line stretches to the container's width while keeping its stroke
      // weight, which is what `non-scaling-stroke` below is for.
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `Net profit over the last ${values.length} days`}
      className={`block w-full ${className}`}
      style={{ height }}
    >
      {/* Zero baseline, so a curve below it reads as a loss at a glance. */}
      {min < 0 && max > 0 && (
        <line
          x1={0}
          x2={width}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <polyline points={area} fill="currentColor" opacity={0.12} stroke="none" />

      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* The latest value, so the eye lands on where the player stands now. */}
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} fill="currentColor" />
    </svg>
  );
}
