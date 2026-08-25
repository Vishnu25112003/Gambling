import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { ConnectWalletPlaceholder } from '../../components/dashboard/ConnectWalletPlaceholder';
import { Button, Card, Input, PageTitle, Spinner } from '../../components/shared/ui';
import { useAuth } from '../../hooks/useAuth';
import { walletApi } from '../../api/endpoints';
import { formatSol, isPositiveAmount, shortAddress } from '../../lib/format';
import type { WalletInfo } from '../../types';

/** One of the three figures at the top of the design's Escrow tab. */
function BalanceCard({
  label,
  amount,
  color,
  note,
}: {
  label: string;
  amount: string;
  color?: string;
  note?: string;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-card p-5">
      <div className="mb-2 text-[11.5px] font-semibold text-muted">{label}</div>
      <div className="text-[22px] font-extrabold" style={color ? { color } : undefined}>
        {amount} <span className="text-[13px] font-normal text-muted">SOL</span>
      </div>
      {note && <div className="mt-1.5 text-xs text-faint">{note}</div>}
    </div>
  );
}

/**
 * Doc 02 deposit: the user's own wallet sends SOL straight to the treasury.
 * The backend's websocket listener spots it and credits them — the frontend
 * only builds and sends the transfer.
 */
function DepositCard({ onDone }: { onDone: () => Promise<void> }) {
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

  // Live credit notification from the backend's deposit listener — the
  // shared session socket owned by AuthProvider, not a page-local one, so it
  // keeps working if this card unmounts mid-deposit.
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
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

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
    <Card radius={16} className="p-[22px]">
      <div className="mb-3.5 text-[15px] font-bold">Deposit</div>

      {info?.treasuryAddress ? (
        <p className="mb-3.5 text-xs text-faint">
          Sends to treasury{' '}
          <span className="font-mono text-muted">{shortAddress(info.treasuryAddress, 6)}</span>
        </p>
      ) : (
        <p className="mb-3.5 text-xs text-red">Treasury is not configured on the server.</p>
      )}

      <div className="flex gap-2.5">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-w-0 flex-1 font-mono"
          placeholder="0.1"
          aria-label="Deposit amount in SOL"
        />
        <Button
          variant="solid"
          onClick={() => void deposit()}
          disabled={busy || !info?.treasuryAddress}
        >
          {busy ? <Spinner /> : 'Deposit'}
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        {['0.1', '0.5', '1'].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className="cursor-pointer rounded-lg border border-line bg-line2 px-3 py-1 text-xs text-muted hover:text-text"
          >
            {v} SOL
          </button>
        ))}
      </div>

      {status && <p className="mt-3 text-sm text-green">{status}</p>}
      {error && <p className="mt-3 text-sm text-red">{error}</p>}
    </Card>
  );
}

/** Doc 02 withdraw: treasury -> the user's own wallet, network fee on them. */
function WithdrawCard({ onDone }: { onDone: () => Promise<void> }) {
  const { balance } = useAuth();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withdraw = async () => {
    setError(null);
    setStatus(null);

    if (!isPositiveAmount(amount)) return setError('Enter a valid amount.');

    setBusy(true);
    try {
      // Send the raw string — never round the user's input through a number.
      const res = await walletApi.withdraw(amount.trim());
      setStatus(
        `Sent ${formatSol(res.sent)} SOL (network fee ${formatSol(res.networkFee, 9)} SOL).`,
      );
      setAmount('');
      await onDone();
    } catch (err) {
      setError((err as Error).message || 'Withdrawal failed.');
    } finally {
      setBusy(false);
    }
  };

  const max = balance?.availableBalance ?? '0';

  return (
    <Card radius={16} className="p-[22px]">
      <div className="mb-3.5 text-[15px] font-bold">Withdraw</div>

      <p className="mb-3.5 text-xs text-faint">
        Goes to the wallet you signed in with. The Solana network fee comes out of the amount you
        receive.
      </p>

      <div className="flex gap-2.5">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-w-0 flex-1 font-mono"
          placeholder="0.00"
          aria-label="Withdrawal amount in SOL"
        />
        <Button
          variant="secondary"
          onClick={() => void withdraw()}
          disabled={busy || !isPositiveAmount(max)}
        >
          {busy ? <Spinner /> : 'Withdraw'}
        </Button>
      </div>

      <button
        onClick={() => setAmount(max)}
        className="mt-3 cursor-pointer rounded-lg border border-line bg-line2 px-3 py-1 text-xs text-muted hover:text-text"
      >
        Max ({formatSol(max)} SOL)
      </button>

      {status && <p className="mt-3 text-sm text-green">{status}</p>}
      {error && <p className="mt-3 text-sm text-red">{error}</p>}
    </Card>
  );
}

/**
 * Doc 06's gated wallet section, in the design's "Escrow" framing: the three
 * balances, then deposit and withdraw side by side.
 */
export function Escrow() {
  const { isAuthenticated, balance, refreshBalance } = useAuth();

  if (!isAuthenticated) {
    return (
      <>
        <PageTitle
          title="Escrow"
          subtitle="Deposit once, then play across every game — stakes lock in escrow until a match settles."
        />
        <ConnectWalletPlaceholder
          what="your balance, deposits and withdrawals"
          icon="lockbox"
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Escrow"
        subtitle="Deposit once, then play across every game — stakes lock in escrow until a match settles."
      />

      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <BalanceCard
          label="AVAILABLE"
          amount={formatSol(balance?.availableBalance ?? '0')}
          color="var(--green)"
          note="Free to bet or withdraw."
        />
        <BalanceCard
          label="IN PLAY"
          amount={formatSol(balance?.lockedBalance ?? '0')}
          color="var(--gold)"
          note="Locked in escrow until a match ends."
        />
        <BalanceCard label="TOTAL" amount={formatSol(balance?.total ?? '0')} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
        <DepositCard onDone={refreshBalance} />
        <WithdrawCard onDone={refreshBalance} />
      </div>
    </>
  );
}
