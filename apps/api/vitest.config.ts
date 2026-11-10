import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/dist/**'],
    // index.ts's import graph pulls in every route file in the app, which in
    // turn pulls in a couple of CJS packages whose package.json "exports"
    // field Vite's own module resolution can't follow (it works fine under
    // plain Node/tsx, which is how the app actually runs) — left external,
    // for Node's native resolution instead of Vite's.
    //
    // Everything else is inlined (the `true` below), which is the real fix
    // for a bug `deps.interopDefault` alone never actually addressed: Vite
    // externalizes node_modules packages by default, and `interopDefault`
    // only applies to vitest's own module evaluator — a module taking the
    // externalized/native-`require` path never goes through it. So any CJS
    // package imported with a default import (`import dotenv from 'dotenv'`
    // — the exact shape `config/env.ts` uses, and plenty of other files)
    // read as `undefined` instead of `module.exports`, which broke
    // collection with a wildly misleading "Cannot read properties of
    // undefined (reading 'config')" pointed at the test file's own
    // `describe()` call. Confirmed live by bisecting the *entire* app
    // import graph down to a single import of a single such package
    // (`import '../routes/finance-documents.routes.js'` alone reproduced
    // it) — this was never actually a full-app-size problem, just one that
    // only showed up once the import graph was big enough to statistically
    // guarantee hitting at least one default-imported CJS dependency.
    // `inline: true` forces every non-external dependency through Vite's
    // real transform pipeline, which does the CJS/ESM interop properly.
    server: { deps: { external: [/opentimestamps/, /node-forge/, /samlify/, /ioredis/], inline: true } },
    pool: 'forks',
    isolate: false,
    // These hit the real dev database and the real Fastify app (via
    // .inject(), no network port) — not mocked. Sequential across files:
    // each test creates its own throwaway tenant and cleans it up, but
    // there's no isolated per-test database to fall back on, so two files
    // racing isn't worth the speed.
    fileParallelism: false,
    testTimeout: 20000,
    // Integration suites clean up tenant-owned records through real FK cascades.
    // This can take several minutes on the shared local database.
    hookTimeout: 300000,
  },
});
