import { Dice3D } from './Dice3D';
import type { LudoColor } from './boardGeometry';

const SHADE: Record<LudoColor, { light: string; mid: string; dark: string }> = {
  red: { light: '#ff8f92', mid: '#e8434b', dark: '#a11d24' },
  green: { light: '#84e2a3', mid: '#2fb257', dark: '#12692f' },
  yellow: { light: '#ffd66b', mid: '#e8a900', dark: '#7d5400' },
  blue: { light: '#9ccdf7', mid: '#4a9ae4', dark: '#17518a' },
};

const DICE_SIZE = 'clamp(40px,min(12vw,11vh),58px)';

interface PlayerPodProps {
  color: LudoColor;
  name: string;
  finishedCount: number;
  /** Whose turn it currently is. */
  active: boolean;
  /** This is my pod and I'm free to tap-roll. */
  canRoll: boolean;
  /** Chip/avatar sit on the right instead of the left (mirrors the design's row-reverse pods). */
  reversed?: boolean;
  /** Top pods show pod-then-chip; bottom pods show chip-then-pod. */
  side: 'top' | 'bottom';
  diceTransform: string;
  onRoll?: () => void;
}

export function PlayerPod({
  color,
  name,
  finishedCount,
  active,
  canRoll,
  reversed = false,
  side,
  diceTransform,
  onRoll,
}: PlayerPodProps) {
  const sh = SHADE[color];
  const ring = active ? sh.light : 'rgba(255,255,255,.1)';

  const pod = (
    <div
      onClick={canRoll ? onRoll : undefined}
      role={canRoll ? 'button' : undefined}
      aria-label={canRoll ? 'Roll the dice' : undefined}
      className={canRoll ? 'cursor-pointer animate-[podGlow_1.4s_ease-in-out_infinite]' : ''}
      style={{
        display: 'flex',
        flexDirection: reversed ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 8,
        padding: '6px 9px',
        borderRadius: 15,
        background: active
          ? 'linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.06))'
          : 'rgba(255,255,255,.05)',
        boxShadow: `inset 0 0 0 1.5px ${ring}`,
      }}
    >
      <div
        className="relative flex size-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
        style={{
          background: `radial-gradient(circle at 34% 28%, #ffffff40, ${sh.mid} 70%)`,
          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.35), 0 2px 5px rgba(0,0,0,.4)',
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <Dice3D size={DICE_SIZE} transform={diceTransform} />
    </div>
  );

  const chip = (
    <div
      className="flex items-center gap-1.5 rounded-full bg-black/32 px-[9px] py-[3px]"
      style={{ boxShadow: `inset 0 0 0 1px ${ring}` }}
    >
      <span className="max-w-[96px] truncate text-[11px] font-semibold text-[#dce7fb]">{name}</span>
      <span className="text-[11px] font-bold" style={{ color: sh.mid }}>
        {finishedCount}/4
      </span>
    </div>
  );

  return (
    <div className={`flex flex-col gap-[5px] ${reversed ? 'items-end' : 'items-start'}`}>
      {side === 'top' ? (
        <>
          {pod}
          {chip}
        </>
      ) : (
        <>
          {chip}
          {pod}
        </>
      )}
    </div>
  );
}
