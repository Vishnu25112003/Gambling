import type { GameSetupConfig } from '../../components/shared/gameSetup';

export const mineCatcherSetupConfig: GameSetupConfig<'boardSize'> = {
  gameName: 'Mine Catcher',
  extraSteps: [
    {
      key: 'boardSize',
      stepTitle: 'Board size',
      columns: 2,
      defaultValue: 25,
      options: [
        { value: 25, label: '5×5', sublabel: '25 cells' },
        { value: 49, label: '7×7', sublabel: '49 cells' },
        { value: 81, label: '9×9', sublabel: '81 cells' },
        { value: 100, label: '10×10', sublabel: '100 cells' },
      ],
      infoBox: () => 'All board sizes: 10 hidden mines. First to find all 10 wins.',
    },
  ],
};
