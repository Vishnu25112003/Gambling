/**
 * Trumpcard engine — pure game rules with no I/O.
 *
 * All functions are deterministic given their inputs (or, where randomness is
 * intentional — shuffling, first-leader pick — isolated to one call site) and
 * easy to unit-test. This file never touches the database, sockets, or timers.
 *
 * References:
 *   - Gambling_Docs/Games/G04-Trumpcard.md (game spec)
 *   - Gambling_Docs/10-Game-Common-Rules.md (Rules 1-4, with the Ludo/Trumpcard
 *     Rule 2 exception)
 */

import type {
  EliminationCause,
  Rank,
  StatKey,
  Suit,
  TrumpCard,
  TrumpcardState,
} from './types.js';

// --- Constants ----------------------------------------------------------------

/** Max cards per player by seat count — Gambling_Docs/Games/G04-Trumpcard.md Reference. */
export const CARD_LIMITS: Record<2 | 3 | 4, number> = { 2: 26, 3: 17, 4: 13 };

export const STAT_CHOICE_TIMEOUT_MS = 10_000;
export const LIVES_START = 3;
/** Server-side pacing so every client's reveal animation gets a consistent window. */
export const ROUND_REVEAL_DELAY_MS = 4_000;

/**
 * Paid places and percentage splits by seated player count — the Ludo/Trumpcard
 * exception to Rule 2's fixed top-2 split, ported verbatim from
 * `../ludo/engine.ts`. After Rule 1's 5% fee is deducted from the pot.
 */
export const PAYOUT_TABLE: Record<number, { paidPlaces: number; splits: number[] }> = {
  2: { paidPlaces: 1, splits: [100] },
  3: { paidPlaces: 2, splits: [70, 30] },
  4: { paidPlaces: 3, splits: [50, 30, 20] },
};

// --- Canonical deck -------------------------------------------------------

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/**
 * Curated per-card stats for the Naruto reskin, one entry per canonical deck
 * slot in the exact SUITS-outer/RANKS-inner order buildCanonicalDeck() below
 * iterates — the same order frontend/src/games/trumpcard/narutoData.ts's
 * ROSTER assigns character identities in, so index i here is always the same
 * character as ROSTER[i] there (index 0 = Naruto Uzumaki, 1 = Sasuke Uchiha,
 * ... 51 = Shizune). Values are a canon-informed read of each character's
 * power/speed/chakra("defense")/jutsu("stamina")/intellect/popularity("luck")
 * on a 10-99 scale — replacing the old suit/rank hash, whose numbers had no
 * relationship to the character actually printed on the card.
 */
