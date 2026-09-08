import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Badge, Button, Card, PageTitle, SectionHeading } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { formatDate, formatSol } from '../../lib/format';
import {
  MOCK_CLAIMS,
  MOCK_CRATES,
  MOCK_STREAK,
  MOCK_UNCLAIMED,
  RAKEBACK_TIERS,
} from '../../lib/rewardsMock';

const SUBTITLE = 'Rakeback, streak bonuses and seasonal drops.';

function StreakStrip() {
  return (
    <div className="grid grid-cols-7 gap-2">
      {MOCK_STREAK.map((d) => (
        <div
          key={d.day}
          className="flex flex-col items-center gap-1.5 rounded-[11px] border p-2.5"
          style={
            d.state === 'done'
              ? { borderColor: 'color-mix(in srgb, var(--green-solid) 35%, transparent)', background: 'color-mix(in srgb, var(--green-solid) 8%, var(--bg2))' }
              : d.state === 'today'
                ? { borderColor: 'color-mix(in srgb, var(--gold) 45%, transparent)', background: 'color-mix(in srgb, var(--gold) 10%, var(--bg2))' }
                : { borderColor: 'var(--line2)', background: 'var(--bg2)' }
          }
        >
          <span
            className="font-mono text-[9.5px] tracking-[0.08em]"
            style={{ color: d.state === 'locked' ? 'var(--faint)' : d.state === 'today' ? 'var(--gold-bright)' : 'var(--green)' }}
          >
            DAY {d.day}
          </span>
          <Icon
            name={d.state === 'locked' ? 'lock' : 'bolt'}
            size={16}
            className={d.state === 'today' ? 'text-gold' : d.state === 'done' ? 'text-green' : 'text-faint'}
          />
        </div>
      ))}
    </div>
  );
}

function RakebackProgress({ wagered }: { wagered: number }) {
  const top = RAKEBACK_TIERS[RAKEBACK_TIERS.length - 1]!.minWagered;
  const pct = Math.min(100, (wagered / top) * 100);

  return (
    <Card className="p-6">
      <SectionHeading icon={<Icon name="percent" size={17} />} title="Rakeback Tier" />
      <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted">{formatSol(String(wagered))} SOL wagered lifetime</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line2">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--gold-deep),var(--gold-bright))]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,110px),1fr))] gap-2.5">
        {RAKEBACK_TIERS.map((t) => {
          const reached = wagered >= t.minWagered;
          return (
            <div
              key={t.pct}
              className="rounded-[11px] border p-3 text-center"
              style={
                reached
                  ? { borderColor: 'color-mix(in srgb, var(--gold) 35%, transparent)', background: 'color-mix(in srgb, var(--gold) 8%, var(--bg2))' }
                  : { borderColor: 'var(--line2)', background: 'var(--bg2)' }
              }
            >
              <div className="font-heading text-[16px] font-extrabold" style={{ color: reached ? 'var(--gold-bright)' : 'var(--text)' }}>
                {t.pct}
              </div>
              <div className="mt-1 font-mono text-[10px] tracking-[0.06em]" style={{ color: reached ? 'var(--green)' : 'var(--faint)' }}>
                {reached ? 'ACTIVE' : `${(t.minWagered - wagered).toFixed(1)} SOL TO GO`}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CrateCard({ crate }: { crate: (typeof MOCK_CRATES)[number] }) {
  const pct = crate.total > 0 ? Math.min(100, (crate.progress / crate.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-line2 text-gold">
          <Icon name={crate.icon} size={18} />
        </div>
        <div className="min-w-0">
          <div className="font-heading text-[14px] font-bold">{crate.name}</div>
          <div className="font-mono text-[9.5px] tracking-[0.1em] text-faint">{crate.tag}</div>
        </div>
      </div>
      <p className="text-[11.5px] text-muted">{crate.desc}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line2">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--green-deep),var(--green-solid))]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <Button size="sm" variant={crate.claimable ? 'solid' : 'secondary'} disabled={!crate.claimable}>
        {crate.claimable ? 'Open Now' : `${crate.progress}/${crate.total}`}
      </Button>
    </div>
  );
}

/**
 * Static/mock content for now (per project decision) — no backend concept of
 * streaks, crates or rakeback claims exists yet. `rewardsMock.ts` isolates the
 * placeholder data; the rakeback progress bar uses real `totalWagered`.
 */
export function Rewards() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return (
      <>
        <PageTitle title="Rewards" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your rewards, streaks and rakeback" icon="gift" />
      </>
    );
  }

  const wagered = Number(user?.totalWagered ?? '0');

  return (
    <>
      <PageTitle title="Rewards" subtitle={SUBTITLE} />

      <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-[18px]">
        <div className="relative overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--gold)_28%,transparent)] bg-[linear-gradient(135deg,rgba(234,179,8,0.14),transparent)] p-6">
          <div className="font-mono text-[11px] font-semibold tracking-[0.06em] text-muted">
            UNCLAIMED BALANCE
          </div>
          <div className="mt-1.5 font-heading text-[32px] font-extrabold text-gold">
            {formatSol(MOCK_UNCLAIMED)} <span className="text-[15px] font-normal text-muted">SOL</span>
          </div>
          <div className="mt-4 flex gap-2.5">
            <Button variant="solid">Claim All</Button>
            <Button variant="secondary">History</Button>
          </div>
        </div>

        <Card className="p-6">
          <SectionHeading icon={<Icon name="bolt" size={17} />} title="Daily Streak" subtitle="Day 7 pays 0.05 SOL." />
          <StreakStrip />
        </Card>
      </div>

      <div className="mb-[18px]">
        <RakebackProgress wagered={wagered} />
      </div>

      <Card className="mb-[18px] p-6">
        <SectionHeading icon={<Icon name="gift" size={17} />} title="Reward Crates" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3.5">
          {MOCK_CRATES.map((c) => (
            <CrateCard key={c.id} crate={c} />
          ))}
        </div>
      </Card>

      <Card radius={16} className="overflow-hidden">
        <div className="border-b border-line2 px-5 py-3.5">
          <span className="font-heading text-[13.5px] font-bold tracking-[0.04em]">
            CLAIM HISTORY
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line2 text-left text-[11px] font-semibold tracking-[0.06em] text-faint">
                <th className="px-5 py-3.5">SOURCE</th>
                <th className="px-5 py-3.5">WHEN</th>
                <th className="px-5 py-3.5 text-right">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_CLAIMS.map((c) => (
                <tr key={c.id} className="border-b border-line2 last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading font-semibold">{c.name}</span>
                      <Badge tone="neutral">{c.source}</Badge>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono whitespace-nowrap text-muted">
                    {formatDate(c.when)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold whitespace-nowrap text-green">
                    +{formatSol(c.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
