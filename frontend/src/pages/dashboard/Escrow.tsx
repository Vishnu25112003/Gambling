import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Delete } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Panel, PanelHeader, TableHead, TableRow, TableScroll, StatusChip } from '../../components/dashboard/panels';
import { Icon, type IconName } from '../../components/shared/icons';
import { useAuth } from '../../hooks/useAuth';
import { walletApi } from '../../api/endpoints';
import { gameVisual } from '../../lib/gameVisuals';
import { gameLabel } from '../../lib/gameLabel';
import { formatDate, formatSol, isPositiveAmount, ledgerLabel, shortAddress } from '../../lib/format';
import { MOCK_OPEN_BETS } from '../../lib/myBetsMock';
import type { LedgerRow, WalletInfo } from '../../types';

const SUBTITLE = 'Deposit once, then play every game — stakes lock on-chain until a match settles.';

/** The big VAULT BALANCE hero: total, the available/in-play split bar, legend, treasury row. */
function VaultBalanceHero({
  total,
  available,
  locked,
  treasury,
}: {
  total: string;
  available: string;
  locked: string;
  treasury: string | null;
}) {
  const a = Number(available);
  const l = Number(locked);
  const sum = a + l;
  const availPct = sum > 0 ? (a / sum) * 100 : 100;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!treasury) return;
    try {
      await navigator.clipboard.writeText(treasury);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context — the row still shows the address.
    }
  };

  return (
    <section
      className="relative min-w-0 overflow-hidden rounded-[18px] border p-[clamp(18px,2.4vw,26px)]"
      style={{
        borderColor: 'rgba(47,224,138,.22)',
        background: 'radial-gradient(600px 300px at 90% 0%, rgba(47,224,138,.16), rgba(6,9,7,0) 62%), linear-gradient(120deg, #0c1a12, #070d09)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(47,224,138,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(47,224,138,.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <Icon name="lockbox" size={20} className="text-green" />
          <span className="font-mono text-[10px] tracking-[0.18em] text-[#6ee7b7]">VAULT BALANCE</span>
        </div>
        <div className="mt-3 flex items-end gap-2.5">
          <span className="font-heading text-[clamp(38px,5vw,58px)] leading-none font-bold text-[#f2fff8]" style={{ textShadow: '0 0 34px rgba(47,224,138,.3)' }}>
            {formatSol(total)}
          </span>
          <span className="pb-[7px] font-mono text-[14px] text-[#6ee7b7]">SOL</span>
        </div>
        <div className="mt-5 flex h-2.5 overflow-hidden rounded-md border" style={{ background: '#0b1a12', borderColor: 'rgba(47,224,138,.16)' }}>
          <div className="h-full" style={{ width: `${availPct}%`, background: 'linear-gradient(90deg, #0f7d4d, #35eb95)' }} />
          <div className="h-full" style={{ width: `${100 - availPct}%`, background: 'linear-gradient(90deg, #8a6410, #f0b429)' }} />
        </div>
        <div className="mt-3.5 flex flex-wrap gap-4.5">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-sm bg-[#35eb95]" />
            <span className="font-mono text-[11.5px] text-[#cfe4d8]">{formatSol(available)} AVAILABLE</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-sm bg-[#f0b429]" />
            <span className="font-mono text-[11.5px] text-[#cfe4d8]">{formatSol(locked)} IN PLAY</span>
          </span>
        </div>
        <div className="mt-5 flex items-center gap-2.5 rounded-[10px] border p-[10px_12px]" style={{ background: '#08110b', borderColor: 'rgba(47,224,138,.12)' }}>
          <Icon name="key" size={17} className="text-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[#a9c3b6]">
            TREASURY {treasury ? shortAddress(treasury, 6) : 'not configured'}
          </span>
          {treasury && (
            <button onClick={() => void copy()} className="shrink-0 cursor-pointer border-0 bg-transparent font-mono text-[10.5px] tracking-[0.1em] text-green">
              {copied ? 'COPIED' : 'VIEW'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** The shared visual shell for the amount editor — deposit and withdraw both render one of these. */
function AmountEditor({
  amount,
  onAmountChange,
  chips,
  ctaLabel,
  ctaIcon,
  onSubmit,
  busy,
  disabled,
  note,
  status,
  error,
}: {
  amount: string;
  onAmountChange: (v: string) => void;
  chips: { label: string; value: string }[];
  ctaLabel: string;
  ctaIcon: IconName;
  onSubmit: () => void;
  busy: boolean;
  disabled: boolean;
  note: string;
  status: string | null;
  error: string | null;
}) {
  return (
    <>
      <div className="mt-[18px] flex items-center gap-2.5 rounded-[11px] border p-3.5" style={{ borderColor: 'rgba(47,224,138,.18)', background: '#08110b' }}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          aria-label="Amount in SOL"
          className="min-w-0 flex-1 border-0 bg-transparent font-heading text-[26px] font-bold text-[#eafff3] outline-none"
        />
        <span className="font-mono text-xs text-[#8fbfa6]">SOL</span>
        <span className="flex-1" />
        <button
          onClick={() => onAmountChange('')}
          title="Clear"
          className="grid cursor-pointer place-items-center border-0 bg-transparent text-[#8fbfa6]"
        >
          <Delete size={19} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-[7px]">
        {chips.map((c) => (
          <button
            key={c.label}
            onClick={() => onAmountChange(c.value)}
            className="flex-1 basis-[70px] cursor-pointer rounded-lg border px-3 py-2.5 font-mono text-xs text-[#cfe4d8] transition hover:text-[#eafff3]"
            style={{ borderColor: 'rgba(47,224,138,.16)', background: '#0d160f' }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <button
        onClick={onSubmit}
        disabled={busy || disabled}
        className="mt-auto flex w-full items-center justify-center gap-2.5 rounded-[10px] border-0 py-3.5 font-heading text-[14.5px] font-bold tracking-[0.07em] text-[#04160c] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: 'linear-gradient(180deg, #35eb95, #16a862)', boxShadow: '0 8px 24px rgba(47,224,138,.24)' }}
      >
        <Icon name={ctaIcon} size={20} />
        {busy ? 'WORKING…' : ctaLabel}
      </button>

      <div className="mt-3 flex justify-between gap-2.5 font-mono text-[10.5px] text-[#8fbfa6]">
        <span>{note}</span>
        <span>SETTLES IN ~2s</span>
      </div>

      {status && <p className="mt-3 text-sm text-green">{status}</p>}
      {error && <p className="mt-3 text-sm text-red">{error}</p>}
    </>
  );
}

/**
 * Doc 02 deposit: the user's own wallet sends SOL straight to the treasury.
 * The backend's websocket listener spots it and credits them — the frontend
 * only builds and sends the transfer.
 */
function DepositPanel({ hidden, onDone }: { hidden: boolean; onDone: () => Promise<void> }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { socket } = useAuth();
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [amount, setAmount] = useState('0.1');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void walletApi
      .info()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  // Live credit notification from the backend's deposit listener — the shared
  // session socket owned by AuthProvider, so it keeps working even while the
  // Withdraw tab is the one showing (this panel stays mounted, just hidden).
  useEffect(() => {
    if (!socket) return;
    const handleDeposit = () => {
      setStatus('Deposit credited.');
      setBusy(false);
      void onDone();
    };
    socket.on('wallet:deposit', handleDeposit);
    return () => {
      socket.off('wallet:deposit', handleDeposit);
    };
  }, [socket, onDone]);

  const deposit = async () => {
    setError(null);
    setStatus(null);

    const sol = Number(amount);
    if (!Number.isFinite(sol) || sol <= 0) return setError('Enter a valid amount.');
    if (!publicKey || !info?.treasuryAddress) return setError('Wallet or treasury unavailable.');

    setBusy(true);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(info.treasuryAddress),
          lamports: Math.round(sol * LAMPORTS_PER_SOL),
        }),
      );

      const signature = await sendTransaction(tx, connection);
      setStatus('Sent — waiting for confirmation…');

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      setStatus('Confirmed on-chain. Crediting your balance…');

      // The websocket listener normally beats us here, but claiming the
      // signature explicitly makes the credit robust to a dropped message.
      // It's idempotent server-side, so a double call credits nothing twice.
      await walletApi.claimDeposit(signature).catch(() => undefined);
      await onDone();
      setStatus('Deposit credited.');
    } catch (err) {
      setError((err as Error).message || 'Deposit failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div hidden={hidden} className="flex flex-1 flex-col">
      <div className="font-heading text-[17px] font-bold tracking-[0.05em] text-[#eafff3]">Deposit</div>
      <p className="mt-[7px] text-[12.5px] leading-[1.5] text-[#a9c3b6]">
        {info?.treasuryAddress ? (
          <>
            Sends to treasury{' '}
            <span className="font-mono text-[#cfe4d8]">{shortAddress(info.treasuryAddress, 6)}</span>.
          </>
        ) : (
          <span className="text-red">Treasury is not configured on the server.</span>
        )}
      </p>
      <AmountEditor
        amount={amount}
        onAmountChange={setAmount}
        chips={['0.1', '0.5', '1', '2'].map((v) => ({ label: `${v} SOL`, value: v }))}
        ctaLabel="DEPOSIT SOL"
        ctaIcon="bolt"
        onSubmit={() => void deposit()}
        busy={busy}
        disabled={!info?.treasuryAddress}
        note="NETWORK FEE ≈ 0.000005 SOL"
        status={status}
        error={error}
      />
    </div>
  );
}

/** Doc 02 withdraw: treasury -> the user's own wallet, network fee on them. */
function WithdrawPanel({ hidden, onDone }: { hidden: boolean; onDone: () => Promise<void> }) {
  const { balance } = useAuth();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const max = balance?.availableBalance ?? '0';

  const withdraw = async () => {
    setError(null);
    setStatus(null);

    if (!isPositiveAmount(amount)) return setError('Enter a valid amount.');

    setBusy(true);
    try {
      // Send the raw string — never round the user's input through a number.
      const res = await walletApi.withdraw(amount.trim());
      setStatus(`Sent ${formatSol(res.sent)} SOL (network fee ${formatSol(res.networkFee, 9)} SOL).`);
      setAmount('');
      await onDone();
    } catch (err) {
      setError((err as Error).message || 'Withdrawal failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div hidden={hidden} className="flex flex-1 flex-col">
      <div className="font-heading text-[17px] font-bold tracking-[0.05em] text-[#eafff3]">Withdraw</div>
      <p className="mt-[7px] text-[12.5px] leading-[1.5] text-[#a9c3b6]">
        Goes to the wallet you signed in with. The Solana network fee comes out of the amount you receive.
      </p>
      <AmountEditor
        amount={amount}
        onAmountChange={setAmount}
        chips={[
          { label: '0.1 SOL', value: '0.1' },
          { label: '0.5 SOL', value: '0.5' },
          { label: '1 SOL', value: '1' },
          { label: `MAX`, value: max },
        ]}
        ctaLabel="WITHDRAW SOL"
        ctaIcon="lockbox"
        onSubmit={() => void withdraw()}
        busy={busy}
        disabled={!isPositiveAmount(max)}
        note="NETWORK FEE ON WITHDRAWAL"
        status={status}
        error={error}
      />
    </div>
  );
}

const ACTIVITY_ICON: Record<LedgerRow['type'], IconName> = {
  deposit: 'wallet',
  withdrawal: 'lockbox',
  lock: 'ticket',
  settlement: 'chart',
  refund: 'shield',
  forfeit: 'bomb',
  fee: 'percent',
  referral: 'gift',
};

const STATUS_CHIP: Record<LedgerRow['status'], { bg: string; fg: string }> = {
  confirmed: { bg: 'rgba(47,224,138,.14)', fg: '#2fe08a' },
  pending: { bg: 'rgba(240,180,41,.14)', fg: '#f0b429' },
  failed: { bg: 'rgba(239,83,80,.14)', fg: '#ef5350' },
};

/** Real recent ledger activity — the mockup's "Vault Activity" table, last 6 rows. */
function VaultActivity() {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const template = '1.2fr 1.3fr 1fr .8fr';

  useEffect(() => {
    void walletApi
      .history(1, 6)
      .then((res) => setRows(res.entries))
      .catch(() => setRows([]));
  }, []);

  return (
    <Panel>
      <PanelHeader title="VAULT ACTIVITY" meta="LAST 6" />
      {!rows ? (
        <div className="flex justify-center py-10">
          <span className="inline-block size-6 animate-spin rounded-full border-2 border-line border-t-green" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">Nothing here yet.</p>
      ) : (
        <TableScroll minWidth={560}>
          <TableHead template={template} columns={[{ label: 'TYPE' }, { label: 'WHEN' }, { label: 'STATUS' }, { label: 'AMOUNT', align: 'right' }]} />
          {rows.map((v) => (
            <TableRow key={v.id} template={template}>
              <span className="flex items-center gap-2.5">
                <Icon name={ACTIVITY_ICON[v.type]} size={18} className="text-green" />
                <span className="font-heading text-[13.5px] font-semibold text-[#e8f2ec]">{ledgerLabel(v.type)}</span>
              </span>
              <span className="font-mono text-[11.5px] text-[#a9c3b6]">{formatDate(v.timestamp)}</span>
              <span>
                <StatusChip bg={STATUS_CHIP[v.status].bg} fg={STATUS_CHIP[v.status].fg}>
                  {v.status}
                </StatusChip>
              </span>
              <span
                className="text-right font-mono text-[12.5px]"
                style={{ color: Number(v.amount) >= 0 ? 'var(--green)' : 'var(--muted)' }}
              >
                {formatSol(v.amount)}
              </span>
            </TableRow>
          ))}
        </TableScroll>
      )}
    </Panel>
  );
}

/**
 * Doc 06's gated wallet section, in the design's "Escrow Vault" framing: the
 * vault-balance hero, a tabbed deposit/withdraw card, locked-in-play, and
 * recent vault activity.
 */
export function Escrow() {
  const { isAuthenticated, balance, refreshBalance } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [info, setInfo] = useState<WalletInfo | null>(null);

  useEffect(() => {
    void walletApi.info().then(setInfo).catch(() => setInfo(null));
  }, []);

  if (!isAuthenticated) {
    return (
      <>
        <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">ESCROW VAULT</h1>
        <p className="mb-5 text-sm text-muted">{SUBTITLE}</p>
        <ConnectWalletPlaceholder what="your balance, deposits and withdrawals" icon="lockbox" />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">ESCROW VAULT</h1>
        <p className="text-sm text-muted">{SUBTITLE}</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <VaultBalanceHero
          total={balance?.total ?? '0'}
          available={balance?.availableBalance ?? '0'}
          locked={balance?.lockedBalance ?? '0'}
          treasury={info?.treasuryAddress ?? null}
        />

        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-1.5 rounded-xl border p-[5px]" style={{ borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg)' }}>
            {(['deposit', 'withdraw'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[9px] border-0 py-[11px] font-heading text-[13.5px] font-bold tracking-[0.07em]"
                style={
                  tab === t
                    ? { background: 'linear-gradient(180deg, #35eb95, #16a862)', color: '#04160c' }
                    : { background: 'transparent', color: 'var(--muted)' }
                }
              >
                <Icon name={t === 'deposit' ? 'bolt' : 'lockbox'} size={18} />
                {t === 'deposit' ? 'DEPOSIT' : 'WITHDRAW'}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col rounded-[18px] border p-5" style={{ borderColor: 'var(--panel-border-soft)', background: 'var(--panel-bg)' }}>
            <DepositPanel hidden={tab !== 'deposit'} onDone={refreshBalance} />
            <WithdrawPanel hidden={tab !== 'withdraw'} onDone={refreshBalance} />
          </div>
        </section>
      </div>

      <Panel amber>
        <PanelHeader title="LOCKED IN PLAY" meta={`${MOCK_OPEN_BETS.length} OPEN`} />
        {MOCK_OPEN_BETS.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">Nothing locked right now.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {MOCK_OPEN_BETS.map((b) => {
              const visual = gameVisual({ name: gameLabel(b.gameType) });
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 rounded-[11px] border p-[12px_14px]"
                  style={{ borderColor: 'var(--amber-border)', background: 'var(--panel-bg3)' }}
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg font-heading text-[13px] font-bold text-[#04160c]"
                    style={{ background: visual.tone }}
                  >
                    {gameLabel(b.gameType).charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1 basis-[160px]">
                    <div className="font-heading text-[14px] font-semibold text-[#e8f2ec]">{gameLabel(b.gameType)}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-[#a9c3b6]">{b.meta}</div>
                  </div>
                  <StatusChip bg="rgba(240,180,41,.12)" fg="#f0b429">
                    {b.state === 'your-turn' ? 'YOUR TURN' : 'WAITING'}
                  </StatusChip>
                  <span className="font-mono text-[12.5px] text-[#f7d774]">{formatSol(b.stake)} SOL</span>
                  <button
                    onClick={() => navigate('/dashboard/bets')}
                    className="cursor-pointer rounded-lg border px-3.5 py-2 font-heading text-[12px] font-bold tracking-[0.06em] text-green"
                    style={{ borderColor: 'rgba(47,224,138,.24)', background: 'rgba(47,224,138,.07)' }}
                  >
                    VIEW
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <VaultActivity />
    </div>
  );
}
