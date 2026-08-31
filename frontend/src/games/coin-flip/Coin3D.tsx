import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { mountCoin, type CoinView } from './coin3d';

export interface Coin3DHandle {
  /** Free continuous spin — call while the result isn't known yet. */
  setSpinning: (on: boolean) => void;
  /**
   * Stop spinning and tween to rest on the given face. Rotation
   * accumulates across calls (each land adds a few full turns) so the coin
   * never visibly "snaps back" between rounds.
   */
  landOn: (face: 'heads' | 'tails', durationMs?: number) => void;
}

interface Coin3DProps {
  /** Full turns the coin makes while landing — purely cosmetic flourish. */
  spins?: number;
  className?: string;
}

/**
 * React wrapper around coin3d.ts's imperative Three.js view. The view
 * itself has no game-state opinions — this component just owns the
 * mount/unmount lifecycle and the running rotation total, and exposes a
 * two-method ref API a caller can drive from real match events.
 */
export const Coin3D = forwardRef<Coin3DHandle, Coin3DProps>(function Coin3D({ spins = 3, className }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<CoinView | null>(null);
  const rotationRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const view = mountCoin(el);
    viewRef.current = view;
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setSpinning(on) {
        viewRef.current?.setSpinning(on);
      },
      landOn(face, durationMs = 1100) {
        // Re-base on the last full 360° turn before adding this round's
        // offset — otherwise a "tails" round's +180 lingers in the running
        // total and silently flips the face shown on every later round
        // that doesn't also land on tails, even though the offset it adds
        // is always relative to whatever face was already showing.
        const base = Math.floor(rotationRef.current / 360) * 360;
        rotationRef.current = base + spins * 360 + (face === 'tails' ? 180 : 0);
        viewRef.current?.setSpinning(false);
        viewRef.current?.setTarget(rotationRef.current, durationMs);
      },
    }),
    [spins],
  );

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
});
