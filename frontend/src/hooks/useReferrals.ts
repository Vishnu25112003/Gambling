import { useCallback, useEffect, useState } from 'react';
import { referralApi } from '../api/endpoints';
import type { ReferralStats } from '../types';

/**
 * Doc 09 — the Invite & Earn page's data.
 *
 * Same shape as useLeaderboard: plain useState/useEffect with a `cancelled`
 * flag. This project has no react-query, and a bespoke cache here would be the
 * only one in the codebase.
 *
 * `reload` exists because claiming a code changes the page's own answer — the
 * "enter a code" box disappears and `referredBy` appears — so the page needs to
 * refetch without a full remount.
 */
export function useReferrals(enabled: boolean): {
  data: ReferralStats | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<ReferralStats | null>(null);
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

    void referralApi
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
