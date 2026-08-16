import { Icon } from '../shared/icons';
import { gameVisual } from '../../lib/gameVisuals';
import type { GameManifest } from '../../types';

/**
 * A game card. The design fills the 4:3 panel with commissioned art
 * (`<image-slot>` in the mock); until that art exists the slot is filled with
 * the game's own tint and glyph from the design's palette, which is what those
 * slots were colour-matched to.
 */
export function GameTile({
  game,
  size = 'compact',
  onClick,
}: {
  game: GameManifest;
  /** `compact` is the overview grid, `large` the Games tab. */
  size?: 'compact' | 'large';
  onClick?: (game: GameManifest) => void;
}) {
  const visual = gameVisual(game);
  const large = size === 'large';
  const interactive = Boolean(onClick);

  const Wrapper = interactive ? 'button' : 'div';

  return (
    <Wrapper
      {...(interactive ? { onClick: () => onClick?.(game), type: 'button' as const } : {})}
      title={game.tagline}
      className={`block w-full overflow-hidden p-0 text-left transition ${
        large
          ? 'rounded-[18px] border border-line bg-card'
          : 'rounded-[15px] border border-line2 bg-bg2'
      } ${interactive ? 'cursor-pointer hover:border-green-solid/40' : ''}`}
    >
      <div
        className="relative flex w-full items-center justify-center"
        style={{
          aspectRatio: '4 / 3',
          background: `radial-gradient(ellipse 70% 60% at 50% 45%, ${visual.tint}, transparent 70%), ${visual.tint}`,
          color: visual.tone,
        }}
      >
        <Icon name={visual.icon} size={large ? 52 : 42} strokeWidth={1.4} />
      </div>
      <div
        className={`text-center font-bold ${
          large ? 'px-4 pt-3.5 pb-4 text-[15.5px]' : 'px-[13px] pt-[11px] pb-[13px] text-sm'
        }`}
      >
        {game.name}
      </div>
    </Wrapper>
  );
}
