import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

/**
 * Doc 01: wallet-connect only, Phantom and Solflare.
 *
 * The wallet extension holds the private key and does all signing in the
 * user's browser — nothing secret ever reaches our frontend or backend.
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

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
