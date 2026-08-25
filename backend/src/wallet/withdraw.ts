import {
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { prisma } from '../config/db.js';
import { getConnection, commitment, isValidPublicKey } from '../config/solana.js';
import { requireTreasury } from './treasury.js';
import { badRequest, insufficientFunds, notFound } from '../lib/errors.js';
import {
  Decimal,
  fromLamports,
  isValidAmount,
  toAmountString,
  toDecimal,
  toLamports,
  type MoneyInput,
} from '../lib/money.js';
import { env } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { emitLedgerEntryCreated } from '../lib/ledgerEvents.js';

const log = createLogger('withdraw');

/** Fallback when the RPC won't quote a fee: base cost of one signature. */
const FALLBACK_FEE_LAMPORTS = 5_000n;

/**
 * Doc 02 — per-user withdrawal serialization.
 *
 * "Prevents a user from submitting two withdrawal requests at the same instant
 *  and draining more than their real balance."
 *
 * Two layers, because either alone is insufficient:
 *   1. This in-process queue, so a user's requests run strictly one at a time.
 *   2. The conditional debit in `performWithdrawal` below, which is the actual
 *      correctness guarantee and holds even across processes — and now sits
 *      behind a database CHECK constraint as a third backstop.
 *
 * Single-process only, like the forfeit timers. A multi-process deployment
 * needs a distributed lock — but layers 2 and 3 still prevent overdraw there,
 * so the worst case is a rejected request, not lost money.
 */
const queues = new Map<string, Promise<unknown>>();

function serialize<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const prior = queues.get(userId) ?? Promise.resolve();

  // Run after whatever is ahead of us, whether that succeeded or failed —
  // one user's failed withdrawal must not stall their next one.
  const run = prior.then(task, task);

  // The queue tail never rejects, so a failure doesn't poison the chain or
  // surface as an unhandled rejection.
  const tail = run.catch(() => undefined);
  queues.set(userId, tail);

  void tail.then(() => {
    // Only the last task in the chain clears the entry.
    if (queues.get(userId) === tail) queues.delete(userId);
  });

  return run;
}

export interface WithdrawResult {
  txSignature: string;
  /** SOL debited from the user's balance. */
  requested: string;
  /** Network fee, absorbed by the user per doc 02. */
  networkFee: string;
  /** SOL that actually landed in their wallet (requested - networkFee). */
  sent: string;
  availableBalance: string;
}

export async function requestWithdrawal(
  userId: string,
  amount: MoneyInput,
): Promise<WithdrawResult> {
  return serialize(userId, () => performWithdrawal(userId, amount));
}

