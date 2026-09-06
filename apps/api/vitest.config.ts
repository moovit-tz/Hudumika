import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // index.ts's import graph pulls in every route file in the app, which
    // in turn pulls in a couple of CJS packages whose package.json "exports"
    // field Vite's own module resolution can't follow (it works fine under
    // plain Node/tsx, which is how the app actually runs) — left for Node's
    // native resolution instead of Vite's.
    server: { deps: { external: [/opentimestamps/, /node-forge/, /samlify/] } },
    // These hit the real dev database and the real Fastify app (via
    // .inject(), no network port) — not mocked. Sequential across files:
    // each test creates its own throwaway tenant and cleans it up, but
    // there's no isolated per-test database to fall back on, so two files
    // racing isn't worth the speed.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
