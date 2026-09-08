/**
 * Static placeholder data for the My Bets page. There is no backend concept of
 * "in-flight bets across games" yet — this mirrors the shape a real endpoint
 * would return (decimal-string amounts, real game keys) so swapping in a real
 * API later only means replacing this module's export, not the page.
 */

export interface MockOpenBet {
  id: string;
  gameType: 'coin-flip' | 'ludo' | 'mine-catcher' | 'trumpcard' | 'hand-cricket';
  meta: string;
  state: 'your-turn' | 'waiting';
  stake: string;
  toWin: string;
}

export type MockBetResult = 'won' | 'lost' | 'forfeited' | 'refunded';

export interface MockSettledBet {
  id: string;
  gameType: MockOpenBet['gameType'];
  when: string;
  stake: string;
  payout: string;
  net: string;
  result: MockBetResult;
}

export const MOCK_OPEN_BETS: MockOpenBet[] = [
  {
    id: 'ob-1',
    gameType: 'mine-catcher',
    meta: 'zoro vs open seat · 2 slots',
    state: 'your-turn',
    stake: '0.200000000',
    toWin: '0.380000000',
  },
  {
    id: 'ob-2',
    gameType: 'ludo',
    meta: '4-player table · waiting on 1',
    state: 'waiting',
    stake: '0.100000000',
    toWin: '0.360000000',
  },
];

export const MOCK_SETTLED_BETS: MockSettledBet[] = [
  { id: 'sb-1', gameType: 'hand-cricket', when: '2026-09-06T18:20:00Z', stake: '0.150000000', payout: '0.285000000', net: '0.135000000', result: 'won' },
  { id: 'sb-2', gameType: 'coin-flip', when: '2026-09-06T14:05:00Z', stake: '0.050000000', payout: '0.000000000', net: '-0.050000000', result: 'lost' },
  { id: 'sb-3', gameType: 'trumpcard', when: '2026-09-05T21:40:00Z', stake: '0.300000000', payout: '0.570000000', net: '0.270000000', result: 'won' },
  { id: 'sb-4', gameType: 'mine-catcher', when: '2026-09-05T11:15:00Z', stake: '0.100000000', payout: '0.100000000', net: '0.000000000', result: 'refunded' },
  { id: 'sb-5', gameType: 'ludo', when: '2026-09-04T19:50:00Z', stake: '0.200000000', payout: '0.000000000', net: '-0.200000000', result: 'lost' },
  { id: 'sb-6', gameType: 'coin-flip', when: '2026-09-04T09:30:00Z', stake: '0.080000000', payout: '0.152000000', net: '0.072000000', result: 'won' },
  { id: 'sb-7', gameType: 'hand-cricket', when: '2026-09-03T22:10:00Z', stake: '0.120000000', payout: '0.000000000', net: '-0.120000000', result: 'forfeited' },
];

export interface MockBetStat {
  label: string;
  value: string;
  color: string;
}

export function mockBetStats(): MockBetStat[] {
  const settledWon = MOCK_SETTLED_BETS.filter((b) => b.result === 'won').length;
  const settledTotal = MOCK_SETTLED_BETS.filter((b) => b.result === 'won' || b.result === 'lost').length;
  const winRate = settledTotal > 0 ? Math.round((settledWon / settledTotal) * 100) : 0;
  const netTotal = MOCK_SETTLED_BETS.reduce((sum, b) => sum + Number(b.net), 0);

  return [
    { label: 'OPEN BETS', value: String(MOCK_OPEN_BETS.length), color: 'var(--green)' },
    { label: 'WIN RATE', value: `${winRate}%`, color: 'var(--gold-bright)' },
    { label: 'SETTLED', value: String(MOCK_SETTLED_BETS.length), color: 'var(--text)' },
    {
      label: 'NET (SETTLED)',
      value: `${netTotal >= 0 ? '+' : ''}${netTotal.toFixed(3)} SOL`,
      color: netTotal >= 0 ? 'var(--green)' : 'var(--red)',
    },
  ];
}
