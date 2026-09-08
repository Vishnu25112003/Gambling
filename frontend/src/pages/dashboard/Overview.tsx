import { Link, useNavigate } from 'react-router-dom';
import { SceneCanvas } from '../../components/shared/SceneCanvas';
import { GameCard } from '../../components/dashboard/GameCard';
import { LeaderboardTable } from '../../components/dashboard/LeaderboardTable';
import { Panel, PanelHeader, StatTile } from '../../components/dashboard/panels';
import { Icon } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useProfile } from '../../hooks/useProfile';
import { gameVisual } from '../../lib/gameVisuals';
import { gameLabel } from '../../lib/gameLabel';
import { TIER_BADGE_IMAGE } from '../../lib/tierBadges';
import { formatSol, formatSolSigned, shortAddress } from '../../lib/format';
import { MOCK_LIVE_MATCHES, MOCK_MISSIONS } from '../../lib/overviewMock';
import type { GameManifest } from '../../types';

/**
 * The Infinit Respawn mockup's dashboard index: a two-column hero (welcome +
 * rank progress, live-matches panel), four stat tiles, "THE ARENA" games
 * grid, then top players beside daily missions.
 *
 * Doc 06 keeps the games list and leaderboard ungated — both render whether
 * or not a wallet is connected. Live Matches and Daily Missions have no
 * backend concept yet (no cross-game open-table feed, no missions/reset-timer
 * system) and render static content from `lib/overviewMock.ts` until one
 * exists — everything else on this page is real data.
 */
