import { useEffect, useState } from 'react';
import { walletApi } from '../api/endpoints';
import type { WalletSummary } from '../types';

/** Lifetime deposited/withdrawn/rewards/fees for the Transactions page's stat tiles. */
export function useWalletSummary(enabled: boolean): {
  data: WalletSummary | null;
  loading: boolean;
} {
  const [data, setData] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void walletApi
      .summary()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data, loading };
}
