import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
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

/**
 * Migration directories on disk that Postgres has no record of applying.
 *
 * Returns them in filename order — which is chronological, since Prisma
 * prefixes every directory with a timestamp.
 */
async function pendingMigrations(db: PrismaClient): Promise<string[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/config/ -> src/ -> backend/, where prisma/ lives. Same relative depth
  // from dist/config/ after a build, so this holds for both tsx and node.
  const dir = resolve(here, '..', '..', 'prisma', 'migrations');

  const onDisk = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  // `finished_at IS NULL` covers a migration that started and then failed or was
  // interrupted — the schema it describes is not fully there either way.
  const applied = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name
      FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL
       AND rolled_back_at IS NULL
  `;

  const done = new Set(applied.map((r) => r.migration_name));
  return onDisk.filter((name) => !done.has(name));
}

export async function connectDb(): Promise<void> {
  const db = getPrisma();
  await db.$queryRaw`SELECT 1`;
  // Never print credentials; the host/db alone is enough to diagnose.
  const target = env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@');
  log.info(`connected to ${target}`);

  /**
   * Refuse to boot against a database the schema has outrun.
   *
   * The generated Prisma client selects every column in schema.prisma, so a
   * single unapplied migration turns every read of that table into a 500 —
   * `POST /api/auth/verify` included, which reads as "the wallet won't connect"
   * with no hint that the database is the problem. Failing here names the cause.
   *
   * Skipped under NODE_ENV=test: the harness in tests/setup.ts builds its own
   * throwaway database and manages its schema itself.
   */
  if (isTest) return;

  const pending = await pendingMigrations(db);
  if (pending.length === 0) return;

  log.error(
    `database is missing ${pending.length} migration(s): ${pending.join(', ')}\n` +
      '  Every query touching the new columns will fail until they are applied.\n' +
      '  Run: npm run prisma:migrate',
  );
  throw new Error(`unapplied migrations: ${pending.join(', ')}`);
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
