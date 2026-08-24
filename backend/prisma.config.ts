import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (migrate, studio, generate).
 *
 * As of Prisma 7 the datasource URL lives here rather than in schema.prisma.
 * The application runtime doesn't read this file — it connects through the pg
 * driver adapter in src/config/db.ts, using the same DATABASE_URL.
 *
 * Local dev needs `.env` loaded before `env()` below can read DATABASE_URL.
 * Hosts like Render already inject real environment variables (no .env file
 * exists there), and Prisma loads this file through its own loader, which
 * can't resolve the `dotenv` package inside an npm-workspaces monorepo — so
 * only reach for a `.env` file, via Node's own loader, when nothing has been
 * provided by the platform already.
 */
if (!process.env.DATABASE_URL && existsSync('.env')) {
  process.loadEnvFile('.env');
}
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
