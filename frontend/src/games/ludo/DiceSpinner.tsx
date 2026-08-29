import { useEffect, useRef, useState } from 'react';

interface DiceSpinnerProps {
  /** The settled dice value (1-6), or null before first roll. */
  value: number | null;
  /** True while the dice is visually spinning (server hasn't responded yet). */
  rolling: boolean;
  /** Size in px. */
  size?: number;
}

/**
 * A dice that visually cycles random faces while `rolling`, then settles on
 * `value`. Purely cosmetic — the authoritative value always comes from the
 * server (DICE_ROLLED). This just makes the roll *feel* random instead of
 * instantly snapping to a number.
 */
export function DiceSpinner({ value, rolling, size = 64 }: DiceSpinnerProps) {
  const [face, setFace] = useState<number>(value ?? 1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (rolling) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setFace(Math.floor(Math.random() * 6) + 1);
      }, 70);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (value) setFace(value);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [rolling, value]);

  return (
    <div
      className="flex items-center justify-center rounded-[12px] border-2 border-line bg-bg2"
      style={{ width: size, height: size }}
    >
      <span
        className={`text-3xl font-extrabold ${rolling ? 'animate-bounce' : ''}`}
        style={{ color: rolling ? 'var(--gold)' : 'inherit' }}
      >
        {face}
      </span>
    </div>
  );
}
