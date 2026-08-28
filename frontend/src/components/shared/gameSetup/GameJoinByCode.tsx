import { useState } from 'react';
import { Button, Card, PageTitle } from '../ui';

/** Unified "join by room code" screen — standardized 8-char / "ABCD" placeholder for every game. */
export function GameJoinByCode({
  onJoin,
  onBack,
}: {
  onJoin: (code: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');

  return (
    <>
      <PageTitle title="Join with Code" subtitle="Enter a room code from your friend." />
      <Card className="mx-auto max-w-sm px-6 py-8">
        <label className="mb-1 block text-xs font-semibold text-muted">Room Code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mb-4 w-full rounded-[9px] border border-line bg-bg2 px-3.5 py-[11px] text-center text-lg font-bold tracking-widest text-text placeholder:text-faint focus:border-green focus:outline-none"
          placeholder="ABCD"
          maxLength={8}
          autoFocus
        />
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => onJoin(code.trim().toUpperCase())}
          disabled={!code.trim()}
        >
          Join Match
        </Button>
        <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={onBack}>
          Back to Lobby
        </Button>
      </Card>
    </>
  );
}
