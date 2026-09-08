import { Flame, History } from 'lucide-react';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Panel, PanelHeader, StatTile, TableHead, TableRow, TableScroll } from '../../components/dashboard/panels';
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

const SUBTITLE = 'Rakeback, streak bonuses and season drops — claim them before the timer runs out.';
const CLAIMS_TEMPLATE = '1.3fr 1.2fr 1fr .8fr';

function StreakStrip() {
  return (
    <div className="mt-3.5 flex gap-1.5">
      {MOCK_STREAK.map((d) => (
        <div
          key={d.day}
          className="flex-1 rounded-[9px] border py-2.5 text-center"
          style={
            d.state === 'today'
              ? { borderColor: 'rgba(240,180,41,.4)', background: 'rgba(240,180,41,.1)' }
              : d.state === 'done'
                ? { borderColor: 'rgba(47,224,138,.3)', background: 'rgba(47,224,138,.08)' }
                : { borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg3)' }
          }
        >
          <Flame
            size={16}
            className="mx-auto"
            style={{ color: d.state === 'today' ? '#f0b429' : d.state === 'done' ? '#2fe08a' : 'var(--faint)' }}
          />
          <div
            className="mt-1 font-mono text-[9px] tracking-[0.08em]"
            style={{ color: d.state === 'today' ? '#f7d774' : d.state === 'done' ? '#6ee7b7' : 'var(--faint)' }}
          >
            DAY {d.day}
          </div>
        </div>
      ))}
    </div>
  );
}

