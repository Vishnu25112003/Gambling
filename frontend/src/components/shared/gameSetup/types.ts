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

/**
 * One extra setup step (rounds / seat count / board size / ...). `options` and
 * `defaultValue` may depend on the extra values already chosen in earlier
 * steps — e.g. Trumpcard's cards-per-player cap depends on its seat count.
 */
export interface ExtraStepConfig<T extends string | number = string | number, K extends string = string> {
  /** Becomes the emitted payload's field name — must match what the backend's CREATE_MATCH handler expects. */
  key: K;
  stepTitle: string;
  /** 2, 3, or 4 — how many option cards per row. */
  columns: 2 | 3 | 4;
  defaultValue: T | ((values: Record<string, string | number>) => T);
  options: ExtraOption<T>[] | ((values: Record<string, string | number>) => ExtraOption<T>[]);
  /** Static or selection-reactive note shown under the options (payout splits, board rules, etc). */
  infoBox?: (selected: T, values: Record<string, string | number>) => ReactNode;
}

export interface GameSetupConfig<K extends string = string> {
  /** Looked up via gameVisual({name}) for this game's accent tone/tint. */
  gameName: string;
  /** Ordered — rendered one after another between "discovery" and "bet mode". */
  extraSteps: ExtraStepConfig<string | number, K>[];
  /** SOL preset chips on the stake step. Defaults to [0.1, 0.25, 0.5, 1]. */
  quickAmounts?: number[];
}

export interface PublishedSettings {
  discovery: DiscoveryMode;
  betMode: BetMode;
  stake: number;
  minBet: number | null;
}

export interface GameSetupWizardProps<K extends string = string> {
  config: GameSetupConfig<K>;
  balance: string | null;
  onPublish: (settings: PublishedSettings & Record<K, string | number>) => void;
  onBack: () => void;
}
