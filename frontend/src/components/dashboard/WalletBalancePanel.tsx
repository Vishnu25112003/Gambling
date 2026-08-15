import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import { walletApi } from '../../api/endpoints';
import { formatSol, isPositiveAmount, shortAddress } from '../../lib/format';
import { Badge, Button, Card, SectionHeading, Spinner } from '../shared/ui';
import { ConnectWalletPlaceholder } from './ConnectWalletPlaceholder';
import type { WalletInfo } from '../../types';

/**
 * Doc 06: a GATED section — shows ConnectWalletPlaceholder until the user has
 * connected, then the real balance plus the deposit/withdraw controls.
 */
export function WalletBalancePanel() {
  const { isAuthenticated, balance, refreshBalance } = useAuth();

  if (!isAuthenticated) {
    return (
      <section>
        <SectionHeading title="Wallet" />
        <ConnectWalletPlaceholder what="your balance, deposits and withdrawals" icon="💰" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <SectionHeading title="Wallet" subtitle="Deposit once, then play across every game." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-400">Available</p>
          <p className="mt-2 font-mono text-2xl font-bold text-neon-400">
            {balance ? formatSol(balance.availableBalance) : '—'}
            <span className="ml-1 text-sm text-ink-400">SOL</span>
          </p>
          <p className="mt-1 text-xs text-ink-400">Free to bet or withdraw.</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-400">In play</p>
          <p className="mt-2 font-mono text-2xl font-bold text-gold-400">
            {balance ? formatSol(balance.lockedBalance) : '—'}
            <span className="ml-1 text-sm text-ink-400">SOL</span>
          </p>
          <p className="mt-1 text-xs text-ink-400">Locked in escrow until a match ends.</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total</p>
          <p className="mt-2 font-mono text-2xl font-bold">
            {balance ? formatSol(balance.total) : '—'}
            <span className="ml-1 text-sm text-ink-400">SOL</span>
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => void refreshBalance()}>
            Refresh
          </Button>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DepositCard onDone={refreshBalance} />
        <WithdrawCard onDone={refreshBalance} />
      </div>
    </section>
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
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [amount, setAmount] = useState('0.1');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void walletApi.info().then(setInfo).catch(() => setInfo(null));
  }, []);

  // Live credit notification from the backend's deposit listener.
  const handleDeposit = useCallback(() => {
    setStatus('Deposit credited.');
    setBusy(false);
    void onDone();
  }, [onDone]);
  useSocket(handleDeposit);

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
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Deposit</h3>
        <Badge tone="success">On-chain</Badge>
      </div>

      {info?.treasuryAddress ? (
        <p className="mb-4 text-xs text-ink-400">
          Sends to treasury{' '}
          <span className="font-mono text-ink-300">{shortAddress(info.treasuryAddress, 6)}</span>
        </p>
      ) : (
        <p className="mb-4 text-xs text-danger-400">Treasury is not configured on the server.</p>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 font-mono
            focus:border-neon-500 focus:outline-none"
          placeholder="0.1"
        />
        <Button onClick={() => void deposit()} disabled={busy || !info?.treasuryAddress}>
          {busy ? <Spinner /> : 'Deposit'}
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        {['0.1', '0.5', '1'].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className="rounded-lg bg-ink-800 px-3 py-1 text-xs text-ink-300 hover:bg-ink-700"
          >
            {v} SOL
          </button>
        ))}
      </div>

      {status && <p className="mt-3 text-sm text-neon-400">{status}</p>}
      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
    </Card>
  );
}

/** Doc 02 withdraw: treasury -> the user's own wallet, network fee absorbed by them. */
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
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Withdraw</h3>
        <Badge tone="warn">Network fee applies</Badge>
      </div>

      <p className="mb-4 text-xs text-ink-400">
        Goes to the wallet you signed in with. The Solana network fee comes out of the amount you
        receive.
      </p>

      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 font-mono
            focus:border-neon-500 focus:outline-none"
          placeholder="0.00"
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
        className="mt-3 rounded-lg bg-ink-800 px-3 py-1 text-xs text-ink-300 hover:bg-ink-700"
      >
        Max ({formatSol(max)} SOL)
      </button>

      {status && <p className="mt-3 text-sm text-neon-400">{status}</p>}
      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
    </Card>
  );
}
