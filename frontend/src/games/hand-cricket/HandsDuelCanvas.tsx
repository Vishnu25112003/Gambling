import { useEffect, useRef, useState } from 'react';
import type { HandsDuelHandle } from '../../three/handsDuel';

/** Plain-emoji stand-ins for signs 0–6, used only when WebGL can't draw the 3D hands. */
const FALLBACK_SIGN = ['✊', '☝️', '✌️', '🤟', '🖖', '🖐️', '👍'];

/**
 * Mounts the two hand-sign models from `handsDuel.ts` onto a canvas —
 * the Hand Cricket counterpart of `SceneCanvas`. three.js is pulled in with
 * a dynamic import so it lands in its own chunk; until it resolves the
 * canvas just stays transparent over the stadium art behind it.
 *
 * If the 3D scene can't run on this device (no WebGL, a lost GPU context, a
 * shader that won't compile, a failed chunk load) the stage switches to flat
 * emoji hands instead of silently showing nothing — the signs are the whole
 * game, so they must never be invisible.
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fallBack = (reason: string, err?: unknown) => {
      console.error(`Hand Cricket 3D hands unavailable (${reason}) — showing 2D signs`, err ?? '');
      handleRef.current?.dispose();
      handleRef.current = null;
      if (!cancelled) setFailed(true);
    };

    void import('../../three/handsDuel')
      .then(({ mountHandsDuel }) => {
        if (cancelled || !canvasRef.current) return;
        handleRef.current = mountHandsDuel(canvasRef.current, (reason) => fallBack(reason));
        handleRef.current.setPose(leftPose, rightPose, shaking);
      })
      .catch((err) => fallBack('load/mount failed', err));

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

  if (failed) {
    const sign = (n: number) => FALLBACK_SIGN[n] ?? FALLBACK_SIGN[0];
    return (
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-around px-[8%]"
        style={{ fontSize: 'clamp(64px,22vw,110px)', lineHeight: 1 }}
      >
        <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }} className={shaking ? 'animate-bounce' : ''}>
          {sign(leftPose)}
        </span>
        <span className={shaking ? 'animate-bounce' : ''}>{sign(rightPose)}</span>
      </div>
    );
  }

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />;
}
