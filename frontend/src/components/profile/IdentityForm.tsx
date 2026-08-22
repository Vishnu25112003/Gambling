import { useEffect, useState } from 'react';
import { Button, Card, Input, SectionHeading, Spinner } from '../shared/ui';
import { Icon } from '../shared/icons';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../hooks/useAuth';
import { useUsernameCheck } from '../../hooks/useUsernameCheck';

/**
 * Doc 11 — the one editable identity field: `username`.
 *
 * Lowercase, 3-20 of [a-z0-9_], globally unique. It is both the player's name
 * shown across the hub and their URL handle at `/dashboard/u/:username`.
 *
 * The availability check is ADVISORY. Two players can be told "available" for the
 * same handle in the same instant; the unique index decides and the loser gets a
 * 409, which is surfaced here like any other save error.
 */
export function IdentityForm({ onSaved }: { onSaved?: () => void }) {
  const { user, setUser } = useAuth();

  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the input once the session has restored.
  useEffect(() => {
    if (!user) return;
    setUsername(user.username ?? '');
  }, [user?.username]);

  const {
    normalised,
    unchanged: unchangedName,
    hint: nameHint,
    blocked,
  } = useUsernameCheck(username, user?.username ?? null);

  if (!user) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      if (unchangedName) {
        setSaved(true);
        return;
      }

      const res = await authApi.updateProfile({
        username: normalised === '' ? null : normalised,
      });
      setUser({ ...user, username: res.user.username });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError((err as Error).message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card radius={18} className="p-[22px]">
      <SectionHeading
        icon={<Icon name="user" size={18} />}
        title="Your identity"
        subtitle="How other players see you across the hub."
      />

      <div>
        <label htmlFor="profile-username" className="text-[12.5px] font-semibold">
          Name
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
          placeholder="pick_a_name"
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
