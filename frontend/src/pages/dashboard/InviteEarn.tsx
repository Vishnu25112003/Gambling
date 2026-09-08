import { useState } from 'react';
import { Copy, Route, Send, Share2 } from 'lucide-react';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Panel, PanelHeader, StatTile, TableHead, TableRow, TableScroll, StatusChip } from '../../components/dashboard/panels';
import { Input, PageTitle, Spinner } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';
import { Avatar } from '../../components/shared/Avatar';
import { useAuth } from '../../hooks/useAuth';
import { useReferrals } from '../../hooks/useReferrals';
import { referralApi } from '../../api/endpoints';
import { referralStore } from '../../lib/referralCapture';
import { formatDate, formatSol } from '../../lib/format';
import type { ReferredFriend } from '../../types';

const SUBTITLE = "Take 5% of every friend's first winning game — paid straight to your balance.";
const REFERRALS_TEMPLATE = '1.2fr 1.2fr .9fr .8fr';

const MILESTONES = [
  { friends: 1, reward: 'Recruit badge', icon: 'gift' as const },
  { friends: 5, reward: '0.02 SOL bonus', icon: 'coin' as const },
  { friends: 10, reward: '0.05 SOL bonus', icon: 'coin' as const },
  { friends: 25, reward: '0.15 SOL bonus', icon: 'trophy' as const },
];

