import { useEffect, useState } from 'react';
import { profileApi } from '../api/endpoints';

export interface UsernameCheckState {
  /** Trimmed and lowercased — what will actually be sent to the server. */
  normalised: string;
  /** True when the typed handle is the one the account already holds. */
  unchanged: boolean;
  checking: boolean;
  result: { available: boolean; reason: string | null } | null;
  /** Set only when the server said the handle is taken or malformed. */
  hint: { text: string; tone: string } | null;
  /** True when Save must be refused outright. */
  blocked: boolean;
}

/**
 * Doc 11 — the debounced availability lookup behind every username input.
 *
 * The check is ADVISORY. Two players can be told "available" for the same handle
 * in the same instant; `users_username_key` decides and the loser gets a 409
 * from `PATCH /api/auth/me`. So a failed lookup must never block a save — the
 * server validates regardless, and refusing to submit on a network blip would
 * make the form unusable while changing nothing about correctness.
 *
 * Shared by `IdentityForm` (profile page) and `UsernamePrompt` (first sign-in)
 * so the two cannot drift apart on debounce timing or on what counts as blocked.
 *
 * @param raw     the input's current value, unnormalised
 * @param current the handle the account holds today, or null
 */
export function useUsernameCheck(raw: string, current: string | null): UsernameCheckState {
  const [result, setResult] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  const normalised = raw.trim().toLowerCase();
  const unchanged = normalised === (current ?? '');

  useEffect(() => {
    // Skipped when unchanged, otherwise simply opening the page fires a request
    // telling the player their own username is taken.
    if (!normalised || unchanged) {
      setResult(null);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    const timer = setTimeout(() => {
      void profileApi
        .checkUsername(normalised)
        .then((res) => {
          if (!cancelled) setResult({ available: res.available, reason: res.reason });
        })
        .catch(() => {
          if (!cancelled) setResult(null);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalised, unchanged]);

  const hint = (() => {
    if (!normalised || unchanged) return null;
    if (checking) return { text: 'Checking…', tone: 'text-faint' };
    if (!result) return null;
    return result.available
      ? { text: `${normalised} is available.`, tone: 'text-green' }
      : { text: result.reason ?? 'That username is not available.', tone: 'text-red' };
  })();

  return {
    normalised,
    unchanged,
    checking,
    result,
    hint,
    blocked: Boolean(normalised) && !unchanged && result?.available === false,
  };
}
