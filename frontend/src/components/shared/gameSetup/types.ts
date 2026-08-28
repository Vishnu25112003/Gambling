import type { ReactNode } from 'react';

export type DiscoveryMode = 'random' | 'friends';
export type BetMode = 'fixed' | 'free';

export interface ExtraOption<T extends string | number> {
  value: T;
  /** Big label, e.g. "3" or "5×5". */
  label: string;
  /** Small label under it, e.g. "rounds" or "25 cells". */
  sublabel?: string;
}

export interface GameSetupConfig<T extends string | number, K extends string = string> {
  /** Looked up via gameVisual({name}) for this game's accent tone/tint. */
  gameName: string;
  extraStep: {
    /** Becomes the emitted payload's field name — must match what the backend's CREATE_MATCH handler expects. */
    key: K;
    stepTitle: string;
    /** 2, 3, or 4 — how many option cards per row. */
    columns: 2 | 3 | 4;
    defaultValue: T;
    options: ExtraOption<T>[];
    /** Static or selection-reactive note shown under the options (payout splits, board rules, etc). */
    infoBox?: (selected: T) => ReactNode;
  };
  /** SOL preset chips on the stake step. Defaults to [0.1, 0.25, 0.5, 1]. */
  quickAmounts?: number[];
}

export interface PublishedSettings {
  discovery: DiscoveryMode;
  betMode: BetMode;
  stake: number;
  minBet: number | null;
}

export interface GameSetupWizardProps<T extends string | number, K extends string = string> {
  config: GameSetupConfig<T, K>;
  balance: string | null;
  onPublish: (settings: PublishedSettings & Record<K, T>) => void;
  onBack: () => void;
}
