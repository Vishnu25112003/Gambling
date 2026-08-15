import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (migrate, studio, generate).
 *
 * As of Prisma 7 the datasource URL lives here rather than in schema.prisma.
 * The application runtime doesn't read this file — it connects through the pg
 * driver adapter in src/config/db.ts, using the same DATABASE_URL.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
