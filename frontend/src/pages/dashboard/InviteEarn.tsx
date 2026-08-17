import { useState } from 'react';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageTitle,
  SectionHeading,
  Spinner,
} from '../../components/shared/ui';
import { Icon, InviteIcon } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { useReferrals } from '../../hooks/useReferrals';
import { referralApi } from '../../api/endpoints';
import { referralStore } from '../../lib/referralCapture';
import { formatDate, formatSol } from '../../lib/format';
import type { ReferredFriend } from '../../types';

const SUBTITLE = 'Share your link and earn a cut of your friends’ first win.';

/** Doc 06: a GATED section — placeholder until connected. */
export function InviteEarn() {
  const { isAuthenticated } = useAuth();
  const { data, loading, error, reload } = useReferrals(isAuthenticated);

  if (!isAuthenticated) {
    return (
      <>
        <PageTitle title="Invite & Earn" subtitle={SUBTITLE} />
        <ConnectWalletPlaceholder what="your invite link and referral earnings" icon="users" />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageTitle title="Invite & Earn" subtitle={SUBTITLE} />
        <Card radius={16} className="flex justify-center py-16">
          <Spinner />
        </Card>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageTitle title="Invite & Earn" subtitle={SUBTITLE} />
        <EmptyState
          radius={16}
          icon={<Icon name="users" size={19} />}
          scaleIcon
          title="Couldn’t load your invites"
          body="The referral service didn’t respond. Refresh to try again."
        />
      </>
    );
  }

  const rate = data.commissionBps / 100;

  return (
    <>
      <PageTitle title="Invite & Earn" subtitle={SUBTITLE} />

      <InviteLinkCard link={data.link} code={data.code} rate={rate} />

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <Stat label="FRIENDS INVITED" value={String(data.stats.invited)} />
        <Stat label="AWAITING FIRST WIN" value={String(data.stats.pending)} />
        <Stat label="REWARDS PAID" value={String(data.stats.earned)} />
        <Stat
          label="TOTAL EARNED"
          value={`${formatSol(data.stats.totalEarned)} SOL`}
          accent
        />
      </div>

      <HowItWorks rate={rate} />

      {data.referredBy && (
        <p className="mt-4 text-[12.5px] text-muted">
          You joined through <span className="font-semibold text-text">{data.referredBy.name}</span>
          ’s invite — your first win earns them {rate}%.
        </p>
      )}

      {data.canEnterCode && <ClaimCodeCard onClaimed={reload} />}

      <FriendsTable friends={data.friends} rate={rate} />
    </>
  );
}

