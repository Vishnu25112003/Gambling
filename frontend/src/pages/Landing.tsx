import { useNavigate } from 'react-router-dom';
import { SceneCanvas } from '../components/shared/SceneCanvas';
import { Icon, LogoMark, MoonIcon, SunIcon, type IconName } from '../components/shared/icons';
import { useTheme } from '../hooks/useTheme';

const CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || 'devnet';

const TRUST_CARDS: { title: string; desc: string; icon: IconName }[] = [
  { title: 'Wallet-only login', desc: 'Sign a message. No credentials, ever.', icon: 'wallet' },
  { title: 'Instant bets', desc: 'Settlement is off-chain, so play is instant.', icon: 'bolt' },
  { title: 'Escrowed stakes', desc: 'Bets lock into escrow until a match ends.', icon: 'lock' },
];

const HERO_STATS: { title: string; desc: string; icon: IconName }[] = [
  { title: 'Multiple Games', desc: 'More coming soon', icon: 'gamepad' },
  { title: 'Provably Fair', desc: 'Verifiable outcomes', icon: 'shield' },
  { title: 'Instant Play', desc: 'No waiting, just play', icon: 'bolt' },
  { title: '5% House Edge', desc: 'Transparent & fair', icon: 'percent' },
];

/**
 * Doc 06's public landing page, rebuilt to the `GamblingHub.dc.html` design.
 *
 * It owns its own header rather than sharing the dashboard's, because the two
 * chromes are entirely different in the design: this one is a centred marketing
 * bar, the dashboard's is a sidebar plus a search row.
 *
 * Nothing here touches the API or the wallet — the CTA routes into the
 * dashboard, which is where gating begins.
 */
