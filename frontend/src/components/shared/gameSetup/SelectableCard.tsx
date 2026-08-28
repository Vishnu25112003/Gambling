import type { CSSProperties, ReactNode } from 'react';

/** Big icon-chip + title + description card — discovery mode and bet mode steps. */
export function SelectableCard({
  icon,
  title,
  description,
  selected,
  onClick,
  accentColor,
  accentTint,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  accentColor: string;
  accentTint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        {
          '--accent': accentColor,
          ...(selected ? { borderColor: accentColor, background: accentTint } : {}),
        } as CSSProperties
      }
      className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-[color:var(--accent)]/50"
    >
      <p
        className="mb-1.5 flex items-center gap-2.5 text-sm font-bold"
        style={selected ? { color: accentColor } : undefined}
      >
        <span
          className="flex size-8 items-center justify-center rounded-[10px]"
          style={{ background: accentTint, color: accentColor }}
        >
          {icon}
        </span>
        {title}
      </p>
      <p className="text-xs text-muted">{description}</p>
    </button>
  );
}
