import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDismissable } from '../../hooks/useDismissable';
import { useNotifications, type Notification } from '../../hooks/useNotifications';
import { formatRelative } from '../../lib/format';
import { BellIcon, Icon } from '../shared/icons';
import { Spinner } from '../shared/ui';

/**
 * The bell, and the panel behind it.
 *
 * Every item is a real ledger event — a credited deposit, a settled match, a
 * referral bonus — rather than the design's decorative dot. The badge counts
 * only what has arrived since this browser last opened the panel.
 */
export function NotificationsMenu({ enabled }: { enabled: boolean }) {
  const { open, toggle, close, ref } = useDismissable<HTMLDivElement>();
  const { notifications, unreadCount, loading, markAllRead, reload } = useNotifications(enabled);

  // Refetch on open, so the panel never shows a stale feed.
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  /**
   * Clear the badge once the feed has actually rendered — not the instant the
   * button is pressed. On a cold open the list is still in flight, and stamping
   * then would mark events read that were never on screen.
   *
   * The ref keeps it to one stamp per open, since `notifications` changes
   * identity on every refetch.
   */
  const stamped = useRef(false);
  useEffect(() => {
    if (!open) {
      stamped.current = false;
      return;
    }
    if (stamped.current || notifications.length === 0) return;
    stamped.current = true;
    markAllRead();
  }, [open, notifications, markAllRead]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`relative flex size-[42px] cursor-pointer items-center justify-center rounded-[11px] border bg-card transition ${
          open ? 'border-green-solid/40 text-green' : 'border-line text-muted hover:text-text'
        }`}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-bg bg-green-solid px-1 text-[10px] font-bold text-on-green">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-50 w-[min(92vw,340px)] overflow-hidden rounded-[14px] border border-line bg-bg2 shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
        >
          <div className="flex items-center justify-between border-b border-line2 px-4 py-3">
            <span className="text-[13.5px] font-bold">Notifications</span>
            <Link
              to="/dashboard/transactions"
              onClick={close}
              className="text-[12px] font-semibold text-green hover:underline"
            >
              View all
            </Link>
          </div>

          {loading && notifications.length === 0 ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-9 text-center">
              <p className="mb-1 text-[13.5px] font-bold">You're all caught up</p>
              <p className="text-[12px] text-muted">
                Deposits, settled matches and referral bonuses land here.
              </p>
            </div>
          ) : (
            <ul className="max-h-[min(64vh,420px)] overflow-y-auto">
              {notifications.map((n) => (
                <Row key={n.id} n={n} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const TONE: Record<Notification['tone'], string> = {
  good: 'border-green-solid/25 bg-green-solid/[0.12] text-green',
  bad: 'border-red/25 bg-red/[0.12] text-red',
  neutral: 'border-line bg-line2 text-muted',
};

function Row({ n }: { n: Notification }) {
  return (
    <li
      className={`flex gap-3 border-b border-line2 px-4 py-3 last:border-b-0 ${
        n.unread ? 'bg-green-solid/[0.04]' : ''
      }`}
    >
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px] border ${TONE[n.tone]}`}
      >
        <Icon name={n.icon} size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-bold">{n.title}</span>
          <span className="shrink-0 text-[11px] whitespace-nowrap text-faint">
            {formatRelative(n.timestamp)}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] leading-[1.45] text-muted">{n.body}</p>
        {n.explorerUrl && (
          <a
            href={n.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11.5px] font-semibold text-green hover:underline"
          >
            View on explorer ↗
          </a>
        )}
      </div>

      {n.unread && <span className="mt-2 size-[7px] shrink-0 rounded-full bg-green" />}
    </li>
  );
}
