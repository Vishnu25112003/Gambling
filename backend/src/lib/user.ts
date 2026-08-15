import type { User } from '../generated/prisma/client.js';
import { toAmountString } from './money.js';

/** A short, human-friendly label for a wallet: `7xKX…9aBc`. */
export function shortAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

/**
 * The user shape sent to clients.
 *
 * Balances go over the wire as fixed 9-decimal STRINGS, not numbers. Serialising
 * a NUMERIC as a JSON number would hand it straight back to the float
 * imprecision the database type exists to avoid — `1.000000001` is not exactly
 * representable as a double. The frontend formats the string for display.
 */
export function publicUser(user: User) {
  return {
    id: user.id,
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    availableBalance: toAmountString(user.availableBalance),
    lockedBalance: toAmountString(user.lockedBalance),
    totalWagered: toAmountString(user.totalWagered),
    netProfit: toAmountString(user.netProfit),
    gamesPlayed: user.gamesPlayed,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
}
