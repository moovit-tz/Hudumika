import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Real Postgres + real audit hash-chain writes (each write reads the
    // current chain tip then appends) are not safe under concurrent test
    // files hammering the same tables — serialize file execution so the
    // suite is deterministic instead of occasionally flaking on interleaved
    // writes. Tests within a file already run sequentially by default.
    fileParallelism: false,
    // Real OCR (tesseract) + real image analysis (sharp) in the KYC flow is
    // slow — give it real headroom instead of a flaky short timeout.
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
