import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isTest } from './env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('db');

/**
 * One shared Prisma client, backed by the pg driver adapter.
 *
 * Prisma 7 takes the connection through an adapter rather than a datasource URL
 * baked into the schema, which is also what lets tests point at a throwaway
 * database without touching schema.prisma.
 */
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (client) return client;

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  client = new PrismaClient({
    adapter,
    log: isTest ? [] : [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }],
  });

  return client;
}

/**
 * Ambient accessor used across the app.
 *
 * A Proxy so importing `prisma` never forces a connection at module-load time —
 * `env` validation and the test harness both need to run first.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = Reflect.get(getPrisma() as object, prop);
    return typeof value === 'function' ? value.bind(getPrisma()) : value;
  },
});

export async function connectDb(): Promise<void> {
  const db = getPrisma();
  await db.$queryRaw`SELECT 1`;
  // Never print credentials; the host/db alone is enough to diagnose.
  const target = env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@');
  log.info(`connected to ${target}`);
}

export async function disconnectDb(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = null;
}

/** Test-only: swap in a client pointed at a throwaway database. */
export function _setPrismaForTests(instance: PrismaClient | null): void {
  client = instance;
}
