import type { CSSProperties, ReactNode } from 'react';
import type { ExtraOption } from './types';

// Tailwind's scanner needs to see the literal class names somewhere in source —
// a template-string `grid-cols-${n}` would silently produce no CSS.
const COLUMN_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/** Compact option grid — rounds / seat count / board size. */
export function OptionPillGrid<T extends string | number>({
  options,
  value,
  onChange,
  columns,
  accentColor,
  accentTint,
  infoBox,
}: {
  options: ExtraOption<T>[];
  value: T;
  onChange: (v: T) => void;
  columns: 2 | 3 | 4;
  accentColor: string;
  accentTint: string;
  infoBox?: ReactNode;
}) {
  return (
    <>
      <div className={`grid gap-2.5 ${COLUMN_CLASS[columns]}`}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              style={
                {
                  '--accent': accentColor,
                  ...(selected ? { borderColor: accentColor, background: accentTint, color: accentColor } : {}),
                } as CSSProperties
              }
              className="rounded-[10px] border border-line bg-bg2 px-4 py-3.5 text-center text-text transition hover:border-[color:var(--accent)]/50"
            >
              <p className="text-xl font-bold">{opt.label}</p>
              {opt.sublabel && <p className="text-[11px] text-muted">{opt.sublabel}</p>}
            </button>
          );
        })}
      </div>
      {infoBox && (
        <div className="mt-4 rounded-[10px] border border-line bg-bg2 px-4 py-3 text-xs text-muted">{infoBox}</div>
      )}
    </>
  );
}