const CARD_STATS: Record<StatKey, number>[] = [
  // Leaf — spades 2-14
  { power: 95, speed: 90, defense: 99, intellect: 70, stamina: 92, luck: 99 }, // Naruto Uzumaki
  { power: 96, speed: 93, defense: 94, intellect: 88, stamina: 90, luck: 96 }, // Sasuke Uchiha
  { power: 78, speed: 82, defense: 75, intellect: 92, stamina: 85, luck: 90 }, // Kakashi Hatake
  { power: 70, speed: 65, defense: 80, intellect: 78, stamina: 72, luck: 75 }, // Sakura Haruno
  { power: 85, speed: 88, defense: 40, intellect: 55, stamina: 55, luck: 70 }, // Rock Lee
  { power: 80, speed: 78, defense: 82, intellect: 85, stamina: 70, luck: 68 }, // Neji Hyuga
  { power: 60, speed: 62, defense: 70, intellect: 60, stamina: 58, luck: 78 }, // Hinata Hyuga
  { power: 45, speed: 50, defense: 55, intellect: 99, stamina: 60, luck: 72 }, // Shikamaru Nara
  { power: 40, speed: 48, defense: 50, intellect: 75, stamina: 55, luck: 58 }, // Ino Yamanaka
  { power: 82, speed: 40, defense: 65, intellect: 45, stamina: 60, luck: 55 }, // Choji Akimichi
  { power: 65, speed: 75, defense: 55, intellect: 42, stamina: 58, luck: 55 }, // Kiba Inuzuka
  { power: 50, speed: 48, defense: 68, intellect: 78, stamina: 65, luck: 40 }, // Shino Aburame
  { power: 55, speed: 60, defense: 40, intellect: 58, stamina: 62, luck: 38 }, // Tenten
  // Leaf legends — hearts 2-14
  { power: 97, speed: 80, defense: 99, intellect: 88, stamina: 96, luck: 92 }, // Hashirama Senju
  { power: 88, speed: 99, defense: 90, intellect: 90, stamina: 85, luck: 90 }, // Minato Namikaze
  { power: 93, speed: 68, defense: 95, intellect: 80, stamina: 78, luck: 85 }, // Tsunade
  { power: 87, speed: 75, defense: 88, intellect: 82, stamina: 90, luck: 88 }, // Jiraiya
  { power: 82, speed: 60, defense: 85, intellect: 90, stamina: 92, luck: 80 }, // Hiruzen Sarutobi
  { power: 88, speed: 85, defense: 90, intellect: 85, stamina: 88, luck: 70 }, // Tobirama Senju
  { power: 96, speed: 97, defense: 60, intellect: 60, stamina: 65, luck: 82 }, // Might Guy
  { power: 78, speed: 70, defense: 92, intellect: 65, stamina: 68, luck: 75 }, // Kushina Uzumaki
  { power: 65, speed: 60, defense: 80, intellect: 70, stamina: 70, luck: 45 }, // Yamato
  { power: 55, speed: 62, defense: 60, intellect: 75, stamina: 68, luck: 50 }, // Sai
  { power: 70, speed: 65, defense: 65, intellect: 72, stamina: 62, luck: 55 }, // Asuma Sarutobi
  { power: 45, speed: 55, defense: 62, intellect: 80, stamina: 55, luck: 48 }, // Kurenai Yuhi
  { power: 30, speed: 35, defense: 40, intellect: 62, stamina: 35, luck: 55 }, // Iruka Umino
  // Akatsuki & rivals — diamonds 2-14
  { power: 99, speed: 92, defense: 98, intellect: 92, stamina: 95, luck: 94 }, // Madara Uchiha
  { power: 97, speed: 88, defense: 97, intellect: 85, stamina: 90, luck: 85 }, // Obito Uchiha
  { power: 85, speed: 84, defense: 88, intellect: 96, stamina: 82, luck: 92 }, // Itachi Uchiha
  { power: 94, speed: 55, defense: 96, intellect: 82, stamina: 88, luck: 80 }, // Nagato
  { power: 82, speed: 72, defense: 90, intellect: 95, stamina: 92, luck: 76 }, // Orochimaru
  { power: 85, speed: 68, defense: 88, intellect: 62, stamina: 75, luck: 55 }, // Kisame Hoshigaki
  { power: 68, speed: 60, defense: 82, intellect: 90, stamina: 80, luck: 50 }, // Sasori
  { power: 75, speed: 70, defense: 72, intellect: 74, stamina: 78, luck: 58 }, // Deidara
  { power: 82, speed: 65, defense: 90, intellect: 70, stamina: 72, luck: 42 }, // Kakuzu
  { power: 78, speed: 62, defense: 95, intellect: 40, stamina: 55, luck: 45 }, // Hidan
  { power: 75, speed: 78, defense: 85, intellect: 85, stamina: 80, luck: 65 }, // Konan
  { power: 55, speed: 60, defense: 70, intellect: 72, stamina: 62, luck: 30 }, // Zetsu
  { power: 68, speed: 65, defense: 78, intellect: 92, stamina: 88, luck: 48 }, // Kabuto Yakushi
  // Kage & allied villages — clubs 2-14
  { power: 88, speed: 62, defense: 92, intellect: 80, stamina: 78, luck: 88 }, // Gaara
  { power: 90, speed: 78, defense: 90, intellect: 60, stamina: 82, luck: 72 }, // Killer Bee
  { power: 92, speed: 90, defense: 80, intellect: 65, stamina: 68, luck: 68 }, // A · Fourth Raikage
  { power: 75, speed: 55, defense: 85, intellect: 82, stamina: 78, luck: 55 }, // Onoki
  { power: 80, speed: 62, defense: 82, intellect: 72, stamina: 75, luck: 70 }, // Mei Terumi
  { power: 62, speed: 68, defense: 58, intellect: 68, stamina: 60, luck: 58 }, // Temari
  { power: 58, speed: 55, defense: 62, intellect: 65, stamina: 68, luck: 45 }, // Kankuro
  { power: 78, speed: 70, defense: 68, intellect: 55, stamina: 62, luck: 60 }, // Zabuza Momochi
  { power: 65, speed: 82, defense: 72, intellect: 62, stamina: 65, luck: 68 }, // Haku
  { power: 78, speed: 60, defense: 82, intellect: 88, stamina: 75, luck: 42 }, // Danzo Shimura
  { power: 62, speed: 68, defense: 60, intellect: 65, stamina: 62, luck: 55 }, // Anko Mitarashi
  { power: 45, speed: 40, defense: 55, intellect: 85, stamina: 45, luck: 40 }, // Ibiki Morino
  { power: 50, speed: 55, defense: 62, intellect: 70, stamina: 58, luck: 45 }, // Shizune
];

