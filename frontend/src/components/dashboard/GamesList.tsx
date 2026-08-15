import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import { GamePreviewCard } from '../landing/GamePreviewCard';
import { SectionHeading, Spinner } from '../shared/ui';
import type { GameManifest } from '../../types';

/**
 * Doc 06: the games list is UNGATED — visible without connecting. Only the
 * "Play" click checks connection state and triggers the wallet flow.
 */
export function GamesList() {
  const { games, loading, isPlaceholder } = useGames();
  const { isAuthenticated, signIn } = useAuth();

  const handlePlay = (game: GameManifest) => {
    // Doc 06: "Not connected -> triggers Connect Wallet flow first."
    if (!isAuthenticated) {
      void signIn();
      return;
    }
    // Once games exist, this routes to /dashboard/play/<id>.
    console.info(`play ${game.id}`);
  };

  return (
    <section>
      <SectionHeading
        title="Games"
        subtitle={
          isPlaceholder
            ? 'No games are live yet — the foundation layer is built first.'
            : 'Pick a game to start playing.'
        }
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {games.map((game) => (
            <GamePreviewCard key={game.id} game={game} onPlay={handlePlay} />
          ))}
        </div>
      )}
    </section>
  );
}
