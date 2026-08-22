import { useEffect, useId, useRef, useState } from 'react';
import { Avatar } from '../shared/Avatar';
import { Spinner } from '../shared/ui';
import { authApi } from '../../api/endpoints';
import { useAuth } from '../../hooks/useAuth';

/** Mirrors the server's cap, so an obviously-too-big file never leaves the browser. */
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * Doc 11 — click the avatar to replace it.
 *
 * The client-side size and type checks are a courtesy, not a security boundary:
 * `avatarStore.ts` sniffs the real magic bytes and enforces the same cap. Checking
 * here just means the common mistakes fail instantly instead of after a 2 MB
 * upload.
 */
export function AvatarUploader({
  size = 96,
  onChanged,
}: {
  size?: number;
  /** Fired after a successful upload or removal, so the page can refetch. */
  onChanged?: () => void;
}) {
  const { user, setUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * An object URL is a document-lifetime reference to a blob. Without revoking it
   * every re-pick leaks the previous image for as long as the tab is open.
   */
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  if (!user) return null;

  const pick = async (file: File) => {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError('That image is larger than 2 MB.');
      return;
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Use a PNG, JPEG or WebP image.');
      return;
    }

    // Shown immediately, so the avatar reacts to the click rather than to the
    // round trip.
    setPreview(URL.createObjectURL(file));
    setBusy(true);

    try {
      const res = await authApi.uploadAvatar(file);
      // The URL is used VERBATIM: it carries the server's ?v= counter, which is
      // the only thing that makes a replaced image bypass the browser cache.
      setUser({ ...user, avatarUrl: res.user.avatarUrl });
      onChanged?.();
    } catch (err) {
      setError((err as Error).message || 'Upload failed.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await authApi.removeAvatar();
      setPreview(null);
      setUser({ ...user, avatarUrl: null });
      onChanged?.();
    } catch (err) {
      setError((err as Error).message || 'Could not remove the image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar
          src={preview ?? user.avatarUrl}
          address={user.walletAddress}
          name={user.username ?? 'You'}
          size={size}
          radiusRatio={0.28}
        />

        {/*
          A real <input type="file"> in a <label>, not a hidden input driven by a
          div's onClick: this way the control is focusable, announced, and
          operable with the keyboard for free.
        */}
        <label
          htmlFor={inputId}
          title="Change profile picture"
          className="absolute -right-1 -bottom-1 flex size-8 cursor-pointer items-center justify-center
            rounded-full border border-line bg-bg2 text-muted transition
            hover:text-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green"
        >
          {busy ? <Spinner className="size-3.5" /> : <CameraIcon />}
          <span className="sr-only">Change profile picture</span>
        </label>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so re-picking the SAME file still fires a change event.
            e.target.value = '';
            if (file) void pick(file);
          }}
          className="sr-only"
        />
      </div>

      {user.avatarUrl && !busy && (
        <button
          onClick={() => void remove()}
          className="cursor-pointer border-none bg-transparent text-[11.5px] font-semibold text-faint transition hover:text-red"
        >
          Remove
        </button>
      )}

      {error && (
        <p role="alert" className="max-w-[180px] text-center text-[11.5px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.2-2h7.6L17 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