/** The design's accent panel treatment, same as the sidebar's Invite card. */
function InviteLinkCard({ link, code, rate }: { link: string; code: string; rate: number }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  // No toast library in this project — feedback is inline, as in Settings/Escrow.
  const copy = async (value: string, which: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is blocked outside a secure context. The link is selectable
      // on screen either way, so there is nothing worth interrupting them for.
    }
  };

  const share = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
  const pitch = `Play on GamblingHub with me — provably fair games on Solana.`;

  return (
    <div className="rounded-[20px] border border-green-solid/[0.22] bg-[linear-gradient(135deg,rgba(34,197,94,0.14),transparent)] p-6">
      <SectionHeading
        icon={<InviteIcon size={17} />}
        title="Your invite link"
        subtitle={`Anyone who joins through this link earns you ${rate}% of their first winning game.`}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-[10px] border border-line bg-bg2 px-3.5 py-[11px] font-mono text-[13px] whitespace-nowrap text-text">
          {link}
        </code>
        <Button variant="solid" onClick={() => void copy(link, 'link')}>
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <span className="text-[12.5px] text-muted">Or share your code:</span>
        <button
          onClick={() => void copy(code, 'code')}
          className="cursor-pointer rounded-[9px] border border-line bg-bg2 px-3 py-1.5 font-mono text-[13px] font-bold tracking-[0.08em] text-green"
          title="Copy code"
        >
          {code}
        </button>
        {copied === 'code' && <span className="text-[12px] text-green">Copied.</span>}

        <span className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => share(`https://x.com/intent/tweet?text=${encodeURIComponent(pitch)}&url=${encodeURIComponent(link)}`)}
          >
            Share on X
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => share(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(pitch)}`)}
          >
            Telegram
          </Button>
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[14px] border border-line bg-card p-5">
      <div className="mb-2 text-[11.5px] font-semibold text-muted">{label}</div>
      <div className={`text-[22px] font-extrabold ${accent ? 'text-green' : ''}`}>{value}</div>
    </div>
  );
}

function HowItWorks({ rate }: { rate: number }) {
  const steps = [
    ['Share your link', 'Your friend signs up with their Solana wallet through it.'],
    ['They play', 'Nothing is taken from them — their bets and payouts are untouched.'],
    [
      'You get paid',
      `The first time they finish a game in profit, ${rate}% of that profit lands in your balance. A loss doesn’t cost you the reward — it just waits for their first win.`,
    ],
  ];

  return (
    <Card className="mt-4 p-6">
      <SectionHeading icon={<Icon name="bolt" size={17} />} title="How it works" />
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-5">
        {steps.map(([title, body], i) => (
          <li key={title}>
            <div className="mb-2 flex size-7 items-center justify-center rounded-full bg-green-solid/[0.16] text-[12.5px] font-bold text-green">
              {i + 1}
            </div>
            <p className="mb-1 text-[14px] font-bold">{title}</p>
            <p className="text-[12.5px] leading-[1.55] text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * Shown only while the player is still eligible — no referrer yet and no games
 * played. Pre-filled from a captured link code, which covers the case where
 * someone clicked an invite but had already created an account earlier.
 */
function ClaimCodeCard({ onClaimed }: { onClaimed: () => void }) {
  const [code, setCode] = useState(referralStore.peek() ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    setStatus(null);
    try {
      const res = await referralApi.claim(code.trim());
      referralStore.clear();
      setStatus(`You’re now linked to ${res.referredBy.name}.`);
      onClaimed();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4 p-6">
      <SectionHeading
        icon={<Icon name="gift" size={17} />}
        title="Got an invite code?"
        subtitle="Add it before your first game and your friend earns a cut of your first win."
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="7KX9AB4C"
          maxLength={12}
          className="w-44 font-mono tracking-[0.08em]"
        />
        <Button variant="secondary" disabled={busy || code.trim().length < 4} onClick={() => void submit()}>
          {busy ? 'Applying…' : 'Apply code'}
        </Button>
      </div>
      {status && <p className="mt-3 text-sm text-green">{status}</p>}
      {err && <p className="mt-3 text-sm text-red">{err}</p>}
    </Card>
  );
}

function FriendsTable({ friends, rate }: { friends: ReferredFriend[]; rate: number }) {
  if (friends.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          radius={16}
          icon={<Icon name="users" size={19} />}
          scaleIcon
          title="No friends yet"
          body={`Share your link — you’ll earn ${rate}% the first time someone you invited wins.`}
        />
      </div>
    );
  }

  return (
    <Card radius={16} className="mt-4 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line2 text-left text-[11px] font-semibold tracking-[0.06em] text-faint">
              <th className="px-5 py-3.5">FRIEND</th>
              <th className="px-5 py-3.5">JOINED</th>
              <th className="px-5 py-3.5 text-right">STATUS</th>
              <th className="px-5 py-3.5 text-right">EARNED</th>
            </tr>
          </thead>
          <tbody>
            {friends.map((f) => (
              <tr key={f.id} className="border-b border-line2">
                <td className="px-5 py-3 font-semibold">{f.name}</td>
                <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDate(f.joinedAt)}</td>
                <td className="px-5 py-3 text-right">
                  <Badge tone={f.status === 'earned' ? 'success' : 'warn'}>
                    {f.status === 'earned' ? 'paid' : 'awaiting first win'}
                  </Badge>
                </td>
                <td
                  className={`px-5 py-3 text-right font-mono font-bold whitespace-nowrap ${
                    f.status === 'earned' ? 'text-green' : 'text-faint'
                  }`}
                >
                  {f.status === 'earned' ? `+${formatSol(f.earned)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
