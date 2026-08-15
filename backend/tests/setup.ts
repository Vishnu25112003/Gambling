import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { _setPrismaForTests } from '../src/config/db.js';

/**
 * Escrow correctness is about concurrent database behaviour, so these tests run
 * against a REAL PostgreSQL — the same Docker container used for development,
 * in a throwaway database. Mocks would happily "pass" the exact race conditions
 * and CHECK constraints we care about.
 *
 * The test database is created and dropped per run, so it never touches
 * development data.
 */
const TEST_DB = 'gamblinghub_test';

function adminUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required to run tests');
  return base.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
}

export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL!;
  return base.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);
}

let client: PrismaClient | null = null;

export async function startTestDb(): Promise<PrismaClient> {
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl() }) });
  try {
    // Drop first: a previous crashed run must not leak state into this one.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB}"`);
  } finally {
    await admin.$disconnect();
  }

  // Apply the real migrations, so tests exercise the actual schema —
  // including the CHECK constraints added by hand to the init migration.
  execSync('npx prisma migrate deploy', {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });

  client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
  });
  _setPrismaForTests(client);
  return client;
}

export async function stopTestDb(): Promise<void> {
  await client?.$disconnect();
  client = null;
  _setPrismaForTests(null);

  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl() }) });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  } finally {
    await admin.$disconnect();
  }
}

/** Wipe all rows between tests, keeping the schema. */
export async function clearTables(): Promise<void> {
  if (!client) return;
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE ledger_entries, match_participants, matches, auth_nonces, users RESTART IDENTITY CASCADE',
  );
}

export function getTestPrisma(): PrismaClient {
  if (!client) throw new Error('Test database not started');
  return client;
}
