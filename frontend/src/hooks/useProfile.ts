import { useCallback, useEffect, useState } from 'react';
import { profileApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { Profile } from '../types';

/**
 * Doc 11 — one profile, own or somebody else's.
 *
 * Same shape as useReferrals and useLeaderboard: plain useState/useEffect with a
 * `cancelled` flag, and a `nonce` counter for manual refetch. This project has no
 * react-query, and a bespoke cache here would be the only one in the codebase.
 *
 * `notFound` is separated from `error` because they are different pages: an
 * unknown handle is "no such player", a failed request is "try again". Collapsing
 * them would tell someone their friend does not exist when the API is simply down.
 */
export function useProfile(target: string | 'me' | null): {
  data: Profile | null;
  loading: boolean;
  error: boolean;
  notFound: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(target !== null);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (target === null) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setNotFound(false);

    const request = target === 'me' ? profileApi.me() : profileApi.byHandle(target);

    void request
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, nonce]);

  return { data, loading, error, notFound, reload };
}
