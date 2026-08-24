import { prisma } from '../config/db.js';
import { getConnection, commitment } from '../config/solana.js';
import { getTreasuryPublicKey } from './treasury.js';
import { createLogger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { fromLamports, toAmountString } from '../lib/money.js';
const log = createLogger('deposits');
/**
 * Doc 02 — deposit detection.
 *
 * A websocket log subscription on the treasury address, NOT polling. The RPC
 * pushes us every transaction that mentions the treasury the moment it reaches
 * `confirmed`, which is the commitment doc 02 locks in (faster than
 * `finalized`, with a tiny accepted reorg risk on devnet).
 */
let subscriptionId = null;
const handlers = new Set();
export function onDepositCredited(handler) {
    handlers.add(handler);
    return () => handlers.delete(handler);
}
export async function startDepositListener() {
    const treasury = getTreasuryPublicKey();
    if (!treasury) {
        log.warn('deposit listener not started — no treasury configured');
        return false;
    }
    if (!env.ENABLE_DEPOSIT_LISTENER) {
        log.warn('deposit listener disabled by ENABLE_DEPOSIT_LISTENER=false');
        return false;
    }
    if (subscriptionId !== null)
        return true;
    const connection = getConnection();
    subscriptionId = connection.onLogs(treasury, (logs) => {
        void handleLogs(logs, treasury).catch((err) => log.error('failed handling deposit logs', err));
    }, commitment);
    log.info(`watching treasury ${treasury.toBase58()} for deposits (commitment=${commitment})`);
    return true;
}
export async function stopDepositListener() {
    if (subscriptionId === null)
        return;
    try {
        await getConnection().removeOnLogsListener(subscriptionId);
    }
    catch {
        // Connection may already be torn down during shutdown.
    }
    subscriptionId = null;
}
async function handleLogs(logs, treasury) {
    if (logs.err)
        return; // failed transaction — nothing moved
    await processSignature(logs.signature, treasury);
}
/**
 * Pull the transaction apart, find what actually landed in the treasury, and
 * credit the sender.
 *
 * Exported because the same logic backs the manual "I sent SOL but it didn't
 * show up" recovery endpoint — a dropped websocket message shouldn't mean lost
 * funds.
 */
export async function processSignature(signature, treasuryKey) {
    const treasury = treasuryKey ?? getTreasuryPublicKey();
    if (!treasury)
        return { credited: false, reason: 'no treasury configured' };
    // Cheap pre-check: if we already have a ledger row for this signature, stop
    // before spending an RPC call.
    const seen = await prisma.ledgerEntry.findUnique({
        where: { txSignature: signature },
        select: { id: true },
    });
    if (seen)
        return { credited: false, reason: 'already processed' };
    // getParsedTransaction only accepts a Finality ('confirmed' | 'finalized');
    // 'processed' is not a valid history commitment, so it maps to 'confirmed'.
    const finality = commitment === 'finalized' ? 'finalized' : 'confirmed';
    const tx = await getConnection().getParsedTransaction(signature, {
        commitment: finality,
        maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err)
        return { credited: false, reason: 'transaction not found or failed' };
    const receivedLamports = netLamportsReceived(tx, treasury);
    if (receivedLamports <= 0n) {
        // A withdrawal we sent, or an unrelated transaction that merely mentions
        // the treasury. Not a deposit.
        return { credited: false, reason: 'no inbound transfer to treasury' };
    }
    const received = fromLamports(receivedLamports);
    const sender = findSender(tx, treasury);
    if (!sender) {
        log.warn('inbound funds with no identifiable sender', { signature });
        await flagForReview(signature, received, null, 'sender address could not be determined');
        return { credited: false, reason: 'sender not identifiable' };
    }
    const user = await prisma.user.findUnique({ where: { walletAddress: sender } });
    if (!user) {
        // Doc 02 edge case, explicitly: do NOT silently drop these funds.
        log.warn('deposit from an unknown wallet — flagged for manual review', {
            signature,
            sender,
        });
        await flagForReview(signature, received, sender, 'sender wallet does not match any user');
        return { credited: false, reason: 'unknown sender wallet' };
    }
    /**
     * The unique constraint on txSignature is the real double-credit guard, and
     * the credit runs in the same transaction as the ledger insert. If this
     * signature was already processed by a concurrent handler, the insert throws
     * and the whole transaction rolls back — the balance is never touched.
     */
    let updatedBalance;
    try {
        updatedBalance = await prisma.$transaction(async (tx2) => {
            await tx2.ledgerEntry.create({
                data: {
                    txSignature: signature,
                    userId: user.id,
                    type: 'deposit',
                    status: 'confirmed',
                    amount: received,
                    senderAddress: sender,
                    note: 'Deposit credited',
                },
            });
            const credited = await tx2.user.update({
                where: { id: user.id },
                data: { availableBalance: { increment: received } },
            });
            await tx2.ledgerEntry.update({
                where: { txSignature: signature },
                data: {
                    balanceAfterAvailable: credited.availableBalance,
                    balanceAfterLocked: credited.lockedBalance,
                },
            });
            return toAmountString(credited.availableBalance);
        });
    }
    catch (err) {
        if (typeof err === 'object' && err !== null && err.code === 'P2002') {
            return { credited: false, reason: 'already processed' };
        }
        throw err;
    }
    log.info('deposit credited', { signature, sender, amount: toAmountString(received) });
    const event = {
        userId: user.id,
        walletAddress: sender,
        amount: toAmountString(received),
        txSignature: signature,
        availableBalance: updatedBalance,
    };
    handlers.forEach((h) => {
        try {
            h(event);
        }
        catch (err) {
            log.error('deposit handler threw', err);
        }
    });
    return { credited: true };
}
/**
 * How many lamports the treasury actually gained.
 *
 * Derived from the pre/post balance snapshots rather than by parsing transfer
 * instructions — that way it stays correct for multi-instruction transactions
 * and for anything that moves SOL in a way we didn't anticipate.
 */
function netLamportsReceived(tx, treasury) {
    const keys = tx.transaction.message.accountKeys;
    const index = keys.findIndex((k) => k.pubkey.equals(treasury));
    if (index < 0 || !tx.meta)
        return 0n;
    const pre = BigInt(tx.meta.preBalances[index] ?? 0);
    const post = BigInt(tx.meta.postBalances[index] ?? 0);
    return post - pre;
}
/** The account that lost lamports and signed the transaction — the depositor. */
function findSender(tx, treasury) {
    const keys = tx.transaction.message.accountKeys;
    if (!tx.meta)
        return null;
    let best = null;
    keys.forEach((key, i) => {
        if (key.pubkey.equals(treasury))
            return;
        const pre = BigInt(tx.meta.preBalances[i] ?? 0);
        const post = BigInt(tx.meta.postBalances[i] ?? 0);
        const spent = pre - post;
        if (spent > 0n && key.signer && (!best || spent > best.spent)) {
            best = { address: key.pubkey.toBase58(), spent };
        }
    });
    if (best)
        return best.address;
    // Fall back to the fee payer, which is always the first signer.
    const feePayer = keys.find((k) => k.signer);
    return feePayer ? feePayer.pubkey.toBase58() : null;
}
/**
 * Doc 02: unmatched funds must never be silently dropped. This writes a
 * `failed` ledger row with no user link that an operator can search for.
 */
async function flagForReview(signature, amount, sender, reason) {
    try {
        await prisma.ledgerEntry.create({
            data: {
                txSignature: signature,
                userId: null,
                type: 'deposit',
                status: 'failed',
                amount,
                senderAddress: sender,
                note: `NEEDS MANUAL REVIEW: ${reason}`,
                meta: { requiresManualReview: true },
            },
        });
    }
    catch {
        // A duplicate here just means it was already flagged.
    }
}
//# sourceMappingURL=depositListener.js.map