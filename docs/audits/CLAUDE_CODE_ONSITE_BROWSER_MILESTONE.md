# Claude Code prompt for the Onsite browser milestone

Work in `D:\Apps\Hudumika`. Read `AGENTS.md`, `CLAUDE.md`, the [standalone handoff](CLAUDE_CODE_STANDALONE_DEVELOPMENT_HANDOFF.md), and the [verification plan](STANDALONE_VERIFICATION_AND_PLAN_2026-11-05.md). Start with `git status --short` and inspect the relevant diffs. Several sessions share this checkout. Preserve other work and keep applied migrations intact.

**Deliver a clean release build and prove that a signed-out user can open a direct Onsite URL, sign in through Ondi, and return to the original page with the correct workspace and entitlement.** Run the local flow without Docker. Use the existing shared API, identity records, and app entry mechanism.

## Starting point

- Onsite has hostname-based entry in `apps/web/src/lib/appEntry.ts` and an example Caddy configuration in `deploy/contabo/onsite-subdomain.Caddyfile.example`. A fresh browser already verified that the signed-out `/onsite/domains?app_entry=onsite` request reaches login with the original `returnTo`. The authenticated return and dedicated host are still open.
- The reuse-based Ondi service in `apps/api/src/ondi-standalone-server.ts` runs on port 3010 with its own issuer and a CORS allowlist. Claude Code recorded a successful API-only PKCE flow, refresh, and revocation. Discovery advertises `/ondi/authorize` on that origin, and a browser request to that path returned 404.
- Onsite recovery now checks for detached agency history and grants an add-on while preserving the base plan. Parallel recovery requests were reported to produce one active add-on. Developer top-up settlement is now transactional, with recorded concurrency checks using a stubbed gateway. Carry these fixes forward.
- The root type check still stops during API compilation. Reported errors include Fastify `httpErrors`, missing `TenantDb` exports, enterprise metrics, launch-planner dates, and related tests. Reproduce the current errors before editing. The full single-product browser sweep is also pending.

## Implementation order

1. **Restore the build baseline.** Run `npm run typecheck` and fix reproducible failures at their source. Coordinate around files being edited by another session. Keep type checking and runtime validation meaningful. Run `npm run build` once type checking passes. Continue the independent browser work if an unrelated compile failure needs another owner.
2. **Finish the direct Onsite entry.** Reuse the existing app shell and app entry helper. Confirm that the configured hostname maps to Onsite. Scope the `app_entry` override to local development and allow known app IDs only. Verify that Onsite navigation, workspace selection, settings, and support make sense for an Onsite-only workspace. Follow the branding rules in `CLAUDE.md`; record any unresolved product decision about Onsite-specific pre-auth branding or favicon separately.
3. **Serve Ondi’s advertised authorization page.** Reuse the existing authorization UI and route only the necessary identity traffic to the standalone issuer. Make discovery and browser behavior agree. Review registered redirect URIs, PKCE, cookie scope, CSRF, and explicit CORS origins. Preserve stable user subject IDs and existing client behavior. Verify the dedicated issuer with one test client before moving existing relying apps.
4. **Run the end-to-end browser acceptance checks.** Start on a direct Onsite host in a fresh browser context with no cached identity. Open a nested route such as `/onsite/domains` with a query string. Follow the actual sign-in and authorization screens, then verify the final URL, workspace, and usable page content. If the shared issuer is used as an intermediate check, record it separately from the dedicated-issuer acceptance run.

## Acceptance checks

| Check | Evidence required |
| --- | --- |
| Build | `npm run typecheck` and `npm run build` exit successfully, or record exact remaining failures and their affected files. |
| Direct entry | A fresh visit to the Onsite host lands in Onsite after sign-in and skips the general workspace launcher. |
| Deep link | The original path and query string survive sign-in. An untrusted external return destination is rejected. |
| Standalone Ondi | Discovery and JWKS respond, the advertised authorization page renders, and the relying app completes code exchange with PKCE. Verify refresh and logout or revocation. |
| Access | An entitled test workspace can open Onsite. A workspace without Onsite access is denied at the API boundary. Check that switching workspaces respects the selected workspace's entitlement. |
| Shared interface | Repeat the original single-product browser sweep and compare network requests. Check Onsite first, then Lens, ComplyOS, NexusHR, Developer, and Petti. Record remaining calls to disabled products and verify one normal shared-workspace session. |

Use disposable local accounts and workspaces, and remove them afterward. Use sandbox or stubbed external providers if an acceptance flow needs them. Production deployment, real purchases, and moving existing Ondi clients are separate release steps.

Update the status table in the verification plan with test results, file references, and any remaining blockers. Report browser flows verified end to end separately from source inspection, API-only checks, and mocks. If a gate fails, diagnose it and continue the checks that are still possible.
