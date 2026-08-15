import { useEffect, useState } from 'react';
import { publicApi } from '../api/endpoints';
import { PLACEHOLDER_GAMES } from '../lib/placeholderGames';
import type { GameManifest } from '../types';

/**
 * Public games list. Falls back to "Coming Soon" placeholders while the
 * registry is empty or the backend is unreachable, so the UI is developable
 * with no backend running at all — doc 06's dependency note.
 */
export function useGames(): { games: GameManifest[]; loading: boolean; isPlaceholder: boolean } {
  const [games, setGames] = useState<GameManifest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void publicApi
      .games()
      .then((res) => {
        if (!cancelled) setGames(res.games);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isPlaceholder = !loading && games.length === 0;
  return { games: isPlaceholder ? PLACEHOLDER_GAMES : games, loading, isPlaceholder };
}
