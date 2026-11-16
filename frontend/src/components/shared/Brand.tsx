/**
 * IAM GAME brand assets. The artwork lives in /public/brand as raster files
 * cut from the official logo; these components are the only place that
 * references them, so a future logo swap is a two-file change.
 */

export const BRAND_NAME = 'IAM GAME';

/** The hexagon "G" mark on its own: used where space is tight. */
export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/iamgame-mark.png"
      alt={BRAND_NAME}
      width={size}
      height={size}
      draggable={false}
      className={`block shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** The full lockup (mark + IAM GAME wordmark), set by height. */
export function BrandLogo({ height = 36, className = '' }: { height?: number; className?: string }) {
  // Source artwork is 539×249.
  const width = Math.round((height * 539) / 249);
  return (
    <img
      src="/brand/iamgame-logo.png"
      alt={BRAND_NAME}
      width={width}
      height={height}
      draggable={false}
      className={`block shrink-0 select-none ${className}`}
      style={{ width, height }}
    />
  );
}
