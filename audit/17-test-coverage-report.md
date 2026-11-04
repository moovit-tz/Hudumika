# Test evidence and limits

- Existing clearos-remediation.test.ts: 19 passed. Checks negative/malformed inputs, quantity/mode validation, penalty/storage behavior, role writes, transport docs, workflow concurrency, API round-trip of markup, history feedback. A stored XSS string round-trip is not browser XSS verification.
- New clearos-production-boundaries.test.ts: initial 3 failed/1 passed, final6 passed. Tests foreign/missing parents, customer/tenant reads, financial-state prerequisites, concurrent duplicate status and chain validity. Fixture for concurrency seeds ASSESSED directly; it does not verify the whole assessment lifecycle.
- New clearos-fx-failure.test.ts: before failure; after1 passed. Only upstream transport is simulated; this verifies fail-closed behavior rather than provider correctness.
- New clearos-browser-audit.test.ts: separate actual result in browser-test.log/results. It exercises real handlers in Chromium, not live deployment/login or populated CRUD.

No statement/branch/mutation coverage was collected. Do not infer a percentage from test count. No new framework installed. Full repository suite, mutation/property/fuzz suites, migrations on fresh DB and all role paths NOT VERIFIED. Commands: npm run test -w apps/api -- <listed test paths>; npx tsc --noEmit -p apps/web/tsconfig.json; npm run typecheck.
