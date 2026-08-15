import { useEffect, useState } from 'react';
import { publicApi } from '../api/endpoints';
import type { LeaderboardEntry } from '../types';

/** Public data (doc 06) — both the landing teaser and the dashboard use this. */
export function useLeaderboard(limit = 20): {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: boolean;
} {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void publicApi
      .leaderboard(limit)
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
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
  }, [limit]);

  return { entries, loading, error };
}
