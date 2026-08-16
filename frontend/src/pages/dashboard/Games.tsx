import { GameTile } from '../../components/dashboard/GameTile';
import { PageTitle, Spinner } from '../../components/shared/ui';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import type { GameManifest } from '../../types';

/**
 * Doc 06: the games list is UNGATED — it renders without a wallet. Only
 * pressing a playable game triggers the connect flow.
 */
export function Games() {
  const { games, loading, isPlaceholder } = useGames();
  const { isAuthenticated, signIn } = useAuth();

  const handlePlay = (game: GameManifest) => {
    if (!isAuthenticated) {
      void signIn();
      return;
    }
    // Once games exist this routes to /dashboard/play/<id>.
    console.info(`play ${game.id}`);
  };

  return (
    <>
      <PageTitle
        title="Games"
        subtitle={
          isPlaceholder
            ? 'No games are live yet — the foundation layer is built first.'
            : 'Pick a game to start playing.'
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-[18px]">
          {games.map((game) => (
            <GameTile
              key={game.id}
              game={game}
              size="large"
              // A placeholder is not playable, so it gets no click affordance.
              onClick={isPlaceholder ? undefined : handlePlay}
            />
          ))}
        </div>
      )}
    </>
  );
}
