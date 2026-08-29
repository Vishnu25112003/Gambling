-- Fix drift: schema.prisma declares CoinFlipRound.id @default(uuid()),
-- but the original migration created the column with no default. The raw
-- SQL INSERT in coin-flip/socket.ts omits `id`, so Postgres rejected every
-- row ("null value in column \"id\"") — no round record was ever persisted and
-- matches could not progress past the first round. Restore the default so the
-- column self-populates. Non-destructive: only the column default changes.
ALTER TABLE "coin_flip_rounds"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
