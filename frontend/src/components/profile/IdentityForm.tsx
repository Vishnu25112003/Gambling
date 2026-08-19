import { useEffect, useState } from 'react';
import { Button, Card, Input, SectionHeading, Spinner } from '../shared/ui';
import { Icon } from '../shared/icons';
import { authApi, profileApi } from '../../api/endpoints';
import { useAuth } from '../../hooks/useAuth';

/**
 * Doc 11 — the two editable identity fields.
 *
 * `username` is the URL handle: lowercase, 3-20 of [a-z0-9_], globally unique.
 * `displayName` is the free-form label shown on the leaderboard.
 *
 * The availability check is ADVISORY. Two players can be told "available" for the
 * same handle in the same instant; the unique index decides and the loser gets a
 * 409, which is surfaced here like any other save error.
 */
export function IdentityForm({ onSaved }: { onSaved?: () => void }) {
  const { user, setUser } = useAuth();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [check, setCheck] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  // Seed the inputs once the session has restored.
  useEffect(() => {
    if (!user) return;
    setUsername(user.username ?? '');
    setDisplayName(user.displayName ?? '');
  }, [user?.username, user?.displayName]);

  const normalised = username.trim().toLowerCase();
  const unchangedName = normalised === (user?.username ?? '');

  /**
   * Debounced availability lookup.
   *
   * 400ms, and skipped entirely when the handle is unchanged — otherwise simply
   * opening the page fires a request telling the player their own username is
   * taken.
   */
  useEffect(() => {
    if (!normalised || unchangedName) {
      setCheck(null);
      return;
    }

    let cancelled = false;
    setChecking(true);

    const timer = setTimeout(() => {
      void profileApi
        .checkUsername(normalised)
        .then((res) => {
          if (!cancelled) setCheck({ available: res.available, reason: res.reason });
        })
        .catch(() => {
          // A failed check must not block a save — the server validates anyway.
          if (!cancelled) setCheck(null);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalised, unchangedName]);

  if (!user) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      /**
       * Only CHANGED fields are sent. An omitted key means "leave alone" — which
       * is why `updateProfile` takes an object: sending `displayName` on every
       * save would blank it whenever the box happened to be empty.
       */
      const patch: { username?: string | null; displayName?: string | null } = {};

      if (!unchangedName) patch.username = normalised === '' ? null : normalised;

      const trimmedDisplay = displayName.trim();
      if (trimmedDisplay !== (user.displayName ?? '')) {
        patch.displayName = trimmedDisplay === '' ? null : trimmedDisplay;
      }

      if (Object.keys(patch).length === 0) {
        setSaved(true);
        return;
      }

      const res = await authApi.updateProfile(patch);
      setUser({
        ...user,
        username: res.user.username,
        displayName: res.user.displayName,
      });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError((err as Error).message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const nameHint = (() => {
    if (!normalised || unchangedName) return null;
    if (checking) return { text: 'Checking…', tone: 'text-faint' };
    if (!check) return null;
    return check.available
      ? { text: `${normalised} is available.`, tone: 'text-green' }
      : { text: check.reason ?? 'That username is not available.', tone: 'text-red' };
  })();

  const blocked = Boolean(normalised) && !unchangedName && check?.available === false;

  return (
    <Card radius={18} className="p-[22px]">
      <SectionHeading
        icon={<Icon name="user" size={18} />}
        title="Your identity"
        subtitle="How other players see you across the hub."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
        <div>
          <label htmlFor="profile-username" className="text-[12.5px] font-semibold">
            Username
          </label>
          <p className="mt-1 mb-2 text-[11.5px] text-muted">
            Your profile link: <span className="font-mono">/dashboard/u/{normalised || '…'}</span>
          </p>
          <Input
            id="profile-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            spellCheck={false}
            autoCapitalize="none"
            placeholder="pick_a_handle"
            className="w-full"
          />
          <p className="mt-1.5 text-[11px] text-faint">
            3-20 characters: lowercase letters, numbers and underscores.
          </p>
          {nameHint && (
            <p className={`mt-1.5 text-[11.5px] font-semibold ${nameHint.tone}`} role="status">
              {nameHint.text}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="profile-displayname" className="text-[12.5px] font-semibold">
            Display name
          </label>
          <p className="mt-1 mb-2 text-[11.5px] text-muted">
            Optional. Replaces your shortened address on the leaderboard.
          </p>
          <Input
            id="profile-displayname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder="Pick a name"
            className="w-full"
          />
          <p className="mt-1.5 text-[11px] text-faint">2-32 characters. Clear it to go back to your address.</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="solid" onClick={() => void save()} disabled={saving || blocked}>
          {saving ? <Spinner /> : 'Save'}
        </Button>
        {saved && <span className="text-sm text-green">Saved.</span>}
        {error && (
          <span role="alert" className="text-sm text-red">
            {error}
          </span>
        )}
      </div>
    </Card>
  );
}
