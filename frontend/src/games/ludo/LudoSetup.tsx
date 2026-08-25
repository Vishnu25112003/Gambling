import { useState } from 'react';
import { Button, Card, PageTitle } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';

/**
 * Ludo host setup wizard — player count, bet mode, amount.
 * Renders a multi-step wizard that emits the final CREATE_MATCH event
 * via the onPublish callback. The parent (LudoBoard) owns the socket.
 */

type BetMode = 'fixed' | 'free';
type DiscoveryMode = 'random' | 'friends';

interface LudoSetupProps {
  balance: string | null;
  onPublish: (settings: {
    discovery: DiscoveryMode;
    seatCount: number;
    betMode: BetMode;
    stake: number;
  }) => void;
  onBack: () => void;
}

type Step = 'discovery' | 'seats' | 'betmode' | 'amount' | 'review';

export function LudoSetup({ balance, onPublish, onBack }: LudoSetupProps) {
  const [step, setStep] = useState<Step>('discovery');
  const [discovery, setDiscovery] = useState<DiscoveryMode>('random');
  const [seatCount, setSeatCount] = useState(2);
  const [betMode, setBetMode] = useState<BetMode>('fixed');
  const [stake, setStake] = useState('0.1');

  const stakeNum = Number(stake) || 0;
  const canAfford = balance === null || stakeNum <= Number(balance);

  const handlePublish = () => {
    if (!stakeNum || stakeNum <= 0) return;
    if (!canAfford) return;
    onPublish({ discovery, seatCount, betMode, stake: stakeNum });
  };

  // --- Step: Discovery mode ---
  if (step === 'discovery') {
    return (
      <>
        <PageTitle title="Create Ludo Match" subtitle="Step 1 — How do you want to play?" />
        <div className="mx-auto max-w-sm space-y-3">
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setDiscovery('random'); setStep('seats'); }}
          >
            <p className="mb-1 text-sm font-bold">🎲 Random Play</p>
            <p className="text-xs text-muted">Listed publicly. Anyone can join instantly.</p>
          </button>
          <button
            type="button"
            className="block w-full cursor-pointer rounded-[18px] border border-line bg-card px-6 py-5 text-left transition hover:border-green-solid/40"
            onClick={() => { setDiscovery('friends'); setStep('seats'); }}
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

  // --- Step: Seat count ---
  if (step === 'seats') {
    return (
      <>
        <PageTitle title="Create Ludo Match" subtitle="Step 2 — Number of players" />
        <Card className="mx-auto max-w-sm px-6 py-6">
          <div className="grid grid-cols-3 gap-3">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { setSeatCount(n); setStep('betmode'); }}
                className={`rounded-[10px] border px-4 py-4 text-center transition ${
                  seatCount === n
                    ? 'border-green-solid bg-green-solid/15 text-green'
                    : 'border-line bg-bg2 text-text hover:border-green-solid/40'
                }`}
              >
                <p className="text-2xl font-bold">{n}</p>
                <p className="text-[11px] text-muted">players</p>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-[10px] border border-line bg-bg2 px-4 py-3">
            <p className="text-xs text-muted">
              {seatCount === 2 && '2 players: Winner takes 100%'}
              {seatCount === 3 && '3 players: Top 2 paid (70% / 30%)'}
              {seatCount === 4 && '4 players: Top 3 paid (50% / 30% / 20%)'}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => setStep('discovery')}>
            Back
          </Button>
        </Card>
      </>
    );
  }

  // --- Step: Bet mode ---
  if (step === 'betmode') {
    return (
      <>
        <PageTitle title="Create Ludo Match" subtitle="Step 3 — Bet mode" />
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
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep('seats')}>
            Back
          </Button>
        </div>
      </>
    );
  }

  // --- Step: Bet amount ---
  if (step === 'amount') {
    return (
      <>
        <PageTitle title="Create Ludo Match" subtitle={`Step 4 — ${betMode === 'fixed' ? 'Bet' : 'Your bet'} amount (SOL)`} />
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

  // --- Step: Review & Publish ---
  return (
    <>
      <PageTitle title="Create Ludo Match" subtitle="Review your match settings" />
      <Card className="mx-auto max-w-sm px-6 py-6">
        <div className="mb-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Mode</span>
            <span className="font-bold">{discovery === 'random' ? '🎲 Random Play' : '👥 Friends Play'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Players</span>
            <span className="font-bold">{seatCount}</span>
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
            {seatCount === 2 && 'Winner takes 100% of the pot (after 5% fee)'}
            {seatCount === 3 && 'Top 2 paid: 70% / 30% (after 5% fee)'}
            {seatCount === 4 && 'Top 3 paid: 50% / 30% / 20% (after 5% fee)'}
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
