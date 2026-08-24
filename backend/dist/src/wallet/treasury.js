import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '../config/env.js';
import { getConnection } from '../config/solana.js';
import { createLogger } from '../lib/logger.js';
import { serviceUnavailable } from '../lib/errors.js';
const log = createLogger('treasury');
/**
 * Doc 02, Option A — a single backend-held wallet pools every user's funds.
 * There is no on-chain program in this phase; deposits and withdrawals are
 * plain System Program transfers to and from this keypair.
 *
 * The secret key lives in an env var for the devnet phase. A real secrets
 * manager (KMS / Vault) must replace this before any real-money phase — the
 * only code that would change is `loadTreasuryKeypair` below.
 */
let cached = null;
let loadAttempted = false;
function parseSecretKey(raw) {
    const trimmed = raw.trim();
    // Format 1: JSON byte array, what `solana-keygen` writes to a file.
    if (trimmed.startsWith('[')) {
        const bytes = JSON.parse(trimmed);
        return Uint8Array.from(bytes);
    }
    // Format 2: base58, what Phantom/Solflare export.
    return bs58.decode(trimmed);
}
/** The treasury keypair, or null when it isn't configured. */
export function loadTreasuryKeypair() {
    if (cached)
        return cached;
    if (loadAttempted)
        return null;
    loadAttempted = true;
    if (!env.TREASURY_SECRET_KEY) {
        log.warn('TREASURY_SECRET_KEY is not set — deposits and withdrawals are disabled.');
        return null;
    }
    try {
        cached = Keypair.fromSecretKey(parseSecretKey(env.TREASURY_SECRET_KEY));
        log.info(`treasury loaded: ${cached.publicKey.toBase58()}`);
        return cached;
    }
    catch (err) {
        log.error('TREASURY_SECRET_KEY could not be parsed (expected base58 or a JSON byte array)', err);
        return null;
    }
}
/** Throws a 503 rather than a crash when the treasury isn't configured. */
export function requireTreasury() {
    const kp = loadTreasuryKeypair();
    if (!kp) {
        throw serviceUnavailable('Treasury wallet is not configured on the server. Set TREASURY_SECRET_KEY.');
    }
    return kp;
}
export function getTreasuryPublicKey() {
    return loadTreasuryKeypair()?.publicKey ?? null;
}
export function getTreasuryAddress() {
    return getTreasuryPublicKey()?.toBase58() ?? null;
}
export function isTreasuryConfigured() {
    return loadTreasuryKeypair() !== null;
}
/** On-chain lamport balance of the treasury — the pooled float backing all users. */
export async function getTreasuryBalance() {
    const pk = getTreasuryPublicKey();
    if (!pk)
        return 0n;
    return BigInt(await getConnection().getBalance(pk));
}
/** Test-only reset. */
export function _resetTreasury() {
    cached = null;
    loadAttempted = false;
}
//# sourceMappingURL=treasury.js.map