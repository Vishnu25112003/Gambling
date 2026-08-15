import { Connection, PublicKey, type Commitment } from '@solana/web3.js';
import { env } from './env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('solana');

let connection: Connection | null = null;

/**
 * One shared RPC connection. The websocket endpoint matters here — doc 02 locks
 * deposit detection to a live subscription rather than polling, and that
 * subscription rides on this connection's `wsEndpoint`.
 */
export function getConnection(): Connection {
  if (connection) return connection;
  connection = new Connection(env.SOLANA_RPC_URL, {
    commitment: env.SOLANA_COMMITMENT as Commitment,
    ...(env.SOLANA_WS_URL ? { wsEndpoint: env.SOLANA_WS_URL } : {}),
  });
  log.info(`RPC ${env.SOLANA_RPC_URL} (${env.SOLANA_CLUSTER}, commitment=${env.SOLANA_COMMITMENT})`);
  return connection;
}

export const commitment = env.SOLANA_COMMITMENT as Commitment;

/** True if a string parses as a Solana public key. */
export function isValidPublicKey(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function explorerTxUrl(signature: string): string {
  const suffix = env.SOLANA_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${env.SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}
