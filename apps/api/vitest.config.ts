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
    // `inline: true` (tried first) does NOT compose with `external` the way
    // it looks like it should: vitest's own `_shouldExternalize()` checks
    // `inline` before `external` and, for the literal boolean `true`,
    // returns "inline" unconditionally — `external` is never even consulted.
    // So `inline: true` + `external: [...]` silently ignores the external
    // list entirely, which is how ioredis (needed by BullMQ job queues)
    // ended up re-executed through Vite's transform pipeline instead of
    // Node's native `require`, hitting a real, unrelated bug in its own
    // generated code (`Object.defineProperty(exports, "default", ...)`
    // called twice on the same object → `TypeError: Cannot redefine
    // property: default`). Confirmed live by reading
    // node_modules/vitest/dist/chunks/cli-api.*.js's `_shouldExternalize`.
    // Fixed by inlining everything via a single regex with a negative
    // lookahead instead of the boolean `true`, so these four packages still
    // fall through to the normal external/native-require path afterward.
    //
    // NOT fully closed: even with this fix, a full-app-import test file
    // (the shape every real integration suite's helpers.ts uses) still fails
    // the same "reading 'config'" collection error *some* of the time —
    // confirmed non-deterministic, not tied to any particular file or
    // import shape (the identical file/config passed on one run and failed
    // on the next, with nothing else changed). Correlates with how loaded
    // this dev machine is: `Get-CimInstance Win32_OperatingSystem` showed
    // ~8% RAM free with ~40 node processes running (several concurrent
    // sessions share this machine) at the point this flipped from passing
    // to consistently failing. Reads as a genuine race in Vite's async
    // module-graph collection under memory pressure, not a config mistake —
    // config tuning (pool/isolate variations) did not reliably close it.
    // If a test run hits this, retry once the machine is less loaded before
    // assuming the code under test is actually broken.
    server: { deps: { external: [/opentimestamps/, /node-forge/, /samlify/, /ioredis/], inline: [/node_modules\/(?!opentimestamps|node-forge|samlify|ioredis)/] } },
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
