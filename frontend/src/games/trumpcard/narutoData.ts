/**
 * Character roster + stat labeling for the Naruto reskin, ported from the
 * Claude Design mock's `DATA` table (names/titles/villages only — the mock's
 * own per-character stat numbers are dropped; the real numbers come from the
 * backend's deterministic per-card hash in engine.ts, which stays the single
 * source of truth for match outcomes).
 *
 * The 52 roster entries are assigned to the backend's 52 `${suit}-${rank}`
 * ids in the exact nested-loop order engine.ts builds the deck in
 * (SUITS outer, RANKS inner, both ascending) — see buildDeck() there — so
 * the mapping is stable and reproducible without touching backend code.
 */

import type { TrumpSuit } from './TrumpcardCard';

interface RosterEntry {
  name: string;
  title: string;
  village: string;
}

const ROSTER: RosterEntry[] = [
  { name: 'Naruto Uzumaki', title: 'Seventh Hokage', village: 'Leaf' },
  { name: 'Sasuke Uchiha', title: 'Last Uchiha', village: 'Leaf' },
  { name: 'Kakashi Hatake', title: 'Copy Ninja', village: 'Leaf' },
  { name: 'Sakura Haruno', title: 'Medical Ninja', village: 'Leaf' },
  { name: 'Rock Lee', title: 'Taijutsu Prodigy', village: 'Leaf' },
  { name: 'Neji Hyuga', title: 'Byakugan Genius', village: 'Leaf' },
  { name: 'Hinata Hyuga', title: 'Gentle Fist', village: 'Leaf' },
  { name: 'Shikamaru Nara', title: 'Shadow Tactician', village: 'Leaf' },
  { name: 'Ino Yamanaka', title: 'Mind Transfer', village: 'Leaf' },
  { name: 'Choji Akimichi', title: 'Human Boulder', village: 'Leaf' },
  { name: 'Kiba Inuzuka', title: 'Fang Over Fang', village: 'Leaf' },
  { name: 'Shino Aburame', title: 'Insect User', village: 'Leaf' },
  { name: 'Tenten', title: 'Weapon Mistress', village: 'Leaf' },
  { name: 'Hashirama Senju', title: 'First Hokage', village: 'Leaf' },
  { name: 'Minato Namikaze', title: 'Fourth Hokage', village: 'Leaf' },
  { name: 'Tsunade', title: 'Fifth Hokage', village: 'Leaf' },
  { name: 'Jiraiya', title: 'Toad Sage', village: 'Leaf' },
  { name: 'Hiruzen Sarutobi', title: 'Third Hokage', village: 'Leaf' },
  { name: 'Tobirama Senju', title: 'Second Hokage', village: 'Leaf' },
  { name: 'Might Guy', title: 'Eight Gates', village: 'Leaf' },
  { name: 'Kushina Uzumaki', title: 'Red Hot Habanero', village: 'Leaf' },
  { name: 'Yamato', title: 'Wood Style Captain', village: 'Leaf' },
  { name: 'Sai', title: 'Ink Ninja', village: 'Leaf' },
  { name: 'Asuma Sarutobi', title: 'Wind Blades', village: 'Leaf' },
  { name: 'Kurenai Yuhi', title: 'Genjutsu Mistress', village: 'Leaf' },
  { name: 'Iruka Umino', title: 'Academy Teacher', village: 'Leaf' },
  { name: 'Madara Uchiha', title: 'Ghost of the Uchiha', village: 'Akatsuki' },
  { name: 'Obito Uchiha', title: 'Masked Man', village: 'Akatsuki' },
  { name: 'Itachi Uchiha', title: 'Genjutsu Master', village: 'Akatsuki' },
  { name: 'Nagato', title: 'Six Paths of Pain', village: 'Rain' },
  { name: 'Orochimaru', title: 'Snake Sannin', village: 'Sound' },
  { name: 'Kisame Hoshigaki', title: 'Tailless Tailed Beast', village: 'Mist' },
  { name: 'Sasori', title: 'Puppet Master', village: 'Sand' },
  { name: 'Deidara', title: 'Explosive Art', village: 'Stone' },
  { name: 'Kakuzu', title: 'Five Hearts', village: 'Waterfall' },
  { name: 'Hidan', title: 'Immortal Ritualist', village: 'Hot Springs' },
  { name: 'Konan', title: 'Angel of Paper', village: 'Rain' },
  { name: 'Zetsu', title: 'The Spy', village: 'Akatsuki' },
  { name: 'Kabuto Yakushi', title: 'Sage of Snakes', village: 'Sound' },
  { name: 'Gaara', title: 'Fifth Kazekage', village: 'Sand' },
  { name: 'Killer Bee', title: 'Eight Tails Jinchuriki', village: 'Cloud' },
  { name: 'A · Fourth Raikage', title: 'Lightning Armour', village: 'Cloud' },
  { name: 'Onoki', title: 'Third Tsuchikage', village: 'Stone' },
  { name: 'Mei Terumi', title: 'Fifth Mizukage', village: 'Mist' },
  { name: 'Temari', title: 'Wind Fan', village: 'Sand' },
  { name: 'Kankuro', title: 'Puppet Corps', village: 'Sand' },
  { name: 'Zabuza Momochi', title: 'Demon of the Mist', village: 'Mist' },
  { name: 'Haku', title: 'Ice Mirrors', village: 'Mist' },
  { name: 'Danzo Shimura', title: 'Root Commander', village: 'Leaf' },
  { name: 'Anko Mitarashi', title: 'Snake Kunoichi', village: 'Leaf' },
  { name: 'Ibiki Morino', title: 'Interrogation Chief', village: 'Leaf' },
  { name: 'Shizune', title: 'Poison Medic', village: 'Leaf' },
];

/** Mirrors backend/src/games/trumpcard/engine.ts's SUITS/RANKS + buildDeck() loop order. */
const SUITS_ORDER: TrumpSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

const CHARACTER_BY_ID = new Map<string, RosterEntry>();
let rosterIndex = 0;
for (const suit of SUITS_ORDER) {
  for (const rank of RANKS_ORDER) {
    CHARACTER_BY_ID.set(`${suit}-${rank}`, ROSTER[rosterIndex]);
    rosterIndex++;
  }
}

const FALLBACK_CHARACTER: RosterEntry = { name: 'Unknown Shinobi', title: 'Mystery Ninja', village: 'Leaf' };

export function getCharacter(cardId: string): RosterEntry {
  return CHARACTER_BY_ID.get(cardId) ?? FALLBACK_CHARACTER;
}

/**
 * Stat display order + labels, ported from the mock's LABELS map. The
 * backend's six flavor stats (see STAT_KEYS in backend/src/games/trumpcard/types.ts)
 * keep their real keys/values — only the on-card label and row order change,
 * so match logic (which compares raw `stats[key]` values) is untouched.
 */
export const STAT_META: { key: string; label: string }[] = [
  { key: 'power', label: 'STRENGTH' },
  { key: 'speed', label: 'SPEED' },
  { key: 'defense', label: 'CHAKRA' },
  { key: 'stamina', label: 'JUTSU' },
  { key: 'intellect', label: 'INTELLECT' },
  { key: 'luck', label: 'POPULARITY' },
];