const STEPS = [
  { n: 1, icon: 'users' as const, title: 'Share your link', body: 'Your friend signs up with their Solana wallet through it.' },
  { n: 2, icon: 'gamepad' as const, title: 'They play', body: 'Nothing is taken from them — their bets and payouts are untouched.' },
];

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
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageTitle title="Invite & Earn" subtitle={SUBTITLE} />
        <p className="py-10 text-center text-[13px] text-muted">
          The referral service didn't respond. Refresh to try again.
        </p>
      </>
    );
  }

  const rate = data.commissionBps / 100;
  const step3Body = `The first time they finish a game in profit, ${rate}% of that profit lands in your balance. A loss doesn't cost you the reward — it just waits for their first win.`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">
          INVITE &amp; EARN
        </h1>
        <p className="text-sm text-muted">{SUBTITLE}</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-stretch gap-4">
        <InviteHero link={data.link} code={data.code} rate={rate} />

        <section className="flex min-w-0 flex-col gap-3">
          <div className="rounded-[18px] border p-5" style={{ borderColor: 'var(--amber-border)', background: 'linear-gradient(160deg, rgba(240,180,41,.08), rgba(6,9,7,0) 60%), var(--panel-bg)' }}>
            <div className="font-mono text-[10px] tracking-[0.18em] text-[#8a6410]">TOTAL EARNED</div>
            <div className="mt-1.5 flex items-end gap-2.5">
              <span className="font-heading text-[clamp(34px,4.2vw,46px)] leading-none font-bold text-[#f7d774]">
                {formatSol(data.stats.totalEarned)}
              </span>
              <span className="pb-1 font-mono text-[13px] text-gold">SOL</span>
            </div>
            <p className="mt-2 text-[12.5px] text-muted">
              Paid out from {data.stats.earned} of {data.stats.invited} friends who have won.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(130px,1fr))] items-stretch gap-3">
            <StatTile icon="users" label="FRIENDS INVITED" value={String(data.stats.invited)} color="var(--green)" />
            <StatTile icon="clock" label="AWAITING FIRST WIN" value={String(data.stats.pending)} color="var(--gold-bright)" />
            <StatTile icon="gift" label="REWARDS PAID" value={String(data.stats.earned)} color="var(--text)" />
          </div>
        </section>
      </div>

      {data.referredBy && (
        <p className="text-[12.5px] text-muted">
          You joined through <span className="font-semibold text-text">{data.referredBy.name}</span>'s invite —
          your first win earns them {rate}%.
        </p>
      )}

      <Panel>
        <PanelHeader title="RECRUIT MILESTONES" meta={`${data.stats.invited} / ${MILESTONES[MILESTONES.length - 1]!.friends} FRIENDS`} />
        <div className="relative h-2 overflow-hidden rounded-md border" style={{ background: '#0b1a12', borderColor: 'rgba(47,224,138,.14)' }}>
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, (data.stats.invited / MILESTONES[MILESTONES.length - 1]!.friends) * 100)}%`,
              background: 'linear-gradient(90deg, #0f7d4d, #35eb95)',
              boxShadow: '0 0 16px rgba(47,224,138,.5)',
            }}
          />
        </div>
        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
          {MILESTONES.map((m) => {
            const reached = data.stats.invited >= m.friends;
            return (
              <div
                key={m.friends}
                className="rounded-xl border p-[14px_12px] text-center"
                style={reached ? { borderColor: 'rgba(47,224,138,.35)', background: 'rgba(47,224,138,.08)' } : { borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg3)' }}
              >
                <Icon name={m.icon} size={22} className={reached ? 'text-green' : 'text-faint'} />
                <div className="mt-1.5 font-heading text-sm font-bold tracking-[0.06em]" style={{ color: reached ? '#6ee7b7' : 'var(--text)' }}>
                  {m.friends} friends
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] text-[#a9c3b6]">{m.reward}</div>
                <div className="mt-2 font-mono text-[9.5px] tracking-[0.12em]" style={{ color: reached ? '#2fe08a' : 'var(--faint)' }}>
                  {reached ? 'ACTIVE' : `${m.friends - data.stats.invited} TO GO`}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="mb-[18px] flex items-center gap-2.5">
          <Route size={20} className="text-green" />
          <h2 className="font-heading text-[18px] font-bold tracking-[0.05em] text-text">HOW THE PAYOUT WORKS</h2>
        </div>
        <div className="flex flex-col">
          {[...STEPS, { n: 3, icon: 'bolt' as const, title: 'You get paid', body: step3Body }].map((s, i, arr) => (
            <div key={s.n} className="flex items-stretch gap-4">
              <div className="flex w-[34px] flex-none flex-col items-center">
                <span
                  className="grid size-[34px] shrink-0 place-items-center rounded-full border font-mono text-[12.5px] font-semibold text-green"
                  style={{ background: 'rgba(47,224,138,.12)', borderColor: 'rgba(47,224,138,.32)' }}
                >
                  {s.n}
                </span>
                {i < arr.length - 1 && <span className="min-h-3 w-px flex-1" style={{ background: 'rgba(47,224,138,.15)' }} />}
              </div>
              <div className="min-w-0 flex-1 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name={s.icon} size={18} className="text-[#6ee7b7]" />
                  <span className="font-heading text-[15.5px] font-bold tracking-[0.03em] text-[#eafff3]">{s.title}</span>
                </div>
                <p className="mt-1.5 max-w-[620px] text-[13px] leading-[1.55] text-[#a9c3b6]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {data.canEnterCode && <ClaimCodeCard onClaimed={reload} />}

      <Panel>
        <PanelHeader title="YOUR REFERRALS" meta={`${data.friends.length} FRIEND${data.friends.length === 1 ? '' : 'S'}`} />
        {data.friends.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">
            Share your link — you'll earn {rate}% the first time someone you invited wins.
          </p>
        ) : (
          <TableScroll minWidth={520}>
            <TableHead template={REFERRALS_TEMPLATE} columns={[{ label: 'FRIEND' }, { label: 'JOINED' }, { label: 'STATUS' }, { label: 'EARNED', align: 'right' }]} />
            {data.friends.map((f: ReferredFriend) => {
              return (
                <TableRow key={f.id} template={REFERRALS_TEMPLATE}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={f.name} size={28} radiusRatio={0.29} />
                    <span className="font-mono text-[13px] text-[#e8f2ec]">{f.name}</span>
                  </span>
                  <span className="font-mono text-[11.5px] text-[#a9c3b6]">{formatDate(f.joinedAt)}</span>
                  <span>
                    <StatusChip
                      bg={f.status === 'earned' ? 'rgba(47,224,138,.14)' : 'rgba(240,180,41,.14)'}
                      fg={f.status === 'earned' ? '#2fe08a' : '#f0b429'}
                    >
                      {f.status === 'earned' ? 'PAID' : 'AWAITING WIN'}
                    </StatusChip>
                  </span>
                  <span className="text-right font-mono text-[12.5px] text-green">
                    {f.status === 'earned' ? `+${formatSol(f.earned)}` : '—'}
                  </span>
                </TableRow>
              );
            })}
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}

/** The design's accent panel treatment, same as the sidebar's Invite card. */
function InviteHero({ link, code, rate }: { link: string; code: string; rate: number }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  const copy = async (value: string, which: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is blocked outside a secure context — the link stays selectable.
    }
  };

  const share = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
  const pitch = 'Play on Infinit Respawn with me — provably fair games on Solana.';

  return (
    <section
      className="relative flex min-w-0 flex-col overflow-hidden rounded-[18px] border p-[clamp(18px,2.4vw,26px)]"
      style={{ borderColor: 'rgba(47,224,138,.22)', background: 'radial-gradient(600px 300px at 90% 0%, rgba(47,224,138,.16), rgba(6,9,7,0) 62%), linear-gradient(120deg, #0c1a12, #070d09)' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'linear-gradient(rgba(47,224,138,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(47,224,138,.05) 1px, transparent 1px)', backgroundSize: '44px 44px' }}
      />
      <div className="relative flex h-full flex-col">
        <span className="inline-flex w-fit items-center gap-2 rounded-[6px] border px-[11px] py-[5px]" style={{ borderColor: 'rgba(47,224,138,.3)', background: 'rgba(47,224,138,.14)' }}>
          <Icon name="bolt" size={15} className="text-green" />
          <span className="font-mono text-[10px] tracking-[0.18em] text-[#6ee7b7]">{rate}% OF FIRST WIN · FOREVER</span>
        </span>

        <div className="mt-4 font-heading text-[clamp(26px,3.4vw,38px)] leading-none font-bold text-[#f2fff8]">
          RECRUIT YOUR
          <br />
          <span className="text-green" style={{ textShadow: '0 0 30px rgba(47,224,138,.45)' }}>SQUAD</span>
        </div>
        <p className="my-3 max-w-[380px] text-[13.5px] leading-[1.5] text-[#8fa89b]">
          Every friend who joins on your link pays you {rate}% of their first winning game. Their bets and payouts stay untouched.
        </p>

        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 rounded-[11px] border p-[12px_14px]" style={{ borderColor: 'rgba(47,224,138,.16)', background: '#08110b' }}>
            <Icon name="key" size={18} className="text-muted" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[#cfe4d8]">{link}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void copy(link, 'link')}
              className="flex flex-1 basis-[150px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border-0 px-[18px] py-3 font-heading text-[13.5px] font-bold tracking-[0.06em] text-[#04160c]"
              style={{ background: 'linear-gradient(180deg, #35eb95, #16a862)', boxShadow: '0 8px 22px rgba(47,224,138,.24)' }}
            >
              <Copy size={18} />
              {copied === 'link' ? 'COPIED' : 'COPY LINK'}
            </button>
            <button
              title="Share on X"
              onClick={() => share(`https://x.com/intent/tweet?text=${encodeURIComponent(pitch)}&url=${encodeURIComponent(link)}`)}
              className="grid w-[46px] flex-none cursor-pointer place-items-center rounded-[10px] border py-3 text-[#6ee7b7]"
              style={{ borderColor: 'rgba(47,224,138,.22)', background: '#0c150f' }}
            >
              <Share2 size={19} />
            </button>
            <button
              title="Telegram"
              onClick={() => share(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(pitch)}`)}
              className="grid w-[46px] flex-none cursor-pointer place-items-center rounded-[10px] border py-3 text-[#6ee7b7]"
              style={{ borderColor: 'rgba(47,224,138,.22)', background: '#0c150f' }}
            >
              <Send size={19} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <span className="font-mono text-[10.5px] tracking-[0.14em] text-[#8fbfa6]">OR CODE</span>
            <button
              onClick={() => void copy(code, 'code')}
              className="cursor-pointer rounded-lg border border-dashed px-3.5 py-1.5 font-mono text-sm font-semibold tracking-[0.2em] text-green"
              style={{ borderColor: 'rgba(47,224,138,.34)', background: 'rgba(47,224,138,.07)' }}
            >
              {code}
            </button>
            {copied === 'code' && <span className="text-[12px] text-green">Copied.</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Shown only while the player is still eligible — no referrer yet and no
 * games played. Pre-filled from a captured link code, which covers the case
 * where someone clicked an invite but had already created an account earlier.
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
      setStatus(`You're now linked to ${res.referredBy.name}.`);
      onClaimed();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel amber>
      <PanelHeader
        title="GOT AN INVITE CODE?"
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
        <button
          disabled={busy || code.trim().length < 4}
          onClick={() => void submit()}
          className="cursor-pointer rounded-[10px] border px-5 py-3 font-heading text-sm font-bold text-text disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: 'var(--panel-border)', background: 'var(--panel-bg2)' }}
        >
          {busy ? 'Applying…' : 'Apply code'}
        </button>
      </div>
      {status && <p className="mt-3 text-sm text-green">{status}</p>}
      {err && <p className="mt-3 text-sm text-red">{err}</p>}
    </Panel>
  );
}
