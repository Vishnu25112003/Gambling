import type { CSSProperties } from 'react';
import { Input } from '../ui';
import { formatSol } from '../../../lib/format';

const DEFAULT_QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1];

/** Balance line + quick-amount chips + manual input + insufficient-balance warning. */
export function StakeAmountStep({
  balance,
  stake,
  onStakeChange,
  accentColor,
  quickAmounts = DEFAULT_QUICK_AMOUNTS,
  canAfford,
}: {
  balance: string | null;
  stake: string;
  onStakeChange: (v: string) => void;
  accentColor: string;
  quickAmounts?: number[];
  canAfford: boolean;
}) {
  return (
    <div>
      {balance !== null && (
        <p className="mb-4 text-xs text-muted">
          Balance: <span className="font-bold text-text">{formatSol(balance)} SOL</span>
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {quickAmounts.map((amt) => {
          const active = stake === String(amt);
          return (
            <button
              key={amt}
              type="button"
              onClick={() => onStakeChange(String(amt))}
              style={
                {
                  '--accent': accentColor,
                  ...(active ? { borderColor: accentColor, background: `color-mix(in srgb, ${accentColor} 14%, transparent)`, color: accentColor } : {}),
                } as CSSProperties
              }
              className="rounded-[9px] border border-line bg-bg2 px-3.5 py-1.5 text-xs font-bold text-text transition hover:border-[color:var(--accent)]/50"
            >
              {amt} SOL
            </button>
          );
        })}
      </div>

      <label className="mb-1 block text-xs font-semibold text-muted">Amount (SOL)</label>
      <Input
        type="number"
        min="0.01"
        step="0.01"
        value={stake}
        onChange={(e) => onStakeChange(e.target.value)}
        className="mb-1 w-full"
        placeholder="0.1"
      />
      {!canAfford && <p className="mb-1 text-xs text-red">Insufficient balance.</p>}
    </div>
  );
}
