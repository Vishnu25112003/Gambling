import { Frown, Layers, Medal, Skull, Trophy } from 'lucide-react';
import { Card, Button } from '../../components/shared/ui';
import { formatSol } from '../../lib/format';

/**
 * Standalone result card for Trumpcard, mirroring LudoResult.tsx's shape.
 * No rematch/"Play Again" button — Rule 4's Rematch path is written for two
 * players only and this game's own doc explicitly leaves 3+ seats uncovered,
 * so it's omitted entirely rather than half-built.
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

const MEDAL_COLOR = ['text-[var(--tier-gold)]', 'text-[var(--tier-silver)]', 'text-[var(--tier-bronze)]'];

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
    <Card className="mx-auto max-w-sm px-6 py-10 text-center">
      {won ? (
        <Trophy className="mx-auto mb-3 size-12 text-gold" />
      ) : (
        <Frown className="mx-auto mb-3 size-12 text-muted" />
      )}
      <p className="mb-1 text-xl font-extrabold">{won ? 'You won!' : 'You lost.'}</p>
      <p className="mb-6 text-sm text-muted">
        {seatCount} players · {rankings.length} ranked
      </p>

      {/* Leaderboard */}
      <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
        {rankings.map((r, i) => (
          <div
            key={r.playerId}
            className={`flex items-center justify-between py-1.5 ${
              i < rankings.length - 1 ? 'border-b border-line' : ''
            } ${r.playerId === myId ? 'text-green' : ''}`}
          >
            <div className="flex items-center gap-2">
              {r.rank <= 3 ? (
                <Medal className={`size-5 ${MEDAL_COLOR[r.rank - 1]}`} />
              ) : (
                <span className="w-5 text-center text-xs font-bold text-muted">#{r.rank}</span>
              )}
              <span className="text-sm font-bold">
                {r.playerId === myId ? 'You' : (playerNames[r.playerId] ?? 'Player')}
              </span>
              {r.eliminatedAt === 'lives' && <Skull className="size-3.5 text-red" />}
              {r.eliminatedAt === 'cards' && <Layers className="size-3.5 text-faint" />}
            </div>
            <span className="text-sm font-bold">{r.cardCount} cards</span>
          </div>
        ))}
      </div>

      {/* Payout breakdown */}
      <div className="mb-6 rounded-[12px] border border-line bg-bg2 px-4 py-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Stake</span>
          <span className="font-bold">{formatSol(stake)} SOL</span>
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-muted">Pot</span>
          <span className="font-bold">{formatSol(pot)} SOL</span>
        </div>
        {won && (
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-green">Your payout</span>
            <span className="font-bold text-green">{formatSol(payout)} SOL</span>
          </div>
        )}
        {Number(feeCollected) > 0 && (
          <div className="mt-1 flex justify-between text-xs text-faint">
            <span>Platform fee (5%)</span>
            <span>{formatSol(feeCollected)} SOL</span>
          </div>
        )}
      </div>

      {onBackToLobby && (
        <Button variant="primary" className="w-full" onClick={onBackToLobby}>
          Back to Lobby
        </Button>
      )}
    </Card>
  );
}
