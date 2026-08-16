import { useEffect, useRef, type CSSProperties } from 'react';
import type { SceneDisposer, SceneName } from '../../three/siteScenes';

/**
 * Mounts one of the design's three WebGL scenes onto a canvas.
 *
 * three.js is pulled in with a dynamic import so it lands in its own chunk:
 * the page renders, and the scene fades in once the chunk arrives. If it fails
 * to load — an offline reload, a blocked request, no WebGL — nothing breaks;
 * the canvas simply stays transparent and the layout around it is unchanged,
 * because every scene here is decoration behind real content.
 */
export function SceneCanvas({
  scene,
  className,
  style,
}: {
  scene: SceneName;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let dispose: SceneDisposer | undefined;

    void import('../../three/siteScenes')
      .then((mod) => {
        if (cancelled || !ref.current) return;
        try {
          dispose = mod.SCENES[scene](ref.current);
        } catch (err) {
          console.error('3D mount failed', scene, err);
        }
      })
      .catch((err) => console.error('3D scenes failed to load', err));

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [scene]);

  return <canvas ref={ref} aria-hidden className={className} style={style} />;
}
