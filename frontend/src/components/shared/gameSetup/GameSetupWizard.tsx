import { useState } from 'react';
import { Dices, Lock, Unlock, Users } from 'lucide-react';
import { Button, Card, PageTitle } from '../ui';
import { formatSol } from '../../../lib/format';
import { gameVisual } from '../../../lib/gameVisuals';
import { StepProgress } from './StepProgress';
import { SelectableCard } from './SelectableCard';
import { OptionPillGrid } from './OptionPillGrid';
import { StakeAmountStep } from './StakeAmountStep';
import { ReviewStep, type ReviewRow } from './ReviewStep';
import type { BetMode, DiscoveryMode, ExtraStepConfig, GameSetupWizardProps } from './types';

type Step = 'discovery' | `extra-${number}` | 'betmode' | 'amount' | 'minbet' | 'review';

function stepsFor(betMode: BetMode, extraCount: number): Step[] {
  const extraSteps = Array.from({ length: extraCount }, (_, i) => `extra-${i}` as Step);
  return ['discovery', ...extraSteps, 'betmode', 'amount', ...(betMode === 'free' ? (['minbet'] as const) : []), 'review'];
}

/** Resolve every extra step's default in order, so a later step can depend on an earlier one's default. */
function resolveDefaultValues(extraSteps: ExtraStepConfig[]): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const s of extraSteps) {
    values[s.key] = typeof s.defaultValue === 'function' ? s.defaultValue(values) : s.defaultValue;
  }
  return values;
}

function extraStepIndexFromStep(step: Step): number | null {
  return step.startsWith('extra-') ? Number(step.slice('extra-'.length)) : null;
}

/**
 * Config-driven pre-match setup wizard shared by every game: discovery mode
 * → the game's own settings (rounds / seats / board size / ...) → bet mode →
 * stake → min bet (free bet only) → review & publish. All step state lives
 * here — the parent Board only supplies `balance` and receives the final
 * settings via `onPublish`.
 *
 * `extraSteps` is an ordered array rather than a single step because some
 * games need more than one game-specific setting, and a later one may depend
 * on an earlier one (e.g. Trumpcard's cards-per-player cap depends on its
 * seat count) — see `frontend/src/games/trumpcard/trumpcardSetupConfig.tsx`.
 */
