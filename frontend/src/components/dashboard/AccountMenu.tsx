import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDismissable } from '../../hooks/useDismissable';
import { formatSol, shortAddress } from '../../lib/format';
import { Avatar } from '../shared/Avatar';
import { ChevronDown, Icon, SignOutIcon } from '../shared/icons';
import type { AppUser, Balance } from '../../types';

/**
 * The account button in the top bar.
 *
 * It used to sign the user out on a single click, which is a destructive action
 * fired by the control that merely *displays* who you are — easy to hit by
 * accident, and it drops the wallet session with no confirmation. Now the button
 * opens a panel showing the identity it was already labelled with, and
 * disconnecting is a deliberate, separately-labelled choice inside it.
 */
export function AccountMenu() {
  const { user, balance, signOut } = useAuth();
  const { open, toggle, close, ref } = useDismissable<HTMLDivElement>();
  const navigate = useNavigate();

  if (!user) return null;

  const label = user.displayName || shortAddress(user.walletAddress);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        className={`flex cursor-pointer items-center gap-2.5 rounded-xl border bg-card py-[7px] pr-3 pl-2 transition ${
          open ? 'border-green-solid/40' : 'border-line hover:border-green-solid/25'
        }`}
      >
        <Avatar src={user.avatarUrl} address={user.walletAddress} name={user.displayName ?? undefined} />
        <span className="max-w-[130px] truncate font-mono text-[12.5px] font-medium">{label}</span>
        <ChevronDown
          size={14}
          color="var(--faint)"
          className={open ? 'rotate-180 transition' : 'transition'}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-50 w-[min(92vw,296px)] overflow-hidden rounded-[14px] border border-line bg-bg2 shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
        >
          <AccountHeader user={user} balance={balance} />

          <div className="p-1.5">
            <MenuLink to="/dashboard/settings" icon="cog" label="Profile & settings" onClick={close} />
            <MenuLink to="/dashboard/escrow" icon="lockbox" label="Deposit & withdraw" onClick={close} />
            <MenuLink to="/dashboard/transactions" icon="receipt" label="Transactions" onClick={close} />
            <MenuLink to="/dashboard/affiliates" icon="users" label="Invite & Earn" onClick={close} />
          </div>

          <div className="border-t border-line2 p-1.5">
            <button
              role="menuitem"
              onClick={() => {
                close();
                signOut();
                navigate('/');
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-2.5 py-2.5 text-left text-[13px] font-semibold text-red hover:bg-red/10"
            >
              <SignOutIcon size={16} />
              <span>Disconnect wallet</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The full address, copyable.
 *
 * The button's own label is necessarily abbreviated to fit the bar, so this is
 * the one place the complete address is available to check against a wallet or
 * an explorer — which is the whole reason someone opens this menu.
 */
function AccountHeader({ user, balance }: { user: AppUser; balance: Balance | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(user.walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context. The address is selectable regardless.
    }
  };

  return (
    <div className="border-b border-line2 bg-[linear-gradient(135deg,rgba(34,197,94,0.10),transparent)] px-4 pt-4 pb-3.5">
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar
          src={user.avatarUrl}
          address={user.walletAddress}
          name={user.displayName ?? undefined}
          size={38}
        />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold">
            {user.displayName || 'Unnamed player'}
          </div>
          <div className="text-[11.5px] text-muted">{user.gamesPlayed} games played</div>
        </div>
      </div>

      {/*
        Wrapped, not truncated. Seeing the address in full is the reason this
        menu exists — an ellipsis here would show no more than the button that
        opened it, and there is no way to check a truncated address against a
        wallet or an explorer.
      */}
      <button
        onClick={() => void copy()}
        title="Copy wallet address"
        className="flex w-full cursor-pointer items-start gap-2 rounded-[9px] border border-line bg-bg2 px-2.5 py-2 text-left"
      >
        <span className="min-w-0 flex-1 font-mono text-[11.5px] leading-[1.45] break-all text-muted">
          {user.walletAddress}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-green">
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Figure label="Available" value={`${formatSol(balance?.availableBalance ?? '0')} SOL`} accent />
        <Figure label="In escrow" value={`${formatSol(balance?.lockedBalance ?? '0')} SOL`} />
      </div>
    </div>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[9px] border border-line bg-bg2 px-2.5 py-2">
      <div className="mb-0.5 text-[10.5px] font-semibold text-faint">{label}</div>
      <div className={`font-mono text-[12.5px] font-bold ${accent ? 'text-green' : 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}

function MenuLink({
  to,
  icon,
  label,
  onClick,
}: {
  to: string;
  icon: 'cog' | 'lockbox' | 'receipt' | 'users';
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      role="menuitem"
      to={to}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-[13px] font-semibold text-muted transition hover:bg-line2 hover:text-text"
    >
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </Link>
  );
}

