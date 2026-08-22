import { useState } from 'react';
import { Button, Input, Spinner } from '../shared/ui';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../hooks/useAuth';
import { useUsernameCheck } from '../../hooks/useUsernameCheck';

/**
 * Doc 11 — asked once, right after a wallet first signs in.
 *
 * Without it a new account stays handle-less until the player goes looking for
 * the field on the profile page, and their public URL is a raw UUID
 * (`userHandle()` falls back to the id) until they do.
 *
 * Skippable on purpose. A handle is optional everywhere else in the system —
 * `username` is nullable — and blocking the dashboard behind it would make the
 * first thing a new player meets a form, not a game.
 *
 * The availability check here is the same advisory one the profile form uses.
 * The unique index is what actually decides, so a 409 from the save is a normal
 * outcome and is shown verbatim rather than being treated as a crash.
 */
export function UsernamePrompt() {
  const { user, setUser, needsUsername, dismissUsernamePrompt } = useAuth();

  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { normalised, hint, blocked } = useUsernameCheck(username, null);

  if (!user || !needsUsername) return null;

  const claim = async () => {
    if (!normalised) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authApi.updateProfile({ username: normalised });
      setUser({ ...user, username: res.user.username });
      // No dismiss() call: `needsUsername` keys off `user.username`, which is now
      // set, so the card closes on its own and stays closed on every device.
    } catch (err) {
      setError((err as Error).message || 'Could not save that username.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-[rgba(3,8,5,0.74)] backdrop-blur-[7px]"
        onClick={dismissUsernamePrompt}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-prompt-title"
        className="relative w-full max-w-[418px] rounded-[20px] border border-line bg-bg2 p-[26px] shadow-[0_26px_70px_rgba(0,0,0,0.5)]"
      >
        <h2 id="username-prompt-title" className="text-[19px] font-bold">
          Pick your username
        </h2>
        <p className="mt-1.5 text-[12.5px] text-muted">
          It is how other players find you, and it becomes your public profile link. You can change
          it later in Profile.
        </p>

        <div className="mt-5">
          <Input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !blocked && normalised) void claim();
            }}
            maxLength={20}
            spellCheck={false}
            autoCapitalize="none"
            placeholder="pick_a_handle"
            className="w-full"
          />
          <p className="mt-1.5 text-[11px] text-faint">
            3-20 characters: lowercase letters, numbers and underscores.
          </p>
          <p className="mt-1 text-[11.5px] text-muted">
            Your profile link: <span className="font-mono">/dashboard/u/{normalised || '…'}</span>
          </p>
          {hint && (
            <p className={`mt-1.5 text-[11.5px] font-semibold ${hint.tone}`} role="status">
              {hint.text}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-red">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={dismissUsernamePrompt}
            className="cursor-pointer rounded-lg border-none bg-transparent px-1 text-[12.5px] font-semibold text-faint hover:text-text"
          >
            Skip for now
          </button>
          <Button
            variant="solid"
            onClick={() => void claim()}
            disabled={saving || blocked || !normalised}
          >
            {saving ? <Spinner /> : 'Claim username'}
          </Button>
        </div>
      </div>
    </div>
  );
}
