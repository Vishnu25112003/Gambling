import { useNavigate } from 'react-router-dom';
import { Button } from '../shared/ui';

/**
 * Doc 06: the landing hero is static branding with no data dependency, and the
 * CTA routes straight into the dashboard — deliberately NOT gated on a wallet.
 */
export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-neon-500/30 bg-neon-500/10 px-4 py-1.5 text-xs font-semibold text-neon-400">
          <span className="size-1.5 animate-pulse rounded-full bg-neon-400" />
          Live on Solana Devnet
        </span>

        <h1 className="mt-6 font-display text-5xl font-bold tracking-tight sm:text-6xl">
          One wallet.
          <br />
          <span className="bg-gradient-to-r from-neon-400 to-gold-400 bg-clip-text text-transparent">
            Every game.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg text-ink-300">
          Connect a Solana wallet, deposit once, and play across the whole hub. Instant off-chain
          settlement, on-chain deposits and withdrawals, and a 5% house fee you can actually see.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={() => navigate('/dashboard')}>
            Enter the Hub →
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/dashboard/leaderboard')}>
            View Leaderboard
          </Button>
        </div>

        <p className="mt-6 text-xs text-ink-400">
          No signup, no password, no email. Your wallet is your account.
        </p>
      </div>

      <div className="mx-auto mt-20 grid max-w-4xl gap-4 sm:grid-cols-3">
        {[
          { icon: '🔑', title: 'Wallet-only login', body: 'Sign a message. No credentials, ever.' },
          { icon: '⚡', title: 'Instant bets', body: 'Settlement is off-chain, so play is instant.' },
          { icon: '🔒', title: 'Escrowed stakes', body: 'Bets lock into escrow until a match ends.' },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-ink-800 bg-ink-900/50 p-6">
            <div className="text-2xl" aria-hidden>
              {f.icon}
            </div>
            <h3 className="mt-3 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-ink-400">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