async function performWithdrawal(userId: string, amount: MoneyInput): Promise<WithdrawResult> {
  if (!isValidAmount(amount)) {
    throw badRequest('Withdrawal amount must be a positive SOL value with at most 9 decimals.');
  }
  const requested = toDecimal(amount);

  if (requested.lessThan(env.MIN_WITHDRAWAL_SOL)) {
    throw badRequest(`Minimum withdrawal is ${env.MIN_WITHDRAWAL_SOL} SOL.`);
  }

  const treasury = requireTreasury();
  const connection = getConnection();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found.');
  if (!isValidPublicKey(user.walletAddress)) {
    throw badRequest('Your account has an invalid wallet address on file.');
  }

  const destination = new PublicKey(user.walletAddress);

  // Quote the network fee first — the user absorbs it (doc 02), so it comes out
  // of the amount they receive, and a withdrawal smaller than the fee is
  // pointless.
  const feeLamports = await estimateFee(connection, treasury.publicKey, destination);
  const networkFee = fromLamports(feeLamports);
  const sendAmount = requested.minus(networkFee);
  if (sendAmount.lessThanOrEqualTo(0)) {
    throw badRequest(
      `Withdrawal is too small to cover the ${toAmountString(networkFee)} SOL network fee.`,
    );
  }

  /**
   * RESERVE BEFORE SENDING.
   *
   * Doc 02 says "on success, debit the balance". Doing that literally is
   * unsafe: between broadcasting the transfer and the debit landing, the same
   * balance is still spendable — a user could place a bet with money already
   * flying to their wallet. So we debit up front and credit back if the
   * transfer fails. The end state matches the doc exactly (failure never costs
   * the user anything) while closing the window.
   */
  const reservation = await prisma.$transaction(async (tx) => {
    const debited = await tx.$executeRaw`
      UPDATE users
         SET "availableBalance" = "availableBalance" - ${requested.toFixed(9)}::numeric,
             "updatedAt" = NOW()
       WHERE id = ${userId}::uuid
         AND "availableBalance" >= ${requested.toFixed(9)}::numeric
    `;

    if (debited === 0) {
      throw insufficientFunds('You do not have enough available balance for that withdrawal.');
    }

    const updated = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    const entry = await tx.ledgerEntry.create({
      data: {
        userId,
        type: 'withdrawal',
        status: 'pending',
        amount: requested.negated(),
        destinationAddress: user.walletAddress,
        balanceAfterAvailable: updated.availableBalance,
        balanceAfterLocked: updated.lockedBalance,
        note: 'Withdrawal reserved, broadcasting',
        meta: {
          networkFee: toAmountString(networkFee),
          sendAmount: toAmountString(sendAmount),
        },
      },
      select: { id: true },
    });

    return { entryId: entry.id, availableBalance: toAmountString(updated.availableBalance) };
  });

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: destination,
        lamports: toLamports(sendAmount),
      }),
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [treasury], {
      commitment,
      maxRetries: 3,
    });

    const confirmedEntry = await prisma.ledgerEntry.update({
      where: { id: reservation.entryId },
      data: { txSignature: signature, status: 'confirmed', note: 'Withdrawal sent' },
    });
    emitLedgerEntryCreated(confirmedEntry);

    log.info('withdrawal confirmed', {
      userId,
      signature,
      requested: toAmountString(requested),
      sent: toAmountString(sendAmount),
    });

    return {
      txSignature: signature,
      requested: toAmountString(requested),
      networkFee: toAmountString(networkFee),
      sent: toAmountString(sendAmount),
      availableBalance: reservation.availableBalance,
    };
  } catch (err) {
    // The transfer never confirmed — give the money back. Doc 02: "On failure,
    // do NOT debit balance."
    const failedEntry = await prisma.$transaction(async (tx) => {
      const restored = await tx.user.update({
        where: { id: userId },
        data: { availableBalance: { increment: requested } },
      });
      return tx.ledgerEntry.update({
        where: { id: reservation.entryId },
        data: {
          status: 'failed',
          note: `Withdrawal failed and was reversed: ${(err as Error).message}`,
          balanceAfterAvailable: restored.availableBalance,
          balanceAfterLocked: restored.lockedBalance,
        },
      });
    });
    emitLedgerEntryCreated(failedEntry);

    log.error('withdrawal failed and was reversed', { userId, error: (err as Error).message });
    throw badRequest(
      'Withdrawal could not be completed on-chain. Your balance has not been changed.',
    );
  }
}

async function estimateFee(
  connection: ReturnType<typeof getConnection>,
  from: PublicKey,
  to: PublicKey,
): Promise<bigint> {
  try {
    const { blockhash } = await connection.getLatestBlockhash(commitment);
    const tx = new Transaction({ feePayer: from, recentBlockhash: blockhash }).add(
      SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: 1 }),
    );
    const fee = await connection.getFeeForMessage(tx.compileMessage(), commitment);
    return fee.value === null ? FALLBACK_FEE_LAMPORTS : BigInt(fee.value);
  } catch {
    return FALLBACK_FEE_LAMPORTS;
  }
}

/** Exposed for the route layer's Decimal handling. */
export { Decimal };