export function GameSetupWizard<K extends string>({
  config,
  balance,
  onPublish,
  onBack,
}: GameSetupWizardProps<K>) {
  const visual = gameVisual({ name: config.gameName });
  const accentColor = visual.tone;
  const accentTint = visual.tint;

  const [discovery, setDiscovery] = useState<DiscoveryMode>('random');
  const [extraValues, setExtraValues] = useState<Record<string, string | number>>(() =>
    resolveDefaultValues(config.extraSteps),
  );
  const [betMode, setBetMode] = useState<BetMode>('fixed');
  const [stake, setStake] = useState('0.1');
  const [minBet, setMinBet] = useState('0.05');
  const [step, setStep] = useState<Step>('discovery');

  const steps = stepsFor(betMode, config.extraSteps.length);
  const currentIndex = steps.indexOf(step);

  const stakeNum = Number(stake) || 0;
  const canAfford = balance === null || stakeNum <= Number(balance);
  const minBetNum = Number(minBet) || 0;

  const goTo = (s: Step) => setStep(s);
  const goNext = () => {
    const next = steps[currentIndex + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    const prev = steps[currentIndex - 1];
    if (prev) setStep(prev);
    else onBack();
  };

  const handlePublish = () => {
    onPublish({
      discovery,
      betMode,
      stake: stakeNum,
      minBet: betMode === 'free' ? minBetNum : null,
      ...extraValues,
    } as never);
  };

  const extraIndex = extraStepIndexFromStep(step);
  const extraCfg = extraIndex !== null ? config.extraSteps[extraIndex] : undefined;
  const extraOptions = extraCfg
    ? typeof extraCfg.options === 'function' ? extraCfg.options(extraValues) : extraCfg.options
    : [];

  const handleExtraChange = (idx: number, key: string, v: string | number) => {
    setExtraValues((prev) => {
      // Changing an earlier step invalidates any later step's stale value
      // (e.g. Trumpcard's cards-per-player cap changes with seat count) —
      // recompute every step after this one back to its own default.
      const next = { ...prev, [key]: v };
      for (let j = idx + 1; j < config.extraSteps.length; j++) {
        const later = config.extraSteps[j]!;
        next[later.key] = typeof later.defaultValue === 'function' ? later.defaultValue(next) : later.defaultValue;
      }
      return next;
    });
    goNext();
  };

  const stepTitle: Record<Step, string> = {
    discovery: 'How do you want to play?',
    betmode: 'Bet mode',
    amount: `${betMode === 'fixed' ? 'Bet' : 'Your bet'} amount (SOL)`,
    minbet: 'Minimum bet for joiners (SOL)',
    review: 'Review your match settings',
    ...Object.fromEntries(config.extraSteps.map((s, i) => [`extra-${i}`, s.stepTitle])),
  } as Record<Step, string>;

  const reviewRows: ReviewRow[] = [
    {
      label: 'Mode',
      value: (
        <>
          {discovery === 'random' ? <Dices className="size-4" /> : <Users className="size-4" />}
          {discovery === 'random' ? 'Random Play' : 'Friends Play'}
        </>
      ),
    },
    ...config.extraSteps.map((s) => {
      const opts = typeof s.options === 'function' ? s.options(extraValues) : s.options;
      const v = extraValues[s.key];
      return {
        label: s.stepTitle.replace(/\s*\(.*\)$/, ''),
        value: opts.find((o) => o.value === v)?.label ?? String(v),
      };
    }),
    {
      label: 'Bet mode',
      value: (
        <>
          {betMode === 'fixed' ? <Lock className="size-4" /> : <Unlock className="size-4" />}
          {betMode === 'fixed' ? 'Fixed' : 'Free'}
        </>
      ),
    },
    ...(betMode === 'free' ? [{ label: 'Min for joiner', value: `${formatSol(minBet)} SOL` }] : []),
    { label: 'Your stake', value: `${formatSol(stake)} SOL`, accent: true },
  ];

  return (
    <>
      <PageTitle
        title={`Create ${config.gameName} Match`}
        subtitle={`Step ${currentIndex + 1} of ${steps.length} — ${stepTitle[step]}`}
      />
      <div
        className="relative mx-auto max-w-sm"
        style={{
          background: `radial-gradient(ellipse 340px 220px at 50% -10%, ${accentTint}, transparent 65%)`,
        }}
      >
        <Card key={step} className="relative animate-fade-up px-6 py-6">
          <StepProgress total={steps.length} currentIndex={currentIndex} accentColor={accentColor} />

          {step === 'discovery' && (
            <div className="space-y-3">
              <SelectableCard
                icon={<Dices className="size-4" />}
                title="Random Play"
                description="Listed publicly. Anyone can join instantly."
                selected={discovery === 'random'}
                onClick={() => { setDiscovery('random'); goNext(); }}
                accentColor={accentColor}
                accentTint={accentTint}
              />
              <SelectableCard
                icon={<Users className="size-4" />}
                title="Friends Play"
                description="Private room code. Share it with a friend."
                selected={discovery === 'friends'}
                onClick={() => { setDiscovery('friends'); goNext(); }}
                accentColor={accentColor}
                accentTint={accentTint}
              />
            </div>
          )}

          {extraCfg && extraIndex !== null && (
            <OptionPillGrid
              options={extraOptions}
              value={extraValues[extraCfg.key]!}
              onChange={(v) => handleExtraChange(extraIndex, extraCfg.key, v)}
              columns={extraCfg.columns}
              accentColor={accentColor}
              accentTint={accentTint}
              infoBox={extraCfg.infoBox?.(extraValues[extraCfg.key]!, extraValues)}
            />
          )}

          {step === 'betmode' && (
            <div className="space-y-3">
              <SelectableCard
                icon={<Lock className="size-4" />}
                title="Fixed Bet"
                description="Every player bets the same amount."
                selected={betMode === 'fixed'}
                onClick={() => { setBetMode('fixed'); goTo('amount'); }}
                accentColor={accentColor}
                accentTint={accentTint}
              />
              <SelectableCard
                icon={<Unlock className="size-4" />}
                title="Free Bet"
                description="Each player picks their own amount. Set a minimum to prevent lowball."
                selected={betMode === 'free'}
                onClick={() => { setBetMode('free'); goTo('amount'); }}
                accentColor={accentColor}
                accentTint={accentTint}
              />
            </div>
          )}

          {step === 'amount' && (
            <>
              <StakeAmountStep
                balance={balance}
                stake={stake}
                onStakeChange={setStake}
                accentColor={accentColor}
                quickAmounts={config.quickAmounts}
                canAfford={canAfford}
              />
              <Button
                variant="primary"
                size="lg"
                className="mt-3 w-full"
                disabled={!stake || stakeNum <= 0 || !canAfford}
                onClick={goNext}
                style={{ background: accentColor }}
              >
                {betMode === 'free' ? 'Next' : 'Review'}
              </Button>
            </>
          )}

          {step === 'minbet' && (
            <>
              <p className="mb-4 text-xs text-muted">
                Joiners must stake at least this much. Protects against lowball.
              </p>
              <StakeAmountStep
                balance={null}
                stake={minBet}
                onStakeChange={setMinBet}
                accentColor={accentColor}
                quickAmounts={config.quickAmounts}
                canAfford={true}
              />
              <Button
                variant="primary"
                size="lg"
                className="mt-3 w-full"
                disabled={!minBet || minBetNum <= 0}
                onClick={goNext}
                style={{ background: accentColor }}
              >
                Review
              </Button>
            </>
          )}

          {step === 'review' && (
            <ReviewStep rows={reviewRows} onPublish={handlePublish} canPublish={canAfford} accentColor={accentColor} />
          )}

          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={goBack}>
            Back
          </Button>
        </Card>
      </div>
    </>
  );
}
