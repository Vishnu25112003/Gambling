import { useCallback, useEffect, useMemo, useState } from 'react';
import { walletApi } from '../api/endpoints';
import { formatSol } from '../lib/format';
import type { IconName } from '../components/shared/icons';
import type { LedgerRow } from '../types';

/**
 * Doc 02/03/09 — the notification feed.
 *
 * There is no notifications table, and there should not be one: every event
 * worth telling a player about is already an immutable row in the ledger, which
 * is the system's single source of truth for "something happened to your money".
 * A parallel notifications table would be a second copy of that truth, free to
 * drift from it.
 *
 * So this reads the ledger and presents it. "Unread" is the only genuinely new
 * state, and it is per-browser rather than per-account — a read receipt is not
 * worth a database write, and the ledger itself is already the durable record.
 */

const SEEN_KEY = 'gambling-hub.notifications-seen';

export interface Notification {
  id: string;
  title: string;
  body: string;
  icon: IconName;
  tone: 'good' | 'bad' | 'neutral';
  timestamp: string;
  unread: boolean;
  explorerUrl: string | null;
}

function seenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * One ledger row rendered as a sentence.
 *
 * `amount` is signed from the user's perspective, so its sign decides the tone
 * everywhere except the cases where the direction is not the point — a lock is
 * a debit but not a loss, a refund is a credit but not a win.
 */
function describe(row: LedgerRow): Omit<Notification, 'unread'> | null {
  const abs = formatSol(Math.abs(Number(row.amount)));
  const credited = Number(row.amount) >= 0;

  const base = { id: row.id, timestamp: row.timestamp, explorerUrl: row.explorerUrl };

  switch (row.type) {
    case 'deposit':
      return {
        ...base,
        icon: 'wallet',
        tone: row.status === 'confirmed' ? 'good' : 'neutral',
        title: row.status === 'confirmed' ? 'Deposit credited' : 'Deposit pending',
        body:
          row.status === 'confirmed'
            ? `${abs} SOL is now in your balance.`
            : `${abs} SOL is waiting on confirmation.`,
      };

    case 'withdrawal':
      return {
        ...base,
        icon: 'wallet',
        tone: row.status === 'failed' ? 'bad' : 'neutral',
        title: row.status === 'failed' ? 'Withdrawal failed' : 'Withdrawal sent',
        body:
          row.status === 'failed'
            ? `${abs} SOL was returned to your balance.`
            : `${abs} SOL is on its way to your wallet.`,
      };

    case 'settlement':
      return {
        ...base,
        icon: 'dice',
        tone: credited ? 'good' : 'bad',
        title: credited ? 'You won' : 'Match settled',
        body: credited
          ? `+${abs} SOL from ${row.gameType ?? 'a match'}.`
          : `Your ${abs} SOL stake went to the winner.`,
      };

    case 'refund':
      return {
        ...base,
        icon: 'lockbox',
        tone: 'neutral',
        title: 'Match refunded',
        body: `${abs} SOL came back in full — no fee taken.`,
      };

    case 'forfeit':
      // The zero-amount row is the "reconnected in time" case, which is a
      // non-event: nothing was lost, so there is nothing to announce.
      if (Number(row.amount) === 0) return null;
      return {
        ...base,
        icon: 'clock',
        tone: 'bad',
        title: 'Stake forfeited',
        body: `You didn't reconnect in time and lost ${abs} SOL.`,
      };

    case 'referral':
      return {
        ...base,
        icon: 'users',
        tone: 'good',
        title: 'Referral bonus',
        body: row.note ?? `+${abs} SOL from a friend you invited.`,
      };

    // A lock is the user's own deliberate action a moment earlier, and the fee
    // row is house accounting. Neither is news.
    case 'lock':
    case 'fee':
    default:
      return null;
  }
}

export function useNotifications(enabled: boolean): {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAllRead: () => void;
  reload: () => void;
} {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  /**
   * The watermark used to highlight individual items. Read once per session
   * rather than on every refetch, so opening the panel does not erase the very
   * markers the reader opened it to see.
   */
  const [seen] = useState(seenAt);

  /**
   * The badge, tracked separately from `seen`. Opening the panel silences the
   * count immediately — it has been looked at — while the rows behind it keep
   * their "new" tint until the next page load.
   */
  const [badgeCleared, setBadgeCleared] = useState(false);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void walletApi
      .history(1, 30)
      .then((page) => {
        if (!cancelled) setRows(page.entries);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  const notifications = useMemo(
    () =>
      rows
        .map(describe)
        .filter((n): n is Omit<Notification, 'unread'> => n !== null)
        .map((n) => ({ ...n, unread: new Date(n.timestamp).getTime() > seen })),
    [rows, seen],
  );

  const markAllRead = useCallback(() => {
    // Nothing has loaded yet — stamping now would mark unseen events as read.
    if (notifications.length === 0) return;

    // Stamped from the newest item rather than from `Date.now()`, so an event
    // that lands a moment after the panel opens is still counted as new.
    const stamp = new Date(notifications[0]!.timestamp).getTime();
    try {
      localStorage.setItem(SEEN_KEY, String(stamp));
    } catch {
      // Private browsing. The badge simply reappears next session.
    }
    setBadgeCleared(true);
  }, [notifications]);

  return {
    notifications,
    unreadCount: badgeCleared ? 0 : notifications.filter((n) => n.unread).length,
    loading,
    markAllRead,
    reload,
  };
}
