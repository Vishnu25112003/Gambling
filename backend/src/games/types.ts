import type { Router } from 'express';
import type { Namespace, Socket } from 'socket.io';
import type { MatchMode } from '../generated/prisma/enums.js';

/**
 * The contract every game module implements.
 *
 * Overview doc, principle #1: "Every game is a separate, self-contained
 * module. No shared game logic between games." A game owns its rules, its UI
 * and its odds — and nothing else. It gets its money behaviour by calling the
 * escrow adapter, never by writing balances itself.
 */
export interface GameManifest {
  /** URL-safe stable identifier, e.g. 'coin-flip'. Written to every ledger row. */
  id: string;
  name: string;
  /** One-liner for the game card on the landing page and dashboard. */
  tagline: string;
  description: string;
  /**
   * Decides how settleMatch treats the fee (doc 03):
   *   'pooled'        -> 5% comes off the pot at settlement
   *   'solo_vs_house' -> the 5% edge is baked into this game's odds table
   */
  mode: MatchMode;
  minPlayers: number;
  maxPlayers: number;
  /** 'live' games are playable; anything else renders as a Coming Soon card. */
  status: 'live' | 'beta' | 'coming-soon';
  /** Emoji or icon key for the card. */
  icon?: string;
}

export interface GameModule {
  manifest: GameManifest;
  /** Optional REST surface, mounted at /api/games/<id>. */
  router?: Router;
  /** Optional realtime surface. Sockets are already authenticated. */
  registerSocket?: (namespace: Namespace, socket: Socket) => void;
  /** Called once at boot, after the database is connected. */
  init?: () => Promise<void> | void;
  /** Called on shutdown so a game can settle or refund cleanly. */
  shutdown?: () => Promise<void> | void;
}
