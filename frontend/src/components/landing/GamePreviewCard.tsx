import { Badge, Card } from '../shared/ui';
import type { GameManifest } from '../../types';

/**
 * Doc 06: game cards, "including placeholder 'Coming Soon' cards for games not
 * yet built". Since no games are registered yet, the dashboard and landing page
 * both render these placeholders from a static list.
 */
export function GamePreviewCard({
  game,
  onPlay,
}: {
  game: GameManifest;
  onPlay?: (game: GameManifest) => void;
}) {
  const isLive = game.status === 'live';

  return (
    <Card
      className={`group flex flex-col gap-3 p-5 transition ${
        isLive ? 'hover:border-neon-500/50' : 'opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-3xl" aria-hidden>
          {game.icon ?? '🎰'}
        </div>
        {isLive ? (
          <Badge tone="success">Live</Badge>
        ) : game.status === 'beta' ? (
          <Badge tone="warn">Beta</Badge>
        ) : (
          <Badge>Coming Soon</Badge>
        )}
      </div>

      <div className="flex-1">
        <h3 className="font-semibold text-ink-100">{game.name}</h3>
        <p className="mt-1 text-sm text-ink-400">{game.tagline}</p>
      </div>

      <div className="flex items-center justify-between border-t border-ink-800 pt-3 text-xs text-ink-400">
        <span>{game.mode === 'pooled' ? 'Player vs Player' : 'Player vs House'}</span>
        {isLive && onPlay ? (
          <button
            onClick={() => onPlay(game)}
            className="font-semibold text-neon-400 hover:text-neon-500"
          >
            Play →
          </button>
        ) : (
          <span>Not yet available</span>
        )}
      </div>
    </Card>
  );
}
