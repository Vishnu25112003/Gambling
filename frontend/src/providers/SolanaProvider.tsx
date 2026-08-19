import { useCallback, useMemo, type ReactNode } from 'react';
import type { WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';

/**
 * Doc 01: wallet-connect only, Phantom and Solflare.
 *
 * The wallet extension holds the private key and does all signing in the
 * user's browser — nothing secret ever reaches our frontend or backend.
 *
 * The two adapters are imported from their own packages rather than from the
 * `@solana/wallet-adapter-wallets` barrel. That barrel is 36 `export *` lines,
 * and Vite's dep optimiser has to pre-bundle all of it: ~1.8 MB across 300
 * files, dragging in WalletConnect, Torus and the Keystone chain that hoists
 * react-dom@16 into the repo root. Nothing here uses those 34 other wallets.
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

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

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
