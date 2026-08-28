import type { GameSetupConfig } from '../../components/shared/gameSetup';

/** Max cards per player by seat count — mirrors backend/src/games/trumpcard/engine.ts CARD_LIMITS. */
const CARD_LIMITS: Record<number, number> = { 2: 26, 3: 17, 4: 13 };

/** Always 3 distinct values for our seat counts (26/17/13 caps): a quick option, a mid option, and max. */
function cardsPerPlayerOptions(seatCount: number) {
  const cap = CARD_LIMITS[seatCount] ?? 26;
  const quick = Math.min(10, cap);
  const half = Math.max(1, Math.round(cap / 2));
  const values = [...new Set([quick, half, cap])].sort((a, b) => a - b);
  return values.map((v) => ({ value: v, label: String(v), sublabel: v === cap ? 'max' : 'cards' }));
}

export const trumpcardSetupConfig: GameSetupConfig<'seatCount' | 'cardsPerPlayer' | 'durationMinutes'> = {
  gameName: 'Trumpcard',
  extraSteps: [
    {
      key: 'seatCount',
      stepTitle: 'Number of players',
      columns: 3,
      defaultValue: 2,
      options: [
        { value: 2, label: '2', sublabel: 'players' },
        { value: 3, label: '3', sublabel: 'players' },
        { value: 4, label: '4', sublabel: 'players' },
      ],
      infoBox: (n) => (
        <>
          {n === 2 && '2 players: Winner takes 100% of the pot (after 5% fee)'}
          {n === 3 && '3 players: Top 2 paid — 70% / 30% (after 5% fee)'}
          {n === 4 && '4 players: Top 3 paid — 50% / 30% / 20% (after 5% fee)'}
        </>
      ),
    },
    {
      key: 'cardsPerPlayer',
      stepTitle: 'Cards per player',
      columns: 3,
      defaultValue: (values) => CARD_LIMITS[Number(values.seatCount)] ?? 26,
      options: (values) => cardsPerPlayerOptions(Number(values.seatCount)),
      infoBox: (n, values) => `${Number(values.seatCount) * Number(n)} of 52 cards used this match`,
    },
    {
      key: 'durationMinutes',
      stepTitle: 'Match duration',
      columns: 4,
      defaultValue: 10,
      options: [5, 10, 15, 20].map((m) => ({ value: m, label: String(m), sublabel: 'min' })),
    },
  ],
};
