# Security and production readiness remediation — 2026-11-10

Scope: OTP/PII logging, CRM tenant references, CRM email HTML, CRM pagination, dependency advisories, API test failures, lint/build verification, and invitation URL configuration.

Status key: `[ ]` not started · `[~]` in progress · `[x]` fixed and verified · `[!]` blocked with reason.

## Checklist

- [x] OTP and PII exposure in logs — focused delivery, failure, and privacy assertions pass; phone/OTP values were removed from operational logs.
- [x] Cross-tenant CRM relationship validation — focused same-tenant/foreign-tenant and unauthenticated-task assertions pass; tenant-scoped joins and reference validation are implemented.
- [x] CRM email HTML injection — focused escaping and newline regression assertions pass.
- [x] Unbounded CRM list endpoints — focused page bounds, stable ordering, and response metadata assertions pass; default and requested pages are capped.
- [~] Dependency vulnerabilities — high/critical findings eliminated. Final full audit: 18 total (15 moderate, 3 low, no high/critical); production audit has 4 low/moderate OpenTimestamps transitive advisories.
- [!] API integration tests — focused security suite passes, but full suite is not clean: initial run included stale `dist` copies (214 files passed, 28 failed; 2,441 tests passed, 85 failed). Test discovery now excludes build output and cleanup has a longer timeout. The 11-file source-only rerun still exits nonzero; broader pre-existing feature/entitlement assertions remain unresolved.
- [x] Lint and production verification — root lint, root typecheck, and full production build pass. Typecheck reports existing POS Studio trigger-registry coverage warnings; Vite reports existing mixed dynamic/static import chunk warnings.
- [x] Customer invitation URL configuration — `PUBLIC_APP_URL` is used with the Hudumika domain production fallback; focused configured/fallback URL assertions pass.

## Progress notes

- 2026-11-10: Read `CLAUDE.md` and `AGENTS.md`; confirmed a pre-existing dirty worktree and kept unrelated edits untouched.
- 2026-11-10: Implemented OTP privacy/delivery behavior, tenant checks for CRM relationships and joins, CRM email escaping, bounded pagination, and the Contabo-compatible `PUBLIC_APP_URL` invitation URL.
- 2026-11-10: Added regression coverage. First focused run found test fixture/route issues (including the correct singular `/v1/crm/activity` route) and a tenant cleanup FK; correcting these before rerun.
- 2026-11-10: Focused CRM/OTP functional assertions now pass. Authentication was missing entirely on `/v1/crm/tasks`; added the authenticate hook. Customer response serialization had been removing pagination metadata; added the fields to its Fastify response schema. The test helper now explicitly removes the non-cascading tenant activation checkpoint before tenant deletion. The three fixture tenant deletions still exceed the 60-second test hook timeout; the test hook budget is now increased.
- 2026-11-10: `npm audit fix` plus compatible Vite/Vitest upgrades reduced the audit from 26 findings (4 critical, 6 high) to 10 (0 critical/high). `npm audit --omit=dev --audit-level=high` passes; its remaining 4 production findings are in OpenTimestamps → bitcore-lib/bn.js/elliptic. Existing production audit documentation says not to force the suggested `opentimestamps@0.0.0` downgrade; this needs a verified protocol-compatible replacement.
- 2026-11-10: Confirmed four duplicate migration filenames (two `656_*`, two `697_*`); root and API manifests do not declare ESLint although the root lint script invokes it. Contabo sets `PUBLIC_APP_URL`, `CLAMAV_HOST`, and `CLOUD_REQUIRE_SCAN=true`; customer invites currently read the unrelated `APP_BASE_URL` fallback.
- 2026-11-10: Added an ESLint 10 root flat config using the already-used React Hooks plugin; final `npm run lint` exits 0 with no diagnostics.
- 2026-11-10: Added explicit Vitest source-test discovery and excluded `dist` so stale compiled tests are not run. Increased the shared integration-hook timeout to 300 seconds because tenant cascades exceed the old 20-second budget.
- 2026-11-10: A final `npm audit` reports 0 high/critical, 15 moderate, 3 low. `npm audit --omit=dev --audit-level=high` exits 0 but reports 4 low/moderate production advisories through OpenTimestamps → bitcore-lib. The recommended forced package change is not protocol-compatible per the existing audit document and remains unresolved.
- 2026-11-10: The source-only rerun of the 11 previously failing files still exits nonzero. The full root typecheck completed successfully; its Studio trigger audit reports existing POS trigger-registry warnings (missing registry entries for several emitted POS events and one registered event with no emitter).
- 2026-11-10: `npm run build` is active. Shared types/UI builds completed and API compilation completed without diagnostics; web TypeScript compilation is still running with no errors emitted so far.
- 2026-11-10: Final `npm run typecheck` exited 0. Final `npm run build` exited 0; all workspaces built and Vite transformed 5,561 modules. Only pre-existing trigger/chunk warnings were reported.
- 2026-11-10: Final focused CRM security regression run exited 0: 6/6 tests passed in 60 seconds.
- 2026-11-10: `git diff --check` exited 0. This is repository code/dependency review and automated regression coverage; no external black-box penetration test was performed.
