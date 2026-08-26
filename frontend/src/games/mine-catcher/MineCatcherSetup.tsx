import { useState } from 'react';
import { Button, Card, PageTitle } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';

type BetMode = 'fixed' | 'free';
type DiscoveryMode = 'random' | 'friends';
type BoardSize = 25 | 49 | 81 | 100;

const BOARD_OPTIONS: { size: BoardSize; label: string; grid: string }[] = [
  { size: 25,  label: '25 cells', grid: '5×5' },
  { size: 49,  label: '49 cells', grid: '7×7' },
  { size: 81,  label: '81 cells', grid: '9×9' },
  { size: 100, label: '100 cells', grid: '10×10' },
];

interface MineCatcherSetupProps {
  balance: string | null;
  onPublish: (settings: {
    discovery: DiscoveryMode;
    boardSize: BoardSize;
    betMode: BetMode;
    stake: number;
  }) => void;
  onBack: () => void;
}

type Step = 'discovery' | 'boardsize' | 'betmode' | 'amount' | 'review';

export function MineCatcherSetup({ balance, onPublish, onBack }: MineCatcherSetupProps) {
  const [step, setStep] = useState<Step>('discovery');
  const [discovery, setDiscovery] = useState<DiscoveryMode>('random');
  const [boardSize, setBoardSize] = useState<BoardSize>(25);
  const [betMode, setBetMode] = useState<BetMode>('fixed');
  const [stake, setStake] = useState('0.1');

  const stakeNum = Number(stake) || 0;
  const canAfford = balance === null || stakeNum <= Number(balance);

  const handlePublish = () => {
    if (!stakeNum || stakeNum <= 0) return;
    if (!canAfford) return;
    onPublish({ discovery, boardSize, betMode, stake: stakeNum });
  };

  if (step === 'discovery') {
    return (
      <>
        <PageTitle title="Create Mine Catcher" subtitle="Step 1 — How do you want to play?" />
        <div className="mx-auto max-w-sm space-y-3">
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setDiscovery('random'); setStep('boardsize'); }}
          >
            <p className="mb-1 text-sm font-bold">🎲 Random Play</p>
            <p className="text-xs text-muted">Listed publicly. Anyone can join instantly.</p>
          </button>
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setDiscovery('friends'); setStep('boardsize'); }}
          >
            <p className="mb-1 text-sm font-bold">👥 Friends Play</p>
            <p className="text-xs text-muted">Private room code. Share it with friends.</p>
          </button>
          <Button variant="ghost" size="sm" className="w-full" onClick={onBack}>
            Back
          </Button>
        </div>
      </>
    );
  }

  if (step === 'boardsize') {
    return (
      <>
        <PageTitle title="Create Mine Catcher" subtitle="Step 2 — Board size" />
        <Card className="mx-auto max-w-sm px-6 py-6">
          <div className="grid grid-cols-2 gap-3">
            {BOARD_OPTIONS.map((opt) => (
              <button
                key={opt.size}
                type="button"
                onClick={() => { setBoardSize(opt.size); setStep('betmode'); }}
                className={`rounded-[10px] border px-4 py-4 text-center transition ${
                  boardSize === opt.size
                    ? 'border-green-solid bg-green-solid/15 text-green'
                    : 'border-line bg-bg2 text-text hover:border-green-solid/40'
                }`}
              >
                <p className="text-lg font-bold">{opt.grid}</p>
                <p className="text-[11px] text-muted">{opt.label}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-[10px] border border-line bg-bg2 px-4 py-3">
            <p className="text-xs text-muted">
              All board sizes: 10 hidden mines. First to find all 10 wins.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => setStep('discovery')}>
            Back
          </Button>
        </Card>
      </>
    );
  }

  if (step === 'betmode') {
    return (
      <>
        <PageTitle title="Create Mine Catcher" subtitle="Step 3 — Bet mode" />
        <div className="mx-auto max-w-sm space-y-3">
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setBetMode('fixed'); setStep('amount'); }}
          >
            <p className="mb-1 text-sm font-bold">🔒 Fixed Bet</p>
            <p className="text-xs text-muted">Every player bets the same amount.</p>
          </button>
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setBetMode('free'); setStep('amount'); }}
          >
            <p className="mb-1 text-sm font-bold">🆓 Free Bet</p>
            <p className="text-xs text-muted">Each player picks their own amount.</p>
          </button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep('boardsize')}>
            Back
          </Button>
        </div>
      </>
    );
  }

  if (step === 'amount') {
    return (
      <>
        <PageTitle title="Create Mine Catcher" subtitle={`Step 4 — ${betMode === 'fixed' ? 'Bet' : 'Your bet'} amount (SOL)`} />
        <Card className="mx-auto max-w-sm px-6 py-6">
          {balance !== null && (
            <p className="mb-4 text-xs text-muted">
              Balance: <span className="font-bold text-text">{formatSol(balance)} SOL</span>
            </p>
          )}
          <label className="mb-1 block text-xs font-semibold text-muted">Amount (SOL)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="mb-1 w-full rounded-[9px] border border-line bg-bg2 px-3.5 py-[11px] text-sm text-text placeholder:text-faint focus:border-green focus:outline-none"
            placeholder="0.1"
          />
          {!canAfford && <p className="mb-2 text-xs text-red">Insufficient balance.</p>}
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            disabled={!stakeNum || stakeNum <= 0 || !canAfford}
            onClick={() => setStep('review')}
          >
            Review
          </Button>
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setStep('betmode')}>
            Back
          </Button>
        </Card>
      </>
    );
  }

  // Review & Publish
  return (
    <>
      <PageTitle title="Create Mine Catcher" subtitle="Review your match settings" />
      <Card className="mx-auto max-w-sm px-6 py-6">
        <div className="mb-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Mode</span>
            <span className="font-bold">{discovery === 'random' ? '🎲 Random Play' : '👥 Friends Play'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Board</span>
            <span className="font-bold">{boardSize === 25 ? '5×5' : boardSize === 49 ? '7×7' : boardSize === 81 ? '9×9' : '10×10'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Mines</span>
            <span className="font-bold">10 (fixed)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Bet mode</span>
            <span className="font-bold">{betMode === 'fixed' ? '🔒 Fixed' : '🆓 Free'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Your stake</span>
            <span className="font-bold text-green">{formatSol(stake)} SOL</span>
          </div>
        </div>
        <div className="mb-4 rounded-[10px] border border-line bg-bg2 px-4 py-3">
          <p className="text-xs text-muted">
            Winner takes 100% of the pot (after 5% fee). First to find all 10 opponent mines wins instantly.
          </p>
        </div>
        {!canAfford && <p className="mb-3 text-xs text-red">Insufficient balance.</p>}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!canAfford}
          onClick={handlePublish}
        >
          Publish Match
        </Button>
        <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setStep('amount')}>
          Back
        </Button>
      </Card>
    </>
  );
}
