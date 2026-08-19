import { useEffect, useState } from 'react';
import { profileApi } from '../api/endpoints';
import type { MatchHistoryPage } from '../types';

/**
 * Doc 11 — a page of match history.
 *
 * Kept separate from `useProfile` so paging through history does not refetch the
 * whole stat block, and so the tables can show their own spinner while the rest of
 * the page stays put.
 */
export function useMatchHistory(
  target: string | 'me' | null,
  page: number,
  limit = 10,
): { data: MatchHistoryPage | null; loading: boolean; error: boolean } {
  const [data, setData] = useState<MatchHistoryPage | null>(null);
  const [loading, setLoading] = useState(target !== null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (target === null) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void profileApi
      .history(target, page, limit)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, page, limit]);

  return { data, loading, error };
}
