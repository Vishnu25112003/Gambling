import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/authMiddleware.js';
import { asyncHandler, badRequest, serviceUnavailable } from '../lib/errors.js';
import { prisma } from '../config/db.js';
import { getTreasuryAddress, isTreasuryConfigured, getTreasuryBalance } from './treasury.js';
import { requestWithdrawal } from './withdraw.js';
import { processSignature } from './depositListener.js';
import { fromLamports, toAmountString, toDecimal } from '../lib/money.js';
import { explorerTxUrl } from '../config/solana.js';
import { toLedgerRow } from '../lib/ledgerRow.js';
import { env } from '../config/env.js';
export const walletRouter = Router();
/**
 * GET /api/wallet/info
 * Public — the frontend needs the treasury address to build a deposit transfer.
 */
walletRouter.get('/info', asyncHandler(async (_req, res) => {
    res.json({
        treasuryAddress: getTreasuryAddress(),
        configured: isTreasuryConfigured(),
        cluster: env.SOLANA_CLUSTER,
        minWithdrawalSol: env.MIN_WITHDRAWAL_SOL,
    });
}));
/** GET /api/wallet/balance — the signed-in user's balances, as exact strings. */
walletRouter.get('/balance', requireAuth, asyncHandler(async (req, res) => {
    const user = req.user;
    const available = toDecimal(user.availableBalance);
    const locked = toDecimal(user.lockedBalance);
    res.json({
        availableBalance: toAmountString(available),
        lockedBalance: toAmountString(locked),
        total: toAmountString(available.plus(locked)),
    });
}));
const withdrawBody = z.object({
    // A decimal string is preferred; a JSON number is accepted for convenience
    // and immediately routed through the exact-decimal parser.
    amount: z.union([z.string(), z.number()]),
});
/**
 * POST /api/wallet/withdraw
 * Treasury -> the user's own wallet address. The destination is never taken
 * from the request body: it is always the address they proved ownership of at
 * sign-in, so a compromised session cannot redirect funds elsewhere.
 */
walletRouter.post('/withdraw', requireAuth, asyncHandler(async (req, res) => {
    const parsed = withdrawBody.safeParse(req.body);
    if (!parsed.success)
        throw badRequest('An amount is required.');
    const result = await requestWithdrawal(req.user.id, parsed.data.amount);
    res.json({ ...result, explorerUrl: explorerTxUrl(result.txSignature) });
}));
const claimBody = z.object({ txSignature: z.string().min(64).max(120) });
/**
 * POST /api/wallet/deposits/claim
 * Manual recovery: if the websocket dropped a message, the user can hand us
 * the signature and we re-run the exact same crediting path. Idempotent — the
 * unique constraint on txSignature means a replay credits nothing.
 */
walletRouter.post('/deposits/claim', requireAuth, asyncHandler(async (req, res) => {
    const parsed = claimBody.safeParse(req.body);
    if (!parsed.success)
        throw badRequest('A valid txSignature is required.');
    if (!isTreasuryConfigured())
        throw serviceUnavailable('Treasury is not configured.');
    const result = await processSignature(parsed.data.txSignature);
    res.json(result);
}));
/** GET /api/wallet/history — paginated ledger for the signed-in user. */
walletRouter.get('/history', requireAuth, asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const where = {
        userId: req.user.id,
        ...(type ? { type: type } : {}),
    };
    const [entries, total] = await Promise.all([
        prisma.ledgerEntry.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.ledgerEntry.count({ where }),
    ]);
    res.json({
        page,
        limit,
        total,
        entries: entries.map(toLedgerRow),
    });
}));
/** GET /api/wallet/treasury — on-chain float, useful while testing on devnet. */
walletRouter.get('/treasury', asyncHandler(async (_req, res) => {
    if (!isTreasuryConfigured())
        throw serviceUnavailable('Treasury is not configured.');
    const lamports = await getTreasuryBalance();
    res.json({
        address: getTreasuryAddress(),
        lamports: lamports.toString(),
        // getBalance returns lamports; convert rather than reinterpreting as SOL.
        sol: toAmountString(fromLamports(lamports)),
        cluster: env.SOLANA_CLUSTER,
    });
}));
//# sourceMappingURL=wallet.routes.js.map