# Claude Code prompt for standalone app development

Continue implementation in `D:\Apps\Hudumika`. Read `AGENTS.md`, `CLAUDE.md`, and [the standalone verification and implementation plan](STANDALONE_VERIFICATION_AND_PLAN_2026-11-05.md). Use the plan as the baseline and recheck the current checkout before acting. Start implementation with the release blockers below, then advance through the milestones as their prerequisites pass.

The objective is to give each product an independently deployable interface with a direct URL, branded entry, Ondi sign-in, workspace selection, and entitlement enforcement. Use shared Hudumika APIs and identity records for the first interface releases. Separate backend services where there is a demonstrated need and a verified contract. Support native local development without Docker.

## Working agreement

- Capture `git status --short` and inspect the existing diff. Several sessions share the checkout. Preserve work you did not author, stage by explicit path if asked to commit, and keep applied migrations intact.
- Read the authoritative UI and tenancy rules in `CLAUDE.md`. Use the existing UI components, app shells, branding, authentication, entitlement, onboarding, and billing patterns. Keep tenant queries explicitly scoped and run them in the correct tenant context.
- Use disposable local workspaces for runtime verification and remove them afterward. Stub external payments and provisioning providers where needed. Keep production rollout and customer charges behind their release gates.
- Run `npm run typecheck` and the relevant build and tests. Check UI-visible changes in a browser with real local APIs when available. Record results separately for mocked flows, real local workflows, and production verification.
- Update the existing implementation plan with the status, evidence, and remaining blocker for each milestone. Report concrete completed work, any product decisions you made, and the next unfinished dependency.

## Current baseline to recheck

- Lens, ComplyOS, NexusHR, Developer, Petti, and Onsite have distinct interfaces in the shared web app. Representative authenticated API reads returned 200 with the target app enabled. Anonymous requests returned 401. Lens denied a tenant admin and worked for a SuperAdmin. Developer's accounts API worked with its workspace feature disabled because it uses an account membership model.
- Shared HR check-in, Notes, Chat, and eSign now have entitlement checks. Rerun the full single-product browser sweep and compare its network requests with the original audit.
- Onsite recovery now requires detached agency history and grants the Onsite add-on while preserving the base plan. A disposable tenant without that history returned 403. Claude Code recorded a successful detached-client recovery on Business. Concurrent retries still need coverage.
- Developer accounts now start at 0 TZS. Migration 705 is applied locally, unstaged payment references are rejected, and the console uses measured counts or empty states. Hosted checkout and verification exist. Settlement still performs separate writes for balance, checkout status, and the ledger.
- Onsite has hostname-based entry through `apps/web/src/lib/appEntry.ts` and an example Caddy block. A fresh browser confirmed that the signed-out Onsite domains deep link reaches login with its `returnTo` intact. The authenticated return and independent host remain unverified.
- The standalone Ondi API on port 3010 advertises its own issuer. Claude Code recorded a passing API flow through token exchange, refresh, and revocation. The browser authorization URL advertised by that issuer still returns 404. Use the current reuse-based service as the extraction candidate.
- The last root type check stopped in API compilation on Fastify `httpErrors` typing, missing `TenantDb` exports, enterprise metrics, launch-planner dates, and test errors. The plan's earlier “all four closed” label does not reflect this result or the open settlement work. Recheck the current build before changing it.
- The local commercial catalogue has standalone pilot offers for ClearOS, HuduFreight, SEAL, and CargoTracker. Onsite has an active add-on and a legacy recovery path. The six apps above lack dedicated entries in the standalone commercial catalogue. Lens is internal, and Developer already has its own account billing model.

## 1. Close the release blockers

**Developer settlement first.** In `apps/api/src/services/developer.service.ts`, verify the gateway reference, amount, currency, and ownership against the staged checkout. Then settle in one database transaction. Claim the pending checkout with a row lock or conditional update, increment the balance in SQL, and insert one ledger event under a durable unique reference. Reuse the existing settlement pattern where it fits. Use trusted return URL configuration for hosted checkout. Verify same-reference concurrency, concurrent distinct top-ups, an unstaged or foreign reference, amount or currency mismatch, rollback on ledger failure, and a clean retry. Use gateway fixtures for payment success and failure. Review legacy seeded credits separately using auditable evidence before changing balances.

**Onsite recovery and purchase.** Build on the new eligibility check and additive grant. Verify that parallel retries yield one active add-on and a consistent response. Confirm audit coverage, existing subscriber behavior, and paid base plan preservation. Use existing checkout and entitlement paths for new purchases.

**Shared chrome.** Trace the observed denied requests back to the shared components. Use existing app-access information to avoid loading widgets and actions for disabled products. Verify that app-only users keep the applicable navigation, identity, settings, notifications, and support. Test representative shared-workspace behavior too.

**Build baseline.** Reproduce and resolve API compilation failures without masking them. Complete the root type check and build. Keep fixes attributable to the affected code and report any blocker owned by concurrent work.

## 2. Prove Onsite as the first independently hosted interface

Finish the existing app entry configuration and Caddy example. Start with Onsite-specific branding, favicon, navigation, settings, and support. Restrict the preview override to known app IDs and keep it scoped to local development. Confirm the configured hostname maps to the right app. Run the direct host locally without Docker and complete a fresh browser sign-in back to the original deep link. Keep product access enforced on the server.

Use the working Ondi issuer for the first Onsite integration if needed. For the standalone issuer, wire the authorization screen advertised by discovery to the port-3010 service and review registered redirect URIs, cookie scope, CSRF, and the existing CORS allowlist. Keep user subject identifiers stable. Extend the recorded API-only OAuth verification with a real browser authorization, return to the relying app, refresh, logout, and revoked-session rejection. Prove one relying app before moving existing clients.

The Onsite acceptance run should cover a new direct visit, sign-in and return to a deep link, authorized workspace selection, access after verified test purchase, an eligible recovery, provider provisioning status, and cancellation. Verify that an unsubscribed workspace cannot provision resources.

## 3. Roll out the remaining entry points

| App | Implementation and acceptance |
| --- | --- |
| Developer | Give the console and API gateway clear entry points. Verify account and project creation, key issuance, an entitled call, usage settlement, and account isolation. Use its existing account model after the ownership and commercial policy is documented. |
| ComplyOS | Establish the standalone offer and decide how company records are owned or connected to CRM. Make OCR and renewal-finance dependencies explicit. Verify company profile, obligation, application, document, and reminder workflows in a ComplyOS-only workspace. |
| NexusHR | Add employer onboarding and an employee-based offer. Keep HR roles and Ondi identity administration clear. Verify an invitation, attendance, leave approval, test payroll, payslip access, and staff revocation. |
| Petti | Define and provision the supported FinOps ledger dependency. Verify wallet creation, test deposits, approvals, disbursement, reconciliation, currency checks, and isolation. A separate frontend can still use the shared ledger API. |
| Lens | Run it as an internal app with Ondi admin sign-in. Verify that non-admins are refused and that permitted users can load the board, update an item, and see its audit history. |
| HuduFreight | Verify a direct sign-in and dispatch on a HuduFreight-only workspace. Define the tenant-scoped shipment lookup and retry-safe event handoff with ClearOS before splitting its backend. |
| ClearOS | Verify a ClearOS-only signup and first declaration. Gate links to SEAL, CargoTracker, and HuduFreight by the actual destination entitlement. Keep free calculator access and declaration metering distinct. |
| CargoTracker | Verify a standalone BL/AWB activation, tracking refresh, and sharing. Preserve one metered activation per normalized reference under the current rule and document how reused references are handled. |
| SEAL | Verify a SEAL-only purchase and bonded receipt, stock, and release workflow. Implement facility pricing only after the commercial unit is agreed. |
| Tuma | Verify the separate web and API deployment and the intended sign-in. Implement the parcel trial and per-parcel charging with durable business-level eligibility, idempotent deductions, and existing-parcel tracking after the allowance is spent. |

Keep LexCore, Gereji, and Ngao on the deployment verification list where their standalone applications already exist. Verify each against its actual configured Ondi client and supported dependencies. LexCore's job queue readiness is separate from its HTTP sign-in readiness.

## 4. Finish commercial rollout and backend separation

For the freight bundle, invitations, accepted rate revisions, usage meters, and review-only drafts already exist. The next commercial work is a separate paid enrollment decision and a payable invoicing path. Establish explicit consent, eligibility dates, treatment of overlapping flat subscriptions, tax and credit rules, invoice reconciliation, and rollback. Preserve accepted rates and exclude pre-enrollment activity. Verify duplicate generation, payment retries, cancellation, and tenant isolation with local test data before any paid rollout.

Split backend services after the app's direct interface, auth, and operational workflow pass. Define ownership and tenant-scoped APIs or events for CRM, identity, finance, shipment handoffs, provider credentials, and queues. Verify retries, timeouts, recovery, and deployment rollback at each boundary.

Track four independent milestones per app in the plan: interface deployed, identity verified, commercial onboarding verified, and operational workflow verified. Record internal-only or account-based exceptions explicitly. Prioritize the release blockers and the Onsite reference implementation before broad app extraction.
