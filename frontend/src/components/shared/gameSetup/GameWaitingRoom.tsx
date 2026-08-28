import type { ReactNode } from 'react';
import { Button, Card, PageTitle, Spinner } from '../ui';

/**
 * Unified "waiting for opponent" screen — covers both Friends Play (room
 * code to share) and Random Play (plain spinner, optionally still showing a
 * room code if a random match fell back to one). `onCancel` is required so
 * every game always gets a way out of this screen.
 */
export function GameWaitingRoom({
  mode,
  roomCode,
  summary,
  waitingText,
  onCancel,
}: {
  mode: 'random' | 'friends';
  roomCode?: string | null;
  summary: ReactNode;
  waitingText?: string;
  onCancel: () => void;
}) {
  if (mode === 'friends') {
    return (
      <>
        <PageTitle title="Friends Play" subtitle="Share this code with your friend." />
        <Card className="mx-auto max-w-md px-6 py-10 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Room Code</p>
          <p className="mb-1 text-4xl font-extrabold tracking-[0.35em] text-green">{roomCode}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => { if (roomCode) void navigator.clipboard?.writeText(roomCode); }}
          >
            Copy Code
          </Button>

          <div className="mt-8 flex flex-col items-center">
            <Spinner className="mb-3 size-5" />
            <p className="text-sm text-muted">{waitingText ?? 'Waiting for your friend to join…'}</p>
          </div>

          <p className="mt-4 text-xs text-faint">{summary}</p>
          <Button variant="ghost" size="sm" className="mt-6" onClick={onCancel}>Cancel</Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Waiting" />
      <Card className="mx-auto max-w-md px-6 py-12 text-center">
        <Spinner className="mb-4 size-6" />
        <p className="text-sm text-muted">
          {waitingText ?? (roomCode ? 'Waiting for friend to confirm…' : 'Waiting for an opponent to join…')}
        </p>
        {roomCode && (
          <div className="mt-4 rounded-[10px] border border-line bg-bg2 px-4 py-3">
            <p className="mb-1 text-xs text-muted">Share this code:</p>
            <p className="text-2xl font-extrabold tracking-widest">{roomCode}</p>
          </div>
        )}
        <p className="mt-3 text-xs text-faint">{summary}</p>
        <Button variant="ghost" size="sm" className="mt-6" onClick={onCancel}>Cancel</Button>
      </Card>
    </>
  );
}
