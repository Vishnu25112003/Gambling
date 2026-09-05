import { Frown, Layers, Medal, Skull, Trophy } from 'lucide-react';
import { Button } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';
import { NARUTO, NARUTO_FONT } from './narutoTheme';

/**
 * Standalone result card for Trumpcard, mirroring LudoResult.tsx's shape.
 * No rematch/"Play Again" button — Rule 4's Rematch path is written for two
 * players only and this game's own doc explicitly leaves 3+ seats uncovered,
 * so it's omitted entirely rather than half-built.
 *
 * Reskinned to the Naruto ember/gold palette (see narutoTheme.ts) to match
 * the rest of this game — layout and data are unchanged from the original.
 */

interface RankingRow {
  playerId: string;
  rank: number;
  cardCount: number;
  eliminatedAt: 'cards' | 'lives' | null;
}

interface TrumpcardResultProps {
  won: boolean;
  stake: string;
  payout: string;
  rankings: RankingRow[];
  seatCount: number;
  myId: string;
  pot: string;
  feeCollected: string;
  playerNames?: Record<string, string>;
  onBackToLobby?: () => void;
}

const MEDAL_COLOR = [NARUTO.gold, '#cbd5c9', '#c2703a'];

export function TrumpcardResult({
  won,
  stake,
  payout,
  rankings,
  seatCount,
  myId,
  pot,
  feeCollected,
  playerNames = {},
  onBackToLobby,
}: TrumpcardResultProps) {
  return (
    <div
      className="mx-auto max-w-sm px-6 py-10 text-center"
      style={{
        fontFamily: NARUTO_FONT.body,
        background: NARUTO.panel,
        border: `1px solid ${NARUTO.panelBorder}`,
        borderRadius: 18,
      }}
    >
      {won ? (
        <Trophy className="mx-auto mb-3 size-12" style={{ color: NARUTO.gold }} />
      ) : (
        <Frown className="mx-auto mb-3 size-12" style={{ color: NARUTO.muted }} />
      )}
      <p className="mb-1 text-xl" style={{ fontFamily: NARUTO_FONT.display, color: NARUTO.cream }}>
        {won ? 'YOU WON!' : 'YOU LOST.'}
      </p>
      <p className="mb-6 text-sm" style={{ color: NARUTO.muted }}>
        {seatCount} players · {rankings.length} ranked
      </p>

      {/* Leaderboard */}
      <div
        className="mb-6 px-4 py-3"
        style={{ background: NARUTO.bg, border: `1px solid ${NARUTO.panelBorder}`, borderRadius: 12 }}
      >
        {rankings.map((r, i) => (
          <div
            key={r.playerId}
            className="flex items-center justify-between py-1.5"
            style={{
              borderBottom: i < rankings.length - 1 ? `1px solid ${NARUTO.panelBorder}` : undefined,
              color: r.playerId === myId ? NARUTO.win : NARUTO.cream,
            }}
          >
            <div className="flex items-center gap-2">
              {r.rank <= 3 ? (
                <Medal className="size-5" style={{ color: MEDAL_COLOR[r.rank - 1] }} />
              ) : (
                <span className="w-5 text-center text-xs font-bold" style={{ color: NARUTO.muted }}>
                  #{r.rank}
                </span>
              )}
              <span className="text-sm font-bold">
                {r.playerId === myId ? 'You' : (playerNames[r.playerId] ?? 'Player')}
              </span>
              {r.eliminatedAt === 'lives' && <Skull className="size-3.5" style={{ color: NARUTO.lose }} />}
              {r.eliminatedAt === 'cards' && <Layers className="size-3.5" style={{ color: NARUTO.faint }} />}
            </div>
            <span className="text-sm font-bold">{r.cardCount} cards</span>
          </div>
        ))}
      </div>

      {/* Payout breakdown */}
      <div
        className="mb-6 px-4 py-3"
        style={{ background: NARUTO.bg, border: `1px solid ${NARUTO.panelBorder}`, borderRadius: 12 }}
      >
        <div className="flex justify-between text-xs">
          <span style={{ color: NARUTO.muted }}>Stake</span>
          <span className="font-bold" style={{ color: NARUTO.cream }}>{formatSol(stake)} SOL</span>
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span style={{ color: NARUTO.muted }}>Pot</span>
          <span className="font-bold" style={{ color: NARUTO.cream }}>{formatSol(pot)} SOL</span>
        </div>
        {won && (
          <div className="mt-1 flex justify-between text-xs">
            <span style={{ color: NARUTO.win }}>Your payout</span>
            <span className="font-bold" style={{ color: NARUTO.win }}>{formatSol(payout)} SOL</span>
          </div>
        )}
        {Number(feeCollected) > 0 && (
          <div className="mt-1 flex justify-between text-xs" style={{ color: NARUTO.faint }}>
            <span>Platform fee (5%)</span>
            <span>{formatSol(feeCollected)} SOL</span>
          </div>
        )}
      </div>

      {onBackToLobby && (
        <Button
          className="w-full border-none font-bold"
          style={{ background: NARUTO.gold, color: NARUTO.ink, borderRadius: 99 }}
          onClick={onBackToLobby}
        >
          Back to Lobby
        </Button>
      )}
    </div>
  );
}
