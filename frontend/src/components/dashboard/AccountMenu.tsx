import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { useDismissable } from '../../hooks/useDismissable';
import { formatSol, shortAddress } from '../../lib/format';
import { tierRank } from '../../lib/tierBadges';
import { Avatar } from '../shared/Avatar';
import { ChevronDown, Icon } from '../shared/icons';
import type { AppUser, Balance, TierProgress } from '../../types';

/** "RANK III RAIDER" — the same format the mockup's topbar and dropdown both use. */
function rankLabel(tier: TierProgress | null): string {
  if (!tier) return '';
  const roman = tierRank(tier.key);
  return roman ? `RANK ${roman} ${tier.label.toUpperCase()}` : tier.label.toUpperCase();
}

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
  // The mockup's button and dropdown both carry the rank label under the name —
  // `AppUser` doesn't have tier data, so this is its own small fetch, same
  // pattern as Overview's rank-progress bar.
  const { data: profile } = useProfile(user ? 'me' : null);
  const { open, toggle, close, ref } = useDismissable<HTMLDivElement>();
  const navigate = useNavigate();

  if (!user) return null;

  const label = user.username || shortAddress(user.walletAddress);
  const rank = rankLabel(profile?.tier ?? null);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        className="flex cursor-pointer items-center gap-2.5 rounded-[11px] border py-[6px] pr-3 pl-[6px] transition"
        style={{ borderColor: open ? 'rgba(47,224,138,.34)' : 'var(--panel-border-soft)', background: 'var(--panel-bg2)' }}
      >
        <Avatar src={user.avatarUrl} address={user.walletAddress} name={user.username ?? undefined} size={30} radiusRatio={0.27} />
        <span className="flex flex-col items-start leading-[1.1]">
          <span className="max-w-[130px] truncate font-mono text-[12.5px]">{label}</span>
          {rank && <span className="mt-[3px] font-mono text-[9px] tracking-[0.14em] text-muted">{rank}</span>}
        </span>
        <ChevronDown size={14} color="var(--faint)" className={open ? 'rotate-180 transition' : 'transition'} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-50 w-[262px] max-w-[84vw] overflow-hidden rounded-[14px] border shadow-[0_24px_60px_rgba(0,0,0,.6)]"
          style={{ borderColor: 'rgba(47,224,138,.22)', background: 'var(--panel-bg)' }}
        >
          <AccountHeader user={user} balance={balance} rank={rank} />

          <div className="p-2">
            <MenuLink to="/dashboard/settings" icon="cog" label="Profile & settings" onClick={close} />
            <MenuLink to="/dashboard/escrow" icon="lockbox" label="Deposit & withdraw" onClick={close} />
            <MenuLink to="/dashboard/transactions" icon="receipt" label="Transactions" onClick={close} />
            <MenuLink to="/dashboard/affiliates" icon="users" label="Invite & Earn" onClick={close} />
          </div>

          <div className="p-2" style={{ borderTop: '1px solid rgba(239,83,80,.16)' }}>
            <button
              role="menuitem"
              onClick={() => {
                close();
                void signOut();
                navigate('/');
              }}
              className="flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] border-0 bg-transparent px-3 py-2.5 text-left font-heading text-[14px] font-bold text-red transition hover:bg-red/10"
            >
              <span className="size-[7px] shrink-0 rotate-45 rounded-[1.5px] bg-red" />
              <span>LOGOUT</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The identity header at the top of the dropdown: avatar, name, rank · games
 * played, the full copyable address, and the available/in-escrow split.
 */
function AccountHeader({ user, balance, rank }: { user: AppUser; balance: Balance | null; rank: string }) {
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
    <div
      className="p-3.5"
      style={{ borderBottom: '1px solid rgba(47,224,138,.1)', background: 'linear-gradient(160deg, rgba(47,224,138,.12), rgba(6,9,7,0))' }}
    >
      <div className="flex items-center gap-[11px]">
        <Avatar src={user.avatarUrl} address={user.walletAddress} name={user.username ?? undefined} size={38} radiusRatio={0.28} />
        <div className="min-w-0">
          <div className="truncate font-heading text-[15px] font-bold text-text">
            {user.username || 'Unnamed player'}
          </div>
          <div className="mt-[3px] font-mono text-[10px] tracking-[0.1em] text-muted">
            {rank ? `${rank} · ` : ''}
            {user.gamesPlayed} GAMES
          </div>
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
        className="mt-3 flex w-full cursor-pointer items-start gap-2 rounded-[9px] border p-2.5 text-left"
        style={{ borderColor: 'rgba(47,224,138,.14)', background: 'var(--panel-bg)' }}
      >
        <span className="min-w-0 flex-1 font-mono text-[11px] leading-[1.45] break-all text-muted">
          {user.walletAddress}
        </span>
        <span className="shrink-0 font-mono text-[11px] font-bold text-green">
          {copied ? 'COPIED' : 'COPY'}
        </span>
      </button>

      <div className="mt-2.5 flex gap-2">
        <Figure label="AVAILABLE" value={`${formatSol(balance?.availableBalance ?? '0')} SOL`} color="#2fe08a" />
        <Figure label="IN ESCROW" value={`${formatSol(balance?.lockedBalance ?? '0')} SOL`} color="#f0b429" />
      </div>
    </div>
  );
}

function Figure({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-1 rounded-[9px] border p-[8px_10px]" style={{ borderColor: 'rgba(47,224,138,.1)', background: 'var(--panel-bg3)' }}>
      <div className="font-mono text-[9px] tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[12.5px]" style={{ color }}>
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
      className="flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 font-heading text-[14px] font-semibold text-text transition hover:bg-line2"
    >
      <Icon name={icon} size={16} className="text-green" />
      <span className="min-w-0 flex-1">{label}</span>
    </Link>
  );
}
