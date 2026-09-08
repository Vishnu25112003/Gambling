import type { ReactNode } from 'react';
import { Icon, type IconName } from '../shared/icons';

/**
 * Infinit Respawn mockup — shared exact-match primitives for the dashboard's
 * secondary pages (Transactions, My Bets, Escrow, Rewards, Invite & Earn).
 * The mockup repeats the same handful of shapes (a stat tile, a filter-pill
 * row, a bordered section with a header row, a grid-based data table) across
 * every one of those pages with identical measurements — this file is the
 * one place those measurements live, instead of six near-duplicate copies.
 */

/** The `section` wrapper: 18px radius, the design's green-tinted panel border/bg, clamp() padding. */
export function Panel({
  children,
  className = '',
  amber = false,
}: {
  children: ReactNode;
  className?: string;
  /** The amber wash used behind My Bets' "Open Bets" and Rewards' rakeback/streak panels. */
  amber?: boolean;
}) {
  return (
    <section
      className={`rounded-[18px] border p-[clamp(16px,2vw,22px)] ${className}`}
      style={{
        borderColor: amber ? 'var(--amber-border)' : 'var(--panel-border)',
        background: amber
          ? 'linear-gradient(160deg, rgba(240,180,41,.07), rgba(6,9,7,0) 60%), var(--panel-bg)'
          : 'var(--panel-bg)',
      }}
    >
      {children}
    </section>
  );
}

/** The `h2` + right-aligned meta/action row every panel opens with. */
export function PanelHeader({
  title,
  subtitle,
  meta,
  dot,
  action,
}: {
  title: string;
  /** An optional muted one-liner under the title, e.g. "Add it before your first game…". */
  subtitle?: string;
  meta?: ReactNode;
  /** The pulsing live-indicator dot next to "OPEN BETS". */
  dot?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          {dot && (
            <span
              className="size-[7px] shrink-0 rounded-full"
              style={{ background: dot, animation: 'irPulse 1.6s infinite' }}
            />
          )}
          <h2 className="font-heading text-[18px] font-bold tracking-[0.05em] text-text">
            {title}
          </h2>
        </div>
        {subtitle && <p className="mt-1.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {meta && <span className="font-mono text-[11px] text-muted">{meta}</span>}
      {action}
    </div>
  );
}

/**
 * The stat tile repeated across Overview/Transactions/My Bets/Rewards/Invite:
 * a 2px top accent bar, an icon + tracked-mono label, a big Chakra Petch
 * value, and a muted note line.
 */
export function StatTile({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: IconName;
  label: string;
  value: string;
  note?: string;
  color: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[14px] border p-[15px_16px]"
      style={{ borderColor: 'var(--panel-border-soft)', background: 'linear-gradient(180deg, #0c130e, #090e0a)' }}
    >
      <span className="absolute top-0 right-0 left-0 h-[2px]" style={{ background: color }} />
      <div className="flex items-center gap-2">
        <span style={{ color }}>
          <Icon name={icon} size={18} />
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.16em] text-muted">{label}</span>
      </div>
      <div className="mt-[7px] font-heading text-[25px] leading-[1.2] font-bold" style={{ color }}>
        {value}
      </div>
      {note && <div className="text-[11.5px] text-muted">{note}</div>}
    </div>
  );
}

export interface FilterOption<T extends string> {
  key: T;
  label: string;
}

/** The `{display:flex;gap:6px;padding:4px;border-radius:10px}` filter-pill row. */
export function FilterPills<T extends string>({
  options,
  active,
  onChange,
}: {
  options: FilterOption<T>[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-[10px] border p-1"
      style={{ borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg2)' }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className="cursor-pointer rounded-[7px] border-0 px-3.5 py-[7px] font-heading text-[12px] font-semibold tracking-[0.05em]"
          style={
            active === o.key
              ? { background: 'rgba(47,224,138,.16)', color: 'var(--green)' }
              : { background: 'transparent', color: 'var(--muted)' }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A status chip with the exact bg/fg the design assigns per state, not a fixed tone. */
export function StatusChip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span
      className="inline-block rounded-[6px] px-[9px] py-[3px] font-mono text-[10px] tracking-[0.1em]"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

export interface TableColumn {
  label: string;
  align?: 'left' | 'right';
}

/** The grid-based table header: 9.5px tracked IBM Plex Mono labels over a hairline. */
export function TableHead({ template, columns }: { template: string; columns: TableColumn[] }) {
  return (
    <div
      className="grid gap-2.5 border-b px-3 pb-2.5 font-mono text-[9.5px] tracking-[0.16em] text-muted"
      style={{ gridTemplateColumns: template, borderColor: 'var(--panel-border-soft)' }}
    >
      {columns.map((c) => (
        <span key={c.label} className={c.align === 'right' ? 'text-right' : ''}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

/** One data row — the same grid template as `TableHead`, with the design's row hover. */
export function TableRow({
  template,
  children,
  padded = true,
}: {
  template: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={`table-row-hover grid items-center gap-2.5 border-b ${padded ? 'p-3' : ''}`}
      style={{ gridTemplateColumns: template, borderColor: 'var(--panel-border-soft)' }}
    >
      {children}
    </div>
  );
}

/** Horizontally-scrolling wrapper so a wide grid table never blows out the page on mobile. */
export function TableScroll({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
