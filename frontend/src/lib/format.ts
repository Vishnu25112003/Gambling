/**
 * The API sends every SOL amount as an exact decimal STRING (e.g.
 * "1.900000000"), because the backend stores money as Postgres NUMERIC and a
 * JSON number would reintroduce the float imprecision that type exists to
 * avoid.
 *
 * These helpers format those strings for display. Parsing to `number` here is
 * safe ONLY because the result is rendered, never used to compute a new
 * balance — all money arithmetic happens server-side.
 */

/** Trim a 9-decimal string for display: "1.900000000" -> "1.9" */
export function formatSol(amount: string | number | null | undefined, decimals = 4): string {
  if (amount === null || amount === undefined || amount === '') return '0';
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  if (n === 0) return '0';
  if (Math.abs(n) < 0.0001) {
    // Show tiny amounts at full precision rather than rounding them to "0".
    return String(amount).replace(/0+$/, '').replace(/\.$/, '');
  }
  return Number(n.toFixed(decimals)).toString();
}

export function formatSolSigned(amount: string | number, decimals = 4): string {
  const n = Number(amount);
  const body = formatSol(Math.abs(n), decimals);
  return n >= 0 ? `+${body}` : `−${body}`;
}

/** Exact string addition is not needed client-side; this is display-only. */
export function sumForDisplay(...amounts: (string | number)[]): number {
  return amounts.reduce<number>((acc, a) => acc + Number(a || 0), 0);
}

export function isPositiveAmount(amount: string | number): boolean {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0;
}

export function shortAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LEDGER_LABELS: Record<string, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  lock: 'Bet placed',
  settlement: 'Settled',
  refund: 'Refund',
  forfeit: 'Forfeit',
  fee: 'Platform fee',
};

export const ledgerLabel = (type: string): string => LEDGER_LABELS[type] ?? type;
