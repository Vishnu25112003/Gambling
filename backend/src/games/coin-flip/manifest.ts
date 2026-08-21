import type { GameManifest } from '../types.js';

export const coinFlipManifest: GameManifest = {
  id: 'coin-flip',
  name: 'Coin Flip',
  tagline: '1v1 coin-flip prediction — spin, call, win.',
  description:
    'Two players face off over a set number of rounds. Each round, one player spins a coin while the other calls Head or Tail. Get it right, you win the round. The player who wins more rounds wins the match.',
  mode: 'pooled',
  minPlayers: 2,
  maxPlayers: 2,
  status: 'live',
  icon: '🪙',
};