export function Overview() {
  const { isAuthenticated, user, balance, signIn, isAuthenticating } = useAuth();
  const { games, loading: gamesLoading, isPlaceholder } = useGames();
  const { entries, loading: boardLoading } = useLeaderboard(5);
  const { data: profile } = useProfile(isAuthenticated ? 'me' : null);
  const navigate = useNavigate();

  const handlePlay = (game: GameManifest) => {
    if (!isAuthenticated) {
      void signIn();
      return;
    }
    navigate(`/dashboard/play/${game.id}`);
  };

  const netProfit = user?.netProfit ?? '0';
  const streak = profile?.stats.currentStreak;
  const streakLabel = !streak || streak.kind === 'none' ? '—' : `${streak.count}${streak.kind === 'win' ? 'W' : 'L'}`;

  const tier = profile?.tier;
  const badgeImage = tier && tier.key !== 'unranked' ? TIER_BADGE_IMAGE[tier.key as keyof typeof TIER_BADGE_IMAGE] : null;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* ── Hero: welcome + rank progress, beside Live Matches ────────── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <section
          className="relative col-span-2 min-w-0 overflow-hidden rounded-[18px] border p-[clamp(18px,2.6vw,34px)] max-[820px]:col-span-1"
          style={{
            borderColor: 'rgba(47,224,138,.2)',
            background:
              'radial-gradient(700px 300px at 88% 0%, rgba(47,224,138,.2), rgba(6,9,7,0) 65%), linear-gradient(120deg, #0c1a12, #070d09)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(47,224,138,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(47,224,138,.05) 1px, transparent 1px)',
              backgroundSize: '46px 46px',
            }}
          />

          <div className="relative grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-center gap-[22px]">
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-2 rounded-[6px] border px-[11px] py-[5px]"
                style={{ borderColor: 'rgba(47,224,138,.3)', background: 'rgba(47,224,138,.14)' }}
              >
                <span className="size-1.5 rounded-full bg-[#2fe08a]" style={{ animation: 'irPulse 1.6s infinite' }} />
                <span className="font-mono text-[10px] tracking-[0.2em] text-[#6ee7b7]">
                  SEASON 01 · LIVE
                </span>
              </span>

              <h1 className="mt-3.5 font-heading text-[clamp(30px,4.4vw,52px)] leading-[.98] font-bold tracking-[-0.01em] text-[#f2fff8]">
                {isAuthenticated && user ? (
                  <>
                    WELCOME BACK,
                    <br />
                    <span className="text-green" style={{ textShadow: '0 0 34px rgba(47,224,138,.5)' }}>
                      {(user.username || shortAddress(user.walletAddress)).toUpperCase()}
                    </span>
                  </>
                ) : (
                  <>
                    WELCOME TO
                    <br />
                    <span className="text-green" style={{ textShadow: '0 0 34px rgba(47,224,138,.5)' }}>
                      INFINIT RESPAWN
                    </span>
                  </>
                )}
              </h1>

              {isAuthenticated ? (
                <div className="mt-5 mb-1 flex flex-wrap items-end gap-[18px]">
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.18em] text-[#8fbfa6]">READY TO BET</div>
                    <div className="font-heading text-[34px] leading-[1.1] font-bold text-[#eafff3]">
                      {formatSol(balance?.availableBalance ?? '0')}{' '}
                      <span className="text-[15px] text-[#6ee7b7]">SOL</span>
                    </div>
                  </div>
                  <div className="h-10 w-px" style={{ background: 'rgba(47,224,138,.18)' }} />
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.18em] text-[#8fbfa6]">MATCHES</div>
                    <div className="font-heading text-[34px] leading-[1.1] font-bold text-[#eafff3]">
                      {user?.gamesPlayed ?? 0}
                    </div>
                  </div>
                  <div className="h-10 w-px" style={{ background: 'rgba(47,224,138,.18)' }} />
                  <div>
                    <div className="font-mono text-[10px] tracking-[0.18em] text-[#8fbfa6]">STREAK</div>
                    <div className="font-heading text-[34px] leading-[1.1] font-bold text-green">
                      {streakLabel}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 max-w-[420px] text-sm leading-[1.6] text-muted">
                  Connect a Solana wallet to see your balance. Browsing the hub needs no wallet at all.
                </p>
              )}

              {isAuthenticated && tier && (
                <div
                  className="mt-[18px] flex max-w-[460px] items-center gap-3.5 rounded-xl border p-[12px_14px]"
                  style={{ borderColor: 'rgba(240,180,41,.22)', background: 'linear-gradient(90deg, rgba(240,180,41,.08), rgba(6,9,7,0))' }}
                >
                  <span
                    className="size-[52px] shrink-0 bg-contain bg-center bg-no-repeat"
                    style={badgeImage ? { backgroundImage: `url(${badgeImage})` } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-[7px] flex justify-between gap-2.5 font-mono text-[10.5px] tracking-[0.12em] text-[#8fbfa6]">
                      <span className="text-[#f7d774]">
                        {tier.next ? `NEXT: ${tier.next.label.toUpperCase()}` : 'MAX RANK'}
                      </span>
                      <span className="text-[#6ee7b7]">
                        {tier.next
                          ? `${formatSol(tier.wagered)} / ${formatSol(tier.next.minWagered)} SOL`
                          : 'COMPLETE'}
                      </span>
                    </div>
                    <div
                      className="h-[9px] overflow-hidden rounded-md border"
                      style={{ background: '#0b1a12', borderColor: 'rgba(47,224,138,.16)' }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${tier.percentToNext}%`,
                          background: 'linear-gradient(90deg, #0f7d4d, #35eb95)',
                          boxShadow: '0 0 16px rgba(47,224,138,.6)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-[22px] flex flex-wrap gap-2.5">
                {isAuthenticated ? (
                  <button
                    onClick={() => navigate('/dashboard/escrow')}
                    className="flex cursor-pointer items-center gap-[9px] rounded-[10px] border-0 px-6 py-3 font-heading text-sm font-bold whitespace-nowrap text-[#04160c] transition hover:brightness-110"
                    style={{
                      background: 'linear-gradient(180deg, #35eb95, #16a862)',
                      boxShadow: '0 8px 26px rgba(47,224,138,.28)',
                    }}
                  >
                    <Icon name="bolt" size={19} />
                    DEPOSIT SOL
                  </button>
                ) : (
                  <button
                    onClick={() => void signIn()}
                    disabled={isAuthenticating}
                    className="flex cursor-pointer items-center gap-[9px] rounded-[10px] border-0 px-6 py-3 font-heading text-sm font-bold whitespace-nowrap text-[#04160c] transition hover:brightness-110 disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(180deg, #35eb95, #16a862)',
                      boxShadow: '0 8px 26px rgba(47,224,138,.28)',
                    }}
                  >
                    <Icon name="bolt" size={19} />
                    {isAuthenticating ? 'CHECK YOUR WALLET…' : 'CONNECT WALLET'}
                  </button>
                )}
                <button
                  onClick={() => navigate('/dashboard/games')}
                  className="flex cursor-pointer items-center gap-[9px] rounded-[10px] border px-6 py-3 font-heading text-sm font-bold whitespace-nowrap text-[#eafff3] transition hover:brightness-110"
                  style={{ borderColor: 'rgba(47,224,138,.3)', background: 'rgba(47,224,138,.06)' }}
                >
                  <Icon name="gamepad" size={19} className="text-green" />
                  ENTER LOBBY
                </button>
              </div>
            </div>

            <div
              className="relative grid aspect-[4/3] min-w-0 place-items-center overflow-hidden rounded-[14px] border"
              style={{
                borderColor: 'rgba(47,224,138,.22)',
                background:
                  'repeating-linear-gradient(135deg, rgba(47,224,138,.08) 0 10px, rgba(6,9,7,0) 10px 20px), #08110b',
              }}
            >
              <SceneCanvas
                scene="card"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
              />
            </div>
          </div>
        </section>

        <Panel>
          <PanelHeader title="LIVE MATCHES" dot="#ef5350" meta="24 IN PLAY" />
          <div className="flex flex-col gap-2">
            {MOCK_LIVE_MATCHES.map((m) => {
              const visual = gameVisual({ name: gameLabel(m.gameType) });
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-[11px] border p-[11px_12px] transition"
                  style={{ borderColor: 'rgba(47,224,138,.08)', background: 'var(--panel-bg3)' }}
                >
                  <span
                    className="grid size-[30px] shrink-0 place-items-center rounded-lg font-heading text-[12px] font-bold text-[#04160c]"
                    style={{ background: visual.tone }}
                  >
                    {m.initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[13.5px] font-semibold text-[#e8f2ec]">
                      {m.title}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-[#9ab5a6]">{m.meta}</div>
                  </div>
                  <span className="font-mono text-[12px] text-[#6ee7b7]">{m.stake}</span>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => navigate('/dashboard/games')}
            className="mt-3 w-full cursor-pointer rounded-[9px] border border-dashed py-2.5 font-heading text-[12.5px] font-semibold tracking-[0.08em] text-green"
            style={{ borderColor: 'rgba(47,224,138,.24)' }}
          >
            JOIN A TABLE →
          </button>
        </Panel>
      </div>

      {/* ── Stat tiles ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <StatTile icon="wallet" label="AVAILABLE BALANCE" value={`${formatSol(balance?.availableBalance ?? '0')} SOL`} color="var(--green)" />
        <StatTile icon="play" label="IN PLAY" value={`${formatSol(balance?.lockedBalance ?? '0')} SOL`} color="var(--gold)" />
        <StatTile icon="gamepad" label="GAMES PLAYED" value={String(user?.gamesPlayed ?? 0)} color="var(--text)" />
        <StatTile
          icon="chart"
          label="NET PROFIT"
          value={`${formatSolSigned(netProfit)} SOL`}
          color={Number(netProfit) < 0 ? 'var(--red)' : 'var(--green)'}
        />
      </div>

      {/* ── THE ARENA ───────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-[20px] font-bold tracking-[0.05em] text-text">THE ARENA</h2>
          <Link to="/dashboard/games" className="font-mono text-[11.5px] tracking-[0.1em] text-green">
            ALL GAMES →
          </Link>
        </div>
        {gamesLoading ? (
          <div className="flex justify-center py-12">
            <span className="inline-block size-6 animate-spin rounded-full border-2 border-line border-t-green" />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
            {games.map((g) => (
              <GameCard key={g.id} game={g} variant="arena" onClick={isPlaceholder ? undefined : handlePlay} />
            ))}
          </div>
        )}
      </section>

      {/* ── Top players + Daily missions ───────────────────────────── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <section className="min-w-0 rounded-2xl border p-[18px]" style={{ borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg)' }}>
          <div className="mb-4 flex items-center justify-between gap-2.5">
            <h2 className="font-heading text-[17px] font-bold tracking-[0.06em] text-text">TOP PLAYERS</h2>
            <Link to="/dashboard/leaderboard" className="font-mono text-[11px] tracking-[0.1em] text-green">
              FULL BOARD →
            </Link>
          </div>
          {boardLoading ? (
            <div className="flex justify-center py-10">
              <span className="inline-block size-6 animate-spin rounded-full border-2 border-line border-t-green" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">
              Nobody on the board yet — rankings appear once the first matches settle.
            </p>
          ) : (
            <LeaderboardTable entries={entries} />
          )}
        </section>

        <section
          className="min-w-0 rounded-2xl border p-[18px]"
          style={{
            borderColor: 'var(--amber-border)',
            background: 'linear-gradient(160deg, rgba(240,180,41,.08), rgba(6,9,7,0) 60%), var(--panel-bg)',
          }}
        >
          <h2 className="mb-1 font-heading text-[17px] font-bold tracking-[0.06em] text-text">DAILY MISSIONS</h2>
          <div className="mb-4 font-mono text-[10.5px] text-[#8fbfa6]">RESETS DAILY</div>
          <div className="flex flex-col gap-2.5">
            {MOCK_MISSIONS.map((q) => {
              const pct = Math.min(100, (q.progress / q.total) * 100);
              return (
                <div key={q.id} className="rounded-[11px] border p-3" style={{ borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg3)' }}>
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="font-heading text-[13.5px] font-semibold text-[#e8f2ec]">{q.title}</span>
                    <span className="font-mono text-[11px] text-gold">+{q.reward}</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: '#0a1a11' }}>
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #16a862, #35eb95)' }}
                      />
                    </div>
                    <span className="font-mono text-[10.5px] text-[#9ab5a6]">
                      {q.progress}/{q.total}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
