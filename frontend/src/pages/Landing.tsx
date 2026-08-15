import { useNavigate } from 'react-router-dom';
import { Hero } from '../components/landing/Hero';
import { GamePreviewCard } from '../components/landing/GamePreviewCard';
import { LeaderboardTeaser } from '../components/landing/LeaderboardTeaser';
import { useGames } from '../hooks/useGames';
import { Button, SectionHeading } from '../components/shared/ui';

/**
 * Doc 06 — the public landing page. Hero, game previews, leaderboard teaser,
 * CTA. No wallet connection required anywhere on this page.
 */
export function Landing() {
  const { games } = useGames();
  const navigate = useNavigate();

  return (
    <>
      <Hero />

      <section className="mx-auto max-w-6xl px-4 py-16">
        <SectionHeading
          title="The games"
          subtitle="Each game plugs into the same wallet, balance and escrow layer."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {games.map((game) => (
            <GamePreviewCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      <LeaderboardTeaser />

      <section className="mx-auto max-w-3xl px-4 pb-24 text-center">
        <h2 className="font-display text-3xl font-bold">Ready to play?</h2>
        <p className="mt-3 text-ink-300">
          Browse the hub without connecting. You'll only be asked for your wallet when you actually
          place a bet.
        </p>
        <Button size="lg" className="mt-8" onClick={() => navigate('/dashboard')}>
          Enter the Hub →
        </Button>
      </section>
    </>
  );
}
