import { Router } from 'express';
import { authRouter } from '../auth/auth.routes.js';
import { walletRouter } from '../wallet/wallet.routes.js';
import { leaderboardRouter } from '../leaderboard/leaderboard.routes.js';
import { buildGamesRouter } from '../games/registry.js';
import { isTreasuryConfigured } from '../wallet/treasury.js';
import { env } from '../config/env.js';

export function buildApiRouter(): Router {
  const api = Router();

  api.get('/health', (_req, res) => {
    res.json({
      ok: true,
      cluster: env.SOLANA_CLUSTER,
      treasuryConfigured: isTreasuryConfigured(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  api.use('/auth', authRouter);
  api.use('/wallet', walletRouter);
  api.use('/leaderboard', leaderboardRouter);
  api.use('/games', buildGamesRouter());

  return api;
}
