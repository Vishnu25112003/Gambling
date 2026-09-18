import { Button, Card, PageTitle, Spinner } from '../ui';

export interface LobbyMatch {
  matchId: string;
  hostName: string;
  /** Pre-formatted per-game summary, e.g. "6 balls/innings · Fixed bet · 0.1 SOL" — each game knows its own fields. */
  meta: string;
}

/**
 * The one lobby screen every game opens on: Create Match, Join by Room Code,
 * then Random Play's open-match list. This used to be two different layouts
 * — a narrow centered column (Hand Cricket, Mine Catcher) and a full-width
 * header-plus-list layout (Coin Flip, Ludo, Trumpcard) — which is also the
 * only place a player would notice the five games don't share one design.
 * Every other step in the pre-match flow (`GameJoinByCode`, `GameWaitingRoom`,
 * `GameSetupWizard`) already uses this narrow centered-card shape, so it was
 * the layout to standardize on, not invent a third one.
 */
export function GameLobby({
  title,
  subtitle,
  connected = true,
  error,
  matches,
  onCreate,
  onJoinByCode,
  onJoinMatch,
  onRefresh,
}: {
  title: string;
  subtitle: string;
  /** Omit for games that don't track a distinct "connecting" state — the list just starts empty. */
  connected?: boolean;
  error?: string | null;
  matches: LobbyMatch[];
  onCreate: () => void;
  onJoinByCode: () => void;
  onJoinMatch: (matchId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <PageTitle title={title} subtitle={subtitle} />
      {error && (
        <div className="mx-auto mb-4 max-w-sm rounded-[10px] border border-red/30 bg-red/10 px-4 py-2 text-center text-xs text-red">
          {error}
        </div>
      )}

      <div className="mx-auto max-w-sm space-y-4">
        <Button variant="primary" size="lg" className="w-full" onClick={onCreate}>
          Create Match
        </Button>

        <Button variant="ghost" size="sm" className="w-full" onClick={onJoinByCode}>
          Join by Room Code
        </Button>

        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-muted">Random Play</p>
          <button type="button" onClick={onRefresh} className="cursor-pointer text-xs text-green hover:underline">
            Refresh
          </button>
        </div>

        {!connected ? (
          <Card className="px-4 py-8 text-center">
            <Spinner className="mx-auto mb-3 size-5" />
            <p className="text-sm text-muted">Connecting…</p>
          </Card>
        ) : matches.length === 0 ? (
          <Card className="px-4 py-8 text-center">
            <p className="text-sm text-muted">No open matches. Create one!</p>
          </Card>
        ) : (
          matches.map((m) => (
            <Card key={m.matchId} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-bold">{m.hostName}</p>
                <p className="text-xs text-muted">{m.meta}</p>
              </div>
              <Button variant="primary" size="sm" onClick={() => onJoinMatch(m.matchId)}>
                Join
              </Button>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
