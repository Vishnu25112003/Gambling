import { useEffect, useRef } from 'react';
import type { HandsDuelHandle } from '../../three/handsDuel';

/**
 * Mounts the two hand-sign models from `handsDuel.ts` onto a canvas —
 * the Hand Cricket counterpart of `SceneCanvas`. three.js is pulled in with
 * a dynamic import so it lands in its own chunk; until it resolves the
 * canvas just stays transparent over the stadium art behind it.
 */
export function HandsDuelCanvas({
  leftPose,
  rightPose,
  shaking,
}: {
  leftPose: number;
  rightPose: number;
  shaking: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<HandsDuelHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import('../../three/handsDuel')
      .then(({ mountHandsDuel }) => {
        if (cancelled || !canvasRef.current) return;
        handleRef.current = mountHandsDuel(canvasRef.current);
        handleRef.current.setPose(leftPose, rightPose, shaking);
      })
      .catch((err) => console.error('Hand Cricket 3D hands failed to load', err));

    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
    // Mounted once — pose updates flow through the effect below instead of
    // remounting the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setPose(leftPose, rightPose, shaking);
  }, [leftPose, rightPose, shaking]);

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />;
}
