import type { ReactNode } from 'react';
import { Button } from '../ui';

export interface ReviewRow {
  label: string;
  value: ReactNode;
  /** The final stake row gets a divider above it and the accent color. */
  accent?: boolean;
}

/** "Bet slip" summary — key/value rows with a receipt-style divider before the stake, then Publish. */
export function ReviewStep({
  rows,
  onPublish,
  canPublish,
  accentColor,
}: {
  rows: ReviewRow[];
  onPublish: () => void;
  canPublish: boolean;
  accentColor: string;
}) {
  return (
    <div>
      <div className="mb-5 space-y-2 text-sm">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex justify-between ${row.accent ? 'border-t border-dashed border-line pt-2.5' : ''}`}
          >
            <span className="text-muted">{row.label}</span>
            <span
              className="flex items-center gap-1.5 font-bold"
              style={row.accent ? { color: accentColor } : undefined}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!canPublish}
        onClick={onPublish}
        style={{ background: accentColor }}
      >
        Publish Match
      </Button>
    </div>
  );
}