function RakebackProgress({ wagered }: { wagered: number }) {
  const top = RAKEBACK_TIERS[RAKEBACK_TIERS.length - 1]!.minWagered;
  const pct = Math.min(100, (wagered / top) * 100);

  return (
    <Panel>
      <PanelHeader title="RAKEBACK TIER" meta={`${wagered.toFixed(2)} SOL WAGERED`} />
      <div className="relative h-2 overflow-hidden rounded-md border" style={{ background: '#0b1a12', borderColor: 'rgba(47,224,138,.14)' }}>
        <div className="h-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #0f7d4d, #35eb95)', boxShadow: '0 0 16px rgba(47,224,138,.5)' }} />
      </div>
      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        {RAKEBACK_TIERS.map((t) => {
          const reached = wagered >= t.minWagered;
          return (
            <div
              key={t.pct}
              className="rounded-xl border p-[14px_12px] text-center"
              style={
                reached
                  ? { borderColor: 'rgba(240,180,41,.4)', background: 'rgba(240,180,41,.08)' }
                  : { borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg3)' }
              }
            >
              <div className="font-heading text-[22px] font-bold" style={{ color: reached ? '#f7d774' : 'var(--text)' }}>
                {t.pct}
              </div>
              <div className="mt-[5px] font-mono text-[10.5px] text-[#a9c3b6]">{t.minWagered} SOL</div>
              <div className="mt-2 font-mono text-[9.5px] tracking-[0.12em]" style={{ color: reached ? '#f7d774' : 'var(--faint)' }}>
                {reached ? 'ACTIVE' : `${(t.minWagered - wagered).toFixed(1)} SOL TO GO`}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function CrateCard({ crate }: { crate: (typeof MOCK_CRATES)[number] }) {
  const pct = crate.total > 0 ? Math.min(100, (crate.progress / crate.total) * 100) : 0;
  const claimable = crate.claimable;

  return (
    <article
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-[18px] transition"
      style={
        claimable
          ? { borderColor: 'rgba(240,180,41,.4)', background: 'rgba(240,180,41,.06)' }
          : { borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg3)' }
      }
    >
      <div className="flex items-start justify-between gap-2.5">
        <span
          className="grid size-11 place-items-center rounded-xl border"
          style={{ background: 'rgba(240,180,41,.12)', borderColor: 'rgba(240,180,41,.3)' }}
        >
          <Icon name={crate.icon} size={23} className="text-gold" />
        </span>
        <span
          className="rounded-[5px] border px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-gold"
          style={{ background: 'rgba(6,14,9,.7)', borderColor: 'rgba(240,180,41,.3)' }}
        >
          {crate.tag}
        </span>
      </div>
      <div>
        <div className="font-heading text-[17px] font-bold tracking-[0.03em] text-[#eafff3]">{crate.name}</div>
        <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">{crate.desc}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: '#0a1a11' }}>
          <div className="h-full" style={{ width: `${pct}%`, background: claimable ? 'linear-gradient(90deg,#d69a0e,#f7d774)' : 'linear-gradient(90deg,#16a862,#35eb95)' }} />
        </div>
        <span className="font-mono text-[10.5px] text-muted">{crate.progress}/{crate.total}</span>
      </div>
      <button
        disabled={!claimable}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[9px] border-0 py-[11px] font-heading text-[13.5px] font-bold tracking-[0.07em] disabled:cursor-not-allowed"
        style={
          claimable
            ? { background: 'linear-gradient(180deg, #f7d774, #d69a0e)', color: '#241800' }
            : { background: 'var(--panel-bg2)', color: 'var(--muted)' }
        }
      >
        <Icon name={crate.icon} size={18} />
        {claimable ? 'OPEN NOW' : `${crate.progress}/${crate.total}`}
      </button>
    </article>
  );
}

/**
 * Static/mock content for now (per project decision) — no backend concept of
 * streaks, crates or rakeback claims exists yet. `rewardsMock.ts` isolates
 * the placeholder data; the rakeback progress bar uses real `totalWagered`.
 */
export function Rewards() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return (
      <>
        <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">REWARDS</h1>
        <p className="mb-5 text-sm text-muted">{SUBTITLE}</p>
        <ConnectWalletPlaceholder what="your rewards, streaks and rakeback" icon="gift" />
      </>
    );
  }

  const wagered = Number(user?.totalWagered ?? '0');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">REWARDS</h1>
        <p className="text-sm text-muted">{SUBTITLE}</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <section
          className="relative flex min-w-0 flex-col overflow-hidden rounded-[18px] border p-[clamp(18px,2.4vw,26px)]"
          style={{ borderColor: 'rgba(240,180,41,.24)', background: 'radial-gradient(600px 280px at 88% 0%, rgba(240,180,41,.18), rgba(6,9,7,0) 62%), linear-gradient(120deg, #16130a, #080c09)' }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: 'linear-gradient(rgba(240,180,41,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(240,180,41,.05) 1px, transparent 1px)', backgroundSize: '44px 44px' }}
          />
          <div className="relative flex h-full flex-col">
            <span className="inline-flex w-fit items-center gap-2 rounded-[6px] border px-[11px] py-[5px]" style={{ borderColor: 'rgba(240,180,41,.32)', background: 'rgba(240,180,41,.14)' }}>
              <span className="size-1.5 rounded-full bg-[#f0b429]" style={{ animation: 'irPulse 1.8s infinite' }} />
              <span className="font-mono text-[10px] tracking-[0.18em] text-[#f7d774]">READY TO CLAIM</span>
            </span>
            <div className="mt-[18px] font-mono text-[10px] tracking-[0.18em] text-gold">UNCLAIMED BALANCE</div>
            <div className="mt-1.5 flex items-end gap-2.5">
              <span className="font-heading text-[clamp(38px,5vw,58px)] leading-none font-bold text-[#f7d774]" style={{ textShadow: '0 0 34px rgba(240,180,41,.35)' }}>
                {formatSol(MOCK_UNCLAIMED)}
              </span>
              <span className="pb-[7px] font-mono text-[14px] text-gold">SOL</span>
            </div>
            <p className="mt-2.5 max-w-[380px] text-[13px] leading-[1.5] text-[#a89a72]">
              Rakeback accrues on every settled match. Claims land in your playable balance instantly.
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-[22px]">
              <button
                className="flex flex-1 basis-[170px] cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border-0 px-5 py-[13px] font-heading text-sm font-bold tracking-[0.06em]"
                style={{ background: 'linear-gradient(180deg, #f7d774, #d69a0e)', color: '#241800', boxShadow: '0 8px 24px rgba(240,180,41,.26)' }}
              >
                <Icon name="gift" size={19} />
                CLAIM ALL
              </button>
              <button
                className="flex flex-none cursor-pointer items-center gap-2 rounded-[10px] border px-[18px] py-[13px] font-heading text-[13.5px] font-bold tracking-[0.06em] text-[#f7d774]"
                style={{ borderColor: 'rgba(240,180,41,.26)', background: 'rgba(240,180,41,.06)' }}
              >
                <History size={18} />
                HISTORY
              </button>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <div className="rounded-[18px] border p-[18px]" style={{ borderColor: 'rgba(47,224,138,.16)', background: 'linear-gradient(160deg, rgba(47,224,138,.1), rgba(6,9,7,0) 62%), var(--panel-bg)' }}>
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <Flame size={20} className="text-green" />
                <span className="font-heading text-[15px] font-bold tracking-[0.05em] text-[#eafff3]">DAILY STREAK</span>
              </div>
              <span className="font-mono text-[11px] text-[#6ee7b7]">
                DAY {MOCK_STREAK.filter((d) => d.state !== 'locked').length} / {MOCK_STREAK.length}
              </span>
            </div>
            <StreakStrip />
            <p className="mt-3 text-[12.5px] text-muted">Play one match a day. Day 7 pays 0.05 SOL.</p>
          </div>
          <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
            <StatTile icon="chart" label="STREAK BONUS" value="0.008 SOL" color="var(--green)" />
            <StatTile icon="percent" label="RAKEBACK RATE" value="4%" color="var(--gold-bright)" />
            <StatTile icon="gift" label="CRATES OPEN" value="1" color="var(--text)" />
          </div>
        </section>
      </div>

      <RakebackProgress wagered={wagered} />

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-[20px] font-bold tracking-[0.05em] text-text">REWARD CRATES</h2>
          <span className="font-mono text-[11px] text-[#8fbfa6]">SEASON 01</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">
          {MOCK_CRATES.map((c) => (
            <CrateCard key={c.id} crate={c} />
          ))}
        </div>
      </section>

      <Panel>
        <PanelHeader title="CLAIM HISTORY" meta="LAST 5" />
        {MOCK_CLAIMS.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">No claims yet.</p>
        ) : (
          <TableScroll minWidth={520}>
            <TableHead template={CLAIMS_TEMPLATE} columns={[{ label: 'REWARD' }, { label: 'CLAIMED' }, { label: 'SOURCE' }, { label: 'AMOUNT', align: 'right' }]} />
            {MOCK_CLAIMS.map((c) => (
              <TableRow key={c.id} template={CLAIMS_TEMPLATE}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon name="gift" size={18} className="text-gold" />
                  <span className="truncate font-heading text-[13.5px] font-semibold text-[#e8f2ec]">{c.name}</span>
                </span>
                <span className="font-mono text-[11.5px] text-[#a9c3b6]">{formatDate(c.when)}</span>
                <span className="font-mono text-[11.5px] text-[#9fb6a9]">{c.source}</span>
                <span className="text-right font-mono text-[12.5px] text-green">+{formatSol(c.amount)}</span>
              </TableRow>
            ))}
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