export function Landing() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const goDashboard = () => navigate('/dashboard');

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse 900px 500px at 50% -10%, rgba(34,197,94,var(--page-glow)), transparent 60%), var(--bg)',
      }}
    >
      <div
        style={{
          background:
            'radial-gradient(ellipse 55% 30% at 18% 12%, rgba(34,197,94,0.14), transparent 62%),' +
            'radial-gradient(ellipse 48% 26% at 84% 16%, rgba(34,197,94,0.12), transparent 62%),' +
            'radial-gradient(ellipse 80% 34% at 50% 104%, rgba(34,197,94,0.08), transparent 66%),' +
            'var(--bg)',
        }}
      >
        {/* Doc 00's compliance note: this must never read as real-money play. */}
        <div className="bg-banner p-2 text-center text-[13px] font-medium text-gold">
          Playing on Solana <span className="uppercase">{CLUSTER}</span> — test SOL only, no real
          money.
        </div>

        <header className="sticky top-0 z-50 flex items-center justify-between gap-2.5 border-b border-line2 bg-bg2 px-[clamp(14px,4vw,40px)] py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-[34px] items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,var(--green-solid),var(--green-deep))]">
              <LogoMark size={18} />
            </div>
            <span className="text-[clamp(16px,4vw,19px)] font-bold whitespace-nowrap">
              Gambling<span className="text-green">Hub</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="flex size-[38px] cursor-pointer items-center justify-center rounded-[10px] border border-line bg-card text-muted hover:text-text"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              onClick={goDashboard}
              className="cursor-pointer rounded-[11px] border-none bg-[linear-gradient(135deg,var(--green-solid),var(--green-deep))] px-[clamp(14px,3vw,26px)] py-3 text-[clamp(12.5px,3vw,14.5px)] font-bold whitespace-nowrap text-on-green shadow-[0_8px_24px_rgba(34,197,94,0.22)] transition hover:brightness-110"
            >
              Launch Dashboard →
            </button>
          </div>
        </header>

        {/* ── hero ─────────────────────────────────────────────── */}
        <section className="relative flex min-h-[calc(100svh-96px)] flex-col justify-center overflow-hidden">
          <SceneCanvas
            scene="hero"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              pointerEvents: 'none',
              zIndex: 0,
              WebkitMaskImage:
                'radial-gradient(78% 46% at 50% 50%,rgba(0,0,0,.16),rgba(0,0,0,.6) 58%,#000 86%)',
              maskImage:
                'radial-gradient(78% 46% at 50% 50%,rgba(0,0,0,.16),rgba(0,0,0,.6) 58%,#000 86%)',
            }}
          />

          <div className="relative mx-auto box-border w-full max-w-[780px] px-[clamp(16px,4vw,24px)] py-[clamp(40px,7vw,72px)] text-center">
            <span className="mb-[26px] inline-flex items-center gap-[7px] rounded-full border border-green-solid/30 bg-green-solid/10 px-4 py-[7px] text-[13px] font-semibold text-green">
              <span className="size-1.5 rounded-full bg-green" />
              Live on Solana Devnet
            </span>

            <h1
              className="m-0 mb-5 text-[clamp(36px,7vw,68px)] leading-[1.02] font-extrabold tracking-[-0.02em]"
              style={{ textWrap: 'balance' }}
            >
              One wallet.
              <br />
              <span className="text-green">Every game.</span>
            </h1>

            <p
              className="mx-auto mb-8 max-w-[620px] text-[clamp(14.5px,1.6vw,17px)] leading-[1.6] text-muted"
              style={{ textWrap: 'pretty' }}
            >
              Connect a Solana wallet, deposit once, and play across the whole hub. Instant
              off-chain settlement, on-chain deposits and withdrawals, and a 5% house fee you can
              actually see.
            </p>

            <button
              onClick={goDashboard}
              className="cursor-pointer rounded-xl border-none bg-[linear-gradient(135deg,var(--green-solid),var(--green-deep))] px-[34px] py-4 text-base font-bold text-on-green shadow-[0_14px_34px_rgba(34,197,94,0.26)] transition hover:brightness-110"
            >
              Enter the Hub →
            </button>

            <p className="mt-[18px] text-[13px] text-faint">
              No signup, no password, no email. Your wallet is your account.
            </p>
          </div>
        </section>

        {/* ── trust cards, stats, table strip ──────────────────── */}
        <section className="relative flex min-h-[100svh] flex-col pt-[clamp(48px,8vw,90px)]">
          <div className="relative mx-auto box-border grid w-full max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[18px] px-[clamp(16px,4vw,24px)] pb-10">
            {TRUST_CARDS.map((c) => (
              <div
                key={c.title}
                className="flex items-start gap-4 rounded-2xl border border-line bg-card p-[22px]"
              >
                <div className="flex size-[46px] shrink-0 items-center justify-center rounded-xl border border-green-solid/20 bg-green-solid/[0.12] text-green">
                  <Icon name={c.icon} size={20} />
                </div>
                <div>
                  <div className="mb-1.5 text-base font-bold">{c.title}</div>
                  <div className="text-[13.5px] leading-[1.5] text-muted">{c.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="relative mx-auto mb-[70px] box-border w-full max-w-[1120px] px-[clamp(16px,4vw,24px)]">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-0.5 overflow-hidden rounded-[18px] border border-line bg-line2">
              {HERO_STATS.map((s) => (
                <div key={s.title} className="flex items-center gap-3.5 bg-bg2 px-[22px] py-5">
                  <div className="flex size-[42px] shrink-0 items-center justify-center rounded-[11px] bg-green-solid/[0.12] text-green">
                    <Icon name={s.icon} size={20} />
                  </div>
                  <div>
                    <div className="text-[15px] font-bold">{s.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-auto">
            <SceneCanvas
              scene="strip"
              style={{
                display: 'block',
                width: '100%',
                height: 'clamp(220px,26vw,330px)',
                pointerEvents: 'none',
                WebkitMaskImage: 'linear-gradient(#0000,#000 26%,#000 74%,#0000)',
                maskImage: 'linear-gradient(#0000,#000 26%,#000 74%,#0000)',
              }}
            />
          </div>

          <footer className="relative px-6 pb-[70px] text-center">
            <p className="text-[13px] text-faint">
              Gambling Hub · Devnet build · Not for real-money play pending legal review.
            </p>
          </footer>
        </section>
      </div>
    </div>
  );
}
