/**
 * Doc 09 — capturing an invite code from the URL.
 *
 * Someone arriving at `/?ref=7KX9AB4C` is usually several steps away from having
 * an identity: they still have to install a wallet, connect it, and sign. The
 * code is parked in localStorage so it survives every one of those hops, then
 * spent at sign-in.
 *
 * Deliberately mirrors `tokenStore` in api/client.ts — same key prefix, same
 * tiny get/set/clear shape — so there is one obvious pattern for "browser-local
 * string we care about" rather than two.
 */

const REF_KEY = 'gambling-hub.ref';

/** Matches the backend's Crockford base32 alphabet, so junk never reaches the API. */
const CODE_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

function isPlausible(code: string): boolean {
  return CODE_PATTERN.test(code);
}

export const referralStore = {
  /** Read without consuming — the Invite page pre-fills its code box from this. */
  peek(): string | null {
    try {
      return localStorage.getItem(REF_KEY);
    } catch {
      // Safari in private mode throws on localStorage. A missing referral is a
      // far better outcome than a blank page.
      return null;
    }
  },

  set(code: string): void {
    try {
      localStorage.setItem(REF_KEY, code);
    } catch {
      /* see above */
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(REF_KEY);
    } catch {
      /* see above */
    }
  },
};

/**
 * Pull `?ref=` off the current URL and remember it. Call once, early.
 *
 * The parameter is stripped from the address bar afterwards via `replaceState`,
 * so the code does not ride along into every link the visitor shares next — and
 * so a reload does not look like a fresh invite click.
 *
 * An existing stored code is NOT overwritten: the first inviter to send someone
 * here is the one who gets the credit.
 */
export function captureReferralFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  const raw = url.searchParams.get('ref');
  if (!raw) return referralStore.peek();

  const code = raw.trim().toUpperCase();

  url.searchParams.delete('ref');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);

  if (!isPlausible(code)) return referralStore.peek();
  if (referralStore.peek()) return referralStore.peek();

  referralStore.set(code);
  return code;
}
