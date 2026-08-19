import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the backend reads, validated once at boot.
 * A bad/missing value fails the process immediately instead of surfacing as a
 * confusing runtime error three layers deep in the deposit listener.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Doc 07: Postgres in Docker, host port 5433.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // --- doc 01: auth -------------------------------------------------------
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SIWS_DOMAIN: z.string().default('localhost:5173'),
  AUTH_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // --- doc 02: chain ------------------------------------------------------
  SOLANA_CLUSTER: z.enum(['devnet', 'testnet', 'mainnet-beta']).default('devnet'),
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  SOLANA_WS_URL: z.string().optional(),
  // Doc 02 locks crediting to `confirmed` — faster than `finalized`, tiny accepted risk.
  SOLANA_COMMITMENT: z.enum(['processed', 'confirmed', 'finalized']).default('confirmed'),
  TREASURY_SECRET_KEY: z.string().default(''),
  ENABLE_DEPOSIT_LISTENER: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  MIN_WITHDRAWAL_SOL: z.coerce.number().nonnegative().default(0.01),

  // --- doc 09: referral anti-Sybil ---------------------------------------
  // A referral commission is only PAID once the invited player has put real
  // money at risk. Both gates must clear; either set to 0 disables that half.
  // See referral/payoutEligibility.ts for why these two signals and not others.
  REFERRAL_MIN_DEPOSIT_SOL: z.coerce.number().nonnegative().default(0.05),
  REFERRAL_MIN_WAGERED_SOL: z.coerce.number().nonnegative().default(0.1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid backend environment:\n${issues}\n\nCopy backend/.env.example to backend/.env and fill it in.\n`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Origins allowed to call the API from a browser. */
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
