import { ConnectWalletButton } from '../shared/ConnectWalletButton';
import { Card } from '../shared/ui';

/**
 * Doc 06, verbatim: "Generic reusable component: shows a message + Connect
 * Wallet button in place of real content. Used identically across Profile,
 * Wallet Balance, and History sections — one component, not three custom ones."
 *
 * The only thing that varies between the three is the `what` line.
 */
export function ConnectWalletPlaceholder({
  what,
  icon = '🔒',
}: {
  /** What the user would see here, e.g. "your wallet balance". */
  what: string;
  icon?: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="text-4xl opacity-70" aria-hidden>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-ink-100">Connect Wallet to view</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-400">
          Connect your Solana wallet to see {what}.
        </p>
      </div>
      <ConnectWalletButton />
      <p className="text-xs text-ink-400">
        Signing is free and never moves funds — it only proves the wallet is yours.
      </p>
    </Card>
  );
}
