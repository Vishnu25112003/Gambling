import { useCallback, useMemo, type ReactNode } from 'react';
import type { WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

/**
 * Doc 01: wallet-connect only, Phantom and Solflare.
 *
 * The wallet extension holds the private key and does all signing in the
 * user's browser — nothing secret ever reaches our frontend or backend.
 *
 * No adapters are instantiated here on purpose. Current Phantom and Solflare
 * extensions self-register as Wallet Standard wallets, and `WalletProvider`
 * auto-detects those. Also instantiating the legacy `PhantomWalletAdapter` /
 * `SolflareWalletAdapter` on top of that registers each wallet twice and
 * makes the legacy adapter try to talk to the extension over a message
 * channel it no longer answers the same way on — that's the source of the
 * "Could not establish connection. Receiving end does not exist." errors and
 * a Connect button that silently never resolves.
 */
export function SolanaProvider({ children }: { children: ReactNode }) {
  const cluster = (import.meta.env.VITE_SOLANA_CLUSTER || 'devnet') as
    | 'devnet'
    | 'testnet'
    | 'mainnet-beta';

  const endpoint = useMemo(
    () => import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl(cluster),
    [cluster],
  );

  const wallets = useMemo(() => [], []);

  /**
   * Without an `onError`, wallet-adapter's default handler runs instead: it
   * `console.error`s and, for `WalletNotReadyError`, calls `window.open` on the
   * wallet's download page. Popup blockers eat that silently, so a wallet that
   * is not installed looks exactly like a button that does nothing.
   *
   * A user closing the extension's own popup is a normal action, not a fault,
   * so it is logged and otherwise ignored.
   */
  const onError = useCallback((err: WalletError) => {
    if (/user rejected|denied|declined/i.test(err.message)) {
      console.info('[wallet] request dismissed by the user:', err.name);
      return;
    }
    console.error('[wallet]', err.name, err.message, err);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