function buildCanonicalDeck(): TrumpCard[] {
  const deck: TrumpCard[] = [];
  let cursor = 0;
  SUITS.forEach((suit) => {
    for (const rank of RANKS) {
      const stats = CARD_STATS[cursor]!;
      deck.push({ id: `${suit}-${rank}`, suit, rank, stats });
      cursor++;
    }
  });
  return deck;
}

/** The one fixed 52-card deck every match deals from. */
export const CANONICAL_DECK: TrumpCard[] = buildCanonicalDeck();

const DECK_BY_ID = new Map(CANONICAL_DECK.map((c) => [c.id, c]));

export function getCardById(cardId: string): TrumpCard {
  const card = DECK_BY_ID.get(cardId);
  if (!card) throw new Error(`Unknown card id: ${cardId}`);
  return card;
}

// --- Shuffle & deal -------------------------------------------------------

/** Fisher-Yates. Shuffling itself is not provably-fair — see the game doc's Open Questions. */
export function shuffleDeck(deck: TrumpCard[]): TrumpCard[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Shuffle the canonical deck and block-deal `cardsPerPlayer` cards to each
 * seat in order. Anything beyond `seatCount*cardsPerPlayer` (the 3-player
 * 51-of-52 case) is unused and dropped from the match entirely.
 */
export function dealHands(
  seatCount: number,
  cardsPerPlayer: number,
  playerIds: string[],
): { hands: Record<string, string[]>; unused: string[] } {
  const shuffled = shuffleDeck(CANONICAL_DECK);
  const hands: Record<string, string[]> = {};
  let cursor = 0;
  for (let i = 0; i < seatCount; i++) {
    const id = playerIds[i]!;
    hands[id] = shuffled.slice(cursor, cursor + cardsPerPlayer).map((c) => c.id);
    cursor += cardsPerPlayer;
  }
  const unused = shuffled.slice(cursor).map((c) => c.id);
  return { hands, unused };
}

// --- Match state ------------------------------------------------------------

export function createInitialState(
  seatCount: number,
  cardsPerPlayer: number,
  playerIds: string[],
  durationMs: number,
): TrumpcardState {
  const { hands } = dealHands(seatCount, cardsPerPlayer, playerIds);
  const lives: Record<string, number> = {};
  for (const id of playerIds) lives[id] = LIVES_START;

  return {
    seatCount,
    cardsPerPlayer,
    playerIds: [...playerIds],
    activePlayerIds: [...playerIds],
    hands,
    lives,
    pool: [],
    currentLeaderId: playerIds[Math.floor(Math.random() * playerIds.length)]!,
    leaderChoiceStartedAt: Date.now(),
    phase: 'leader_choosing',
    roundNumber: 1,
    disconnectedPlayers: [],
    eliminations: [],
    matchDeadline: Date.now() + durationMs,
  };
}

/**
 * Cyclic successor of `fromId` within `activePlayerIds`, walked via the fixed
 * original seat order so it still works when `fromId` itself was just
 * eliminated (a tie or a stat-choice skip can eliminate the current leader).
 */
export function getNextLeader(state: TrumpcardState, fromId: string): string {
  const order = state.playerIds;
  const n = order.length;
  const startIdx = order.indexOf(fromId);
  for (let step = 1; step <= n; step++) {
    const candidate = order[(startIdx + step + n) % n]!;
    if (state.activePlayerIds.includes(candidate)) return candidate;
  }
  return state.activePlayerIds[0]!;
}

// --- Round resolution -------------------------------------------------------

export interface RoundComparisonEntry {
  userId: string;
  cardId: string;
  value: number;
}

export interface ResolveRoundResult {
  state: TrumpcardState;
  comparison: RoundComparisonEntry[];
  winnerId: string | null;
  tiedIds: string[];
  /** Non-null only when a non-empty pool was actually claimed this round. */
  poolClaimedBy: string | null;
  newlyEliminated: string[];
}

/**
 * Compare every active player's top card on `statKey`.
 *
 * Single highest value takes every other active player's card (plus its own)
 * to the back of its pile, plus any carried-forward pool. Two or more tied for
 * highest: no winner this round — every active player's compared card this
 * round (not just the tied ones) goes into the shared pool, claimed by
 * whoever wins the next round. This is a confirmed reading of the game doc's
 * otherwise-silent 3+ player tie case (2 tied for highest, a 3rd strictly
 * lower has nobody to hand its card to either).
 */
export function resolveRound(state: TrumpcardState, statKey: StatKey): ResolveRoundResult {
  const activeIds = state.activePlayerIds;
  const comparison: RoundComparisonEntry[] = activeIds.map((id) => {
    const cardId = state.hands[id]![0]!;
    return { userId: id, cardId, value: getCardById(cardId).stats[statKey] };
  });

  const maxValue = Math.max(...comparison.map((c) => c.value));
  const topEntries = comparison.filter((c) => c.value === maxValue);

  const newHands: Record<string, string[]> = { ...state.hands };
  let newPool = [...state.pool];
  let winnerId: string | null = null;
  let tiedIds: string[] = [];
  let poolClaimedBy: string | null = null;

  const takenCards: string[] = [];
  for (const id of activeIds) {
    const hand = [...newHands[id]!];
    const top = hand.shift()!;
    newHands[id] = hand;
    takenCards.push(top);
  }

  if (topEntries.length === 1) {
    winnerId = topEntries[0]!.userId;
    const claimedPool = newPool;
    newPool = [];
    poolClaimedBy = claimedPool.length > 0 ? winnerId : null;
    newHands[winnerId] = [...newHands[winnerId]!, ...takenCards, ...claimedPool];
  } else {
    tiedIds = topEntries.map((t) => t.userId);
    newPool = [...newPool, ...takenCards];
  }

  const newlyEliminated: string[] = [];
  let newActiveIds = [...activeIds];
  const eliminations = [...state.eliminations];
  for (const id of activeIds) {
    if (newHands[id]!.length === 0) {
      newlyEliminated.push(id);
      newActiveIds = newActiveIds.filter((x) => x !== id);
      eliminations.push({ userId: id, cause: 'cards', order: eliminations.length + 1 });
    }
  }

  let newState: TrumpcardState = {
    ...state,
    hands: newHands,
    pool: newPool,
    activePlayerIds: newActiveIds,
    eliminations,
    roundNumber: state.roundNumber + 1,
  };

  newState.currentLeaderId =
    winnerId && !newlyEliminated.includes(winnerId)
      ? winnerId
      : getNextLeader(newState, state.currentLeaderId);

  return { state: newState, comparison, winnerId, tiedIds, poolClaimedBy, newlyEliminated };
}

// --- Lives system -----------------------------------------------------------

export type LifeLossCause = 'stat_choice_skip' | 'disconnect_timeout';

export interface DecrementLifeResult {
  state: TrumpcardState;
  lifeLost: boolean;
  eliminated: boolean;
  cause: LifeLossCause;
}

/**
 * Decrement a player's life for a stat-choice skip or a failed
 * disconnect-reconnect. At 0 lives: discard the player's entire remaining
 * hand (do NOT redistribute it — the game doc's explicit rule, and the one
 * deliberate difference from the Gaming_Hub reference demo, which
 * redistributes an eliminated player's cards).
 */
export function decrementLife(
  state: TrumpcardState,
  userId: string,
  cause: LifeLossCause,
): DecrementLifeResult {
  const currentLives = state.lives[userId] ?? 0;
  if (currentLives <= 0 || !state.activePlayerIds.includes(userId)) {
    return { state, lifeLost: false, eliminated: false, cause };
  }

  const newLives = { ...state.lives, [userId]: currentLives - 1 };
  let newState: TrumpcardState = { ...state, lives: newLives };

  if ((newLives[userId] ?? 0) > 0) {
    return { state: newState, lifeLost: true, eliminated: false, cause };
  }

  const newHands = { ...newState.hands, [userId]: [] };
  const newActiveIds = newState.activePlayerIds.filter((id) => id !== userId);
  const eliminations = [
    ...newState.eliminations,
    { userId, cause: 'lives' as EliminationCause, order: newState.eliminations.length + 1 },
  ];

  newState = { ...newState, hands: newHands, activePlayerIds: newActiveIds, eliminations };

  if (newState.currentLeaderId === userId && newActiveIds.length > 0) {
    newState.currentLeaderId = getNextLeader(newState, userId);
  }

  return { state: newState, lifeLost: true, eliminated: true, cause };
}

// --- Disconnect tracking ------------------------------------------------

export function markDisconnected(state: TrumpcardState, userId: string): TrumpcardState {
  if (state.disconnectedPlayers.includes(userId)) return state;
  return { ...state, disconnectedPlayers: [...state.disconnectedPlayers, userId] };
}

export function markReconnected(state: TrumpcardState, userId: string): TrumpcardState {
  return { ...state, disconnectedPlayers: state.disconnectedPlayers.filter((id) => id !== userId) };
}

// --- Match end / ranking / payout --------------------------------------------

/** Checked after every round resolves and before starting the next leader turn — never mid-round. */
export function checkMatchEnd(state: TrumpcardState): 'timer' | 'one_left' | null {
  if (state.activePlayerIds.length <= 1) return 'one_left';
  if (Date.now() >= state.matchDeadline) return 'timer';
  return null;
}

export interface FinalStanding {
  playerId: string;
  rank: number;
  cardCount: number;
  eliminatedAt: EliminationCause | null;
}

/**
 * Active players ranked by card count held (more = higher placement, ties
 * share a rank). Eliminated players are ranked below all active players, in
 * reverse elimination order (earlier eliminated = lower placement).
 */
export function rankFinalStandings(state: TrumpcardState): FinalStanding[] {
  const activeSorted = state.activePlayerIds
    .map((id) => ({ playerId: id, cardCount: state.hands[id]?.length ?? 0 }))
    .sort((a, b) => b.cardCount - a.cardCount);

  const results: FinalStanding[] = [];
  let currentRank = 1;
  for (let i = 0; i < activeSorted.length; i++) {
    const entry = activeSorted[i]!;
    if (i > 0 && entry.cardCount === activeSorted[i - 1]!.cardCount) {
      results.push({ ...entry, rank: results[i - 1]!.rank, eliminatedAt: null });
    } else {
      results.push({ ...entry, rank: currentRank, eliminatedAt: null });
      currentRank++;
    }
  }

  let rank = results.length + 1;
  for (const elim of [...state.eliminations].reverse()) {
    results.push({ playerId: elim.userId, rank, cardCount: 0, eliminatedAt: elim.cause });
    rank++;
  }

  return results;
}

/**
 * Calculate payout weights from final standings and seat count. Returns an
 * array of { userId, weight } for paid places only. Ties are handled by
 * splitting that place's share evenly — ported from `../ludo/engine.ts`.
 */
export function calculatePayoutWeights(
  rankings: { playerId: string; rank: number }[],
  seatCount: number,
): { userId: string; weight: number }[] {
  const payoutInfo = PAYOUT_TABLE[seatCount];
  if (!payoutInfo) return [];

  const { paidPlaces, splits } = payoutInfo;
  const result: { userId: string; weight: number }[] = [];

  for (let place = 1; place <= paidPlaces; place++) {
    const playersAtPlace = rankings.filter((r) => r.rank === place);
    if (playersAtPlace.length === 0) continue;

    const splitWeight = splits[place - 1] ?? 0;
    const perPlayerWeight = splitWeight / playersAtPlace.length;

    for (const p of playersAtPlace) {
      result.push({ userId: p.playerId, weight: perPlayerWeight });
    }
  }

  return result;
}
