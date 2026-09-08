import { Icon } from '../shared/icons';
import { gameVisual } from '../../lib/gameVisuals';
import type { GameManifest } from '../../types';

/**
 * The mockup's game card, in its two contexts: "THE ARENA" on the dashboard
 * (16:11 art, no payout chip) and the full "Game Lobby" (4:3 art, +INSTANT
 * PAYOUT chip). When a game has commissioned art (`gameVisuals.ts`), that PNG
 * already renders the card's full look (tag, name, CTA) as pixels — laying
 * this component's tag/name/desc overlay on top of it would duplicate what's
 * already drawn, so art-backed games render as the plain clickable image
 * (unchanged from before). Only games without commissioned art (placeholder
 * games) get the mockup's live CSS-drawn card.
 */
export function GameCard({
  game,
  variant,
  onClick,
}: {
  game: GameManifest;
  variant: 'arena' | 'lobby';
  onClick?: (game: GameManifest) => void;
}) {
  const visual = gameVisual(game);
  const interactive = Boolean(onClick);
  const Wrapper = interactive ? 'button' : 'div';
  const lobby = variant === 'lobby';

  if (visual.art) {
    return (
      <Wrapper
        {...(interactive ? { onClick: () => onClick?.(game), type: 'button' as const } : {})}
        title={game.tagline}
        className={`block w-full overflow-hidden rounded-[18px] border p-0 text-left transition ${
          interactive ? 'cursor-pointer hover:brightness-105' : ''
        }`}
        style={{ borderColor: 'var(--panel-border)', background: 'var(--panel-bg)' }}
      >
        <img
          src={visual.art}
          alt={game.name}
          loading="lazy"
          className="block w-full object-cover"
          style={{ aspectRatio: lobby ? '4 / 3' : '16 / 11' }}
        />
      </Wrapper>
    );
  }

  const tag = game.mode === 'pooled' ? 'PVP' : 'SOLO';
  const players = `${game.minPlayers}–${game.maxPlayers}P`;

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-[18px] border transition hover:-translate-y-[3px]"
      style={{ borderColor: 'var(--panel-border)', background: 'var(--panel-bg)' }}
    >
      <div
        className="relative flex flex-col justify-between p-3.5"
        style={{ aspectRatio: lobby ? '4 / 3' : '16 / 11', background: visual.tint }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(135deg, rgba(255,255,255,.045) 0 8px, rgba(0,0,0,0) 8px 18px)',
          }}
        />
        <div className="relative flex items-start justify-between gap-2">
          <span
            className="rounded-[5px] border px-2 py-1 font-mono text-[9.5px] tracking-[0.18em] text-[#6ee7b7]"
            style={{ background: 'rgba(4,20,12,.6)', borderColor: 'rgba(47,224,138,.3)' }}
          >
            {tag}
          </span>
          <span className="rounded-[5px] px-2 py-1 font-mono text-[9.5px] text-[#9fb6a9]" style={{ background: 'rgba(4,20,12,.6)' }}>
            {players}
          </span>
        </div>
        <div className="relative">
          <div
            className="font-heading text-[clamp(22px,2.4vw,30px)] leading-[.95] font-bold tracking-[-0.01em] text-[#f2fff8]"
            style={{ textShadow: '0 4px 24px rgba(0,0,0,.6)' }}
          >
            {game.name}
          </div>
          <div className="mt-[7px] font-mono text-[10px] text-[rgba(234,255,243,.7)]">{game.tagline}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3.5">
        {lobby && (
          <div
            className="flex items-center gap-[7px] rounded-lg border px-2.5 py-2"
            style={{ background: '#0e1710', borderColor: 'rgba(47,224,138,.1)' }}
          >
            <Icon name="bolt" size={17} className="text-green" />
            <span className="font-mono text-[11px] tracking-[0.1em] text-[#6ee7b7]">INSTANT PAYOUT</span>
          </div>
        )}
        <button
          onClick={() => onClick?.(game)}
          disabled={!interactive}
          className="w-full cursor-pointer rounded-[9px] border-0 py-3 font-heading text-sm font-bold tracking-[0.08em] text-[#04160c] disabled:cursor-not-allowed disabled:opacity-70"
          style={{ background: 'linear-gradient(180deg, #35eb95, #16a862)' }}
        >
          PLAY NOW
        </button>
      </div>
    </article>
  );
}
