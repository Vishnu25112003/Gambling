import { useNavigate } from 'react-router-dom';
import { GameCard } from '../../components/dashboard/GameCard';
import { Spinner } from '../../components/shared/ui';
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
  const navigate = useNavigate();

  const handlePlay = (game: GameManifest) => {
    if (!isAuthenticated) {
      void signIn();
      return;
    }
    navigate(`/dashboard/play/${game.id}`);
  };

  return (
    <>
      <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold tracking-[0.02em] text-[#f2fff8]">
        GAME LOBBY
      </h1>
      <p className="mb-5 text-sm text-muted">
        {isPlaceholder
          ? 'No games are live yet — the foundation layer is built first.'
          : 'Five games, one wallet, one escrow layer. Pick your table.'}
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              variant="lobby"
              onClick={isPlaceholder ? undefined : handlePlay}
            />
          ))}
        </div>
      )}
    </>
  );
}
