import { useCallback, useEffect, useState } from 'react';
import { rewardsApi } from '../api/endpoints';
import type { RewardsSummary } from '../types';

/**
 * The Rewards page's rakeback data — same shape as useReferrals (plain
 * useState/useEffect with a `cancelled` flag; this project has no react-query).
 * `reload` refetches after a claim so the unclaimed amount and the claim
 * history reflect what the server now holds.
 */
export function useRewards(enabled: boolean): {
  data: RewardsSummary | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<RewardsSummary | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void rewardsApi
      .me()
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
  }, [enabled, nonce]);

  return { data, loading, error, reload };
}
