import type { GameSetupConfig } from '../../components/shared/gameSetup';

export const handCricketSetupConfig: GameSetupConfig<'ballsPerInnings'> = {
  gameName: 'Hand Cricket',
  extraSteps: [
    {
      key: 'ballsPerInnings',
      stepTitle: 'Balls per innings',
      columns: 4,
      defaultValue: 6,
      options: [6, 8, 10, 12].map((n) => ({ value: n, label: String(n), sublabel: 'balls' })),
      infoBox: () =>
        'Each player bats this many balls (or until out), then roles swap. A tie after both innings goes to a 6-ball Super Over.',
    },
  ],
};
