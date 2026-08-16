import { ConnectWalletButton } from '../shared/ConnectWalletButton';
import { Card } from '../shared/ui';
import { Icon, type IconName } from '../shared/icons';

/**
 * Doc 06, verbatim: "Generic reusable component: shows a message + Connect
 * Wallet button in place of real content. Used identically across Profile,
 * Wallet Balance, and History sections — one component, not three custom ones."
 *
 * The only thing that varies between them is the `what` line.
 */
export function ConnectWalletPlaceholder({
  what,
  icon = 'lock',
}: {
  /** What the user would see here, e.g. "your wallet balance". */
  what: string;
  icon?: IconName;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
      <div className="flex justify-center text-faint" style={{ transform: 'scale(1.7)' }}>
        <Icon name={icon} size={22} />
      </div>
      <div>
        <p className="text-[15.5px] font-bold">Connect Wallet to view</p>
        <p className="mx-auto mt-1.5 max-w-xs text-[12.5px] text-muted">
          Connect your Solana wallet to see {what}.
        </p>
      </div>
      <ConnectWalletButton />
      <p className="text-[11.5px] text-faint">
        Signing is free and never moves funds — it only proves the wallet is yours.
      </p>
    </Card>
  );
}
