import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // An in-memory Mongo has to download a binary on first run.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Escrow tests mutate shared collections; run files serially.
    fileParallelism: false,
  },
});
