import { Router } from 'express';
import type { Namespace, Socket } from 'socket.io';
import { createLogger } from '../lib/logger.js';
import type { GameManifest, GameModule } from './types.js';

const log = createLogger('games');

/**
 * ===========================================================================
 * GAME REGISTRY — deliberately empty.
 * ===========================================================================
 *
 * No games are registered yet. The vault's 04-Games-Index.md has no entries,
 * and the games pass is scheduled separately from this foundation build.
 *
 * TO ADD A GAME:
 *   1. Create backend/src/games/<game-id>/ with an index.ts default-exporting
 *      a GameModule (manifest + optional router + optional registerSocket).
 *   2. Import it below and add it to the `modules` array.
 *   3. Add the matching UI under frontend/src/games/<game-id>/.
 *   4. Update Gambling_Docs/04-Games-Index.md and add Games/Game-<Name>.md.
 *
 * A game module MUST get every balance change through the escrow adapter
 * (`../escrow/index.js`). It must not import User, LedgerEntry, or treasury.
 * That restriction is what lets the treasury model be swapped for an on-chain
 * program later without touching a single game.
 * ===========================================================================
 */
const modules: GameModule[] = [
  // e.g. coinFlip, dice, mines — added in the games pass
];

const byId = new Map<string, GameModule>();

export function registerGame(mod: GameModule): void {
  const { id } = mod.manifest;
  if (byId.has(id)) throw new Error(`Duplicate game id: ${id}`);
  byId.set(id, mod);
  log.info(`registered game: ${id} (${mod.manifest.mode})`);
}

export function loadGames(): void {
  modules.forEach(registerGame);
  if (byId.size === 0) {
    log.info('no games registered yet — foundation-only build');
  }
}

export function getGame(id: string): GameModule | undefined {
  return byId.get(id);
}

export function listManifests(): GameManifest[] {
  return [...byId.values()].map((m) => m.manifest);
}

/** Mounts every game's REST routes under /api/games/<id>. */
export function buildGamesRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ games: listManifests() });
  });

  for (const mod of byId.values()) {
    if (mod.router) router.use(`/${mod.manifest.id}`, mod.router);
  }

  return router;
}

/** Lets every game attach its handlers to a freshly authenticated socket. */
export function registerGameSockets(namespace: Namespace, socket: Socket): void {
  for (const mod of byId.values()) {
    mod.registerSocket?.(namespace, socket);
  }
}

export async function initGames(): Promise<void> {
  for (const mod of byId.values()) await mod.init?.();
}

export async function shutdownGames(): Promise<void> {
  for (const mod of byId.values()) {
    try {
      await mod.shutdown?.();
    } catch (err) {
      log.error(`shutdown failed for game ${mod.manifest.id}`, err);
    }
  }
}
