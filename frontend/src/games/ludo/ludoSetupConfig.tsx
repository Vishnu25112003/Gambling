import type { GameSetupConfig } from '../../components/shared/gameSetup';

export const ludoSetupConfig: GameSetupConfig<'seatCount'> = {
  gameName: 'Ludo',
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
  ],
};
