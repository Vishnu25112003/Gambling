import { useAuth } from '../../hooks/useAuth';

/**
 * The one place a failed sign-in becomes visible.
 *
 * `isAuthenticated` is `Boolean(user)` — a value that comes from OUR API, not
 * from the wallet — so a wallet that connects and signs perfectly still leaves
 * every button reading "Connect Wallet" when the request behind it fails. Until
 * this existed, `AuthState.error` was set and rendered by nothing, which made a
 * 500 from `/api/auth/verify` look exactly like a dead click.
 *
 * Mounted once, above the routes, because there are four separate places a user
 * can start a sign-in (landing CTA, topbar, drawer footer, gated placeholder)
 * and only one of them has room for a message beside the button.
 *
 * It does not auto-dismiss. A sign-in failure is not a notification — it is a
 * broken state the user needs time to read and act on.
 */
export function AuthErrorBanner() {
  const { error, clearError } = useAuth();

  if (!error) return null;

  return (
    <div role="alert" className="fixed inset-x-0 bottom-5 z-[200] flex justify-center px-4">
      <div className="flex max-w-lg items-start gap-3 rounded-xl border border-red/30 bg-bg2 px-4 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
        <span
          aria-hidden
          className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-red text-[12px] leading-none font-bold text-bg"
        >
          !
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-red">Could not sign in</p>
          <p className="mt-0.5 text-[12.5px] break-words text-muted">{error}</p>
        </div>
        <button
          onClick={clearError}
          aria-label="Dismiss"
          className="ml-1 shrink-0 cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-[15px] leading-none text-faint hover:text-text"
        >
          ×
        </button>
      </div>
    </div>
  );
}
