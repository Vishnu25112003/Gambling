import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import bs58 from 'bs58';
import { authApi, walletApi } from '../api/endpoints';
import { tokenStore } from '../api/client';
import { captureReferralFromUrl, referralStore } from '../lib/referralCapture';
import type { AppUser, Balance } from '../types';

export interface AuthState {
  user: AppUser | null;
  balance: Balance | null;
  /** True once a wallet is connected AND the signature has been verified. */
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  /** True while the stored session is being restored on first paint. */
  isRestoring: boolean;
  error: string | null;
  /** Opens the wallet picker if needed, then runs the sign-in flow. */
  signIn: () => Promise<void>;
  signOut: () => void;
  refreshBalance: () => Promise<void>;
  setUser: (user: AppUser) => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const [user, setUser] = useState<AppUser | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [isAuthenticating, setAuthenticating] = useState(false);
  const [isRestoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Set while a sign-in is in flight, so autoConnect can't start a second one. */
  const inFlight = useRef(false);
  /** Set when the user explicitly signs out, so autoConnect doesn't re-prompt. */
  const suppressAuto = useRef(false);

  /**
   * Doc 09 — grab `?ref=` before anything else can navigate away from it.
   *
   * Runs on mount rather than at sign-in, because by the time a wallet is
   * connected the visitor may be several route changes past the link they
   * arrived on.
   */
  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  // Restore an existing session on first load.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!tokenStore.get()) {
        setRestoring(false);
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!tokenStore.get()) return;
    try {
      setBalance(await walletApi.balance());
    } catch {
      // A failed balance poll is not worth surfacing as an error banner.
    }
  }, []);

  useEffect(() => {
    if (user) void refreshBalance();
  }, [user, refreshBalance]);

  /**
   * Doc 01's flow, steps 3-7: request a challenge, sign it in the wallet, send
   * the signature back, receive a session token.
   */
  const runSignIn = useCallback(async () => {
    if (!publicKey || !signMessage || inFlight.current) return;
    inFlight.current = true;
    setAuthenticating(true);
    setError(null);

    try {
      const address = publicKey.toBase58();
      const { nonce, message } = await authApi.challenge(address);

      const signature = await signMessage(new TextEncoder().encode(message));

      // Doc 09 — spend the captured invite code, if there is one. The server
      // ignores it when the caller is not eligible and never fails the sign-in
      // over it, so a stale code costs nothing.
      const { token, user: me } = await authApi.verify(
        address,
        nonce,
        bs58.encode(signature),
        referralStore.peek() ?? undefined,
      );
      tokenStore.set(token);
      setUser(me);

      // Cleared whether or not it applied. A code that was rejected once — the
      // account already has a referrer, or has already played — will be
      // rejected every time, and keeping it around would re-send it forever.
      referralStore.clear();
    } catch (err) {
      const msg = (err as Error).message || 'Sign-in failed.';
      // Rejecting the signature prompt is a normal user action, not an error.
      setError(/user rejected|denied|declined/i.test(msg) ? null : msg);
      tokenStore.clear();
    } finally {
      inFlight.current = false;
      setAuthenticating(false);
    }
  }, [publicKey, signMessage]);

  /**
   * A connected wallet with no session yet means we still need a signature —
   * this fires on first connect and after an autoConnect on reload.
   */
  useEffect(() => {
    if (connected && publicKey && !user && !isRestoring && !suppressAuto.current) {
      void runSignIn();
    }
  }, [connected, publicKey, user, isRestoring, runSignIn]);

  const signIn = useCallback(async () => {
    suppressAuto.current = false;
    if (!connected) {
      setVisible(true); // wallet picker; the effect above takes it from there
      return;
    }
    await runSignIn();
  }, [connected, setVisible, runSignIn]);

  const signOut = useCallback(() => {
    suppressAuto.current = true;
    tokenStore.clear();
    setUser(null);
    setBalance(null);
    setError(null);
    void disconnect();
  }, [disconnect]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      balance,
      isAuthenticated: Boolean(user),
      isAuthenticating,
      isRestoring,
      error,
      signIn,
      signOut,
      refreshBalance,
      setUser,
    }),
    [user, balance, isAuthenticating, isRestoring, error, signIn, signOut, refreshBalance],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
