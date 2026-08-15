import { useAuth } from '../../hooks/useAuth';
import { shortAddress } from '../../lib/format';
import { Button, Spinner } from './ui';

/**
 * Doc 01 + doc 06: ONE button, used in both places the docs name — the landing
 * page CTA area and every gated dashboard section.
 *
 * It has three states: signed out, signing, signed in. When signed in it shows
 * the short address and doubles as the sign-out control.
 */
export function ConnectWalletButton({
  size = 'md',
  label = 'Connect Wallet',
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const { isAuthenticated, isAuthenticating, user, signIn, signOut } = useAuth();

  if (isAuthenticating) {
    return (
      <Button size={size} disabled>
        <Spinner /> Check your wallet…
      </Button>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 font-mono text-sm text-ink-300 sm:inline">
          {user.displayName || shortAddress(user.walletAddress)}
        </span>
        <Button size={size} variant="ghost" onClick={signOut}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button size={size} onClick={() => void signIn()}>
      {label}
    </Button>
  );
}
