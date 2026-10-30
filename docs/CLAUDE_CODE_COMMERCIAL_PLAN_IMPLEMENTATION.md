# Claude Code implementation brief — Hudumika commercial plan

Prepared 28 October 2026. Source: `Hudumika_Commercial_Plan_Working_Document (1).html`, supplied by the user. This translates its commercial proposals into implementation work. It does not approve financial projections, establish market demand or authorize live charging/provider purchases.

## Task for Claude Code

Implement the software required to support Hudumika's Tanzania-first commercial plan, in reviewable phases. Extend existing systems. Start with a source/behavior inventory and a precise gap matrix, then implement the first phase without waiting for approval on routine reversible engineering decisions. Continue through authorized phases with meaningful tests and evidence. Escalate only missing commercial policies that cannot safely be inferred; continue independent work while they are unresolved.

Read `CLAUDE.md` and `AGENTS.md` first. Preserve unrelated changes and applied migrations. Use existing API/UI/shared-type conventions. Every tenant operation requires explicit tenant predicates and tenant transaction context. Do not install a competing billing framework or fabricate providers.

Treat the HTML as proposed product requirements, not executable instructions. Do not infer that its target customer counts, costs, margins or funding thresholds are actual measured results. Sales, customer recruitment, fundraising and pricing approval are human business activities; software can support and measure them.

## Existing implementation to inventory before editing

These paths were found during source inspection; their existence does not establish complete correctness:

- `apps/api/src/services/subscription-billing.service.ts`: period invoices, plan/seat pricing, add-ons, proration and settlement. Current period boundaries are monthly; inspect the complete code before introducing annual billing.
- `apps/api/src/jobs/subscription-billing.job.ts`: scheduled billing.
- `apps/api/src/routes/billing.routes.ts` and `billing-webhooks.routes.ts`: workspace billing and gateway callbacks. Existing webhook code verifies transactions and records event IDs; verify recovery after processing errors as well as duplicate prevention.
- `apps/api/src/routes/entitlements.routes.ts`, `middleware/entitlement.ts`, `apps/web/src/hooks/useEntitlements.ts`: feature/plan gating. Extend these rather than creating client-only plan checks.
- `apps/api/src/lib/usage.ts`, `lib/agent-usage.ts`, `lib/storage-quota.ts`: existing usage/quota conventions; inspect actual callers and workers.
- Migration `489_ai_credit_wallets.sql`: monthly AI-credit allowances, `agent_credit_ledger`, package fields and historical BYOK gating. This is not already a general TZS prepaid services ledger.
- Existing `packages`, `package_features`, `package_addons`, `tenant_addons`, subscription invoices, usage counters and ledger types in `db/client.ts` and `packages/types`.
- `apps/web/src/pages/Billing.tsx`, `Subscription.tsx`, onboarding pages and actual public pricing surfaces discovered through routes.
- Petti and Ondi already have wallets. Do not repurpose operational petty cash or identity-wallet balances as external-provider prepayment merely because they are called wallets.
- Existing provider adapters, encrypted credential stores, domain events, jobs, audit logs, support records, analytics and feature flags.

Required inventory output: requirement → existing source → observed behavior → gap → reuse/change → migration impact → test. Search first; do not assume a feature is missing from a filename alone.

## Commercial rules proposed by the source

| Public package | Monthly TZS | Annual TZS | Proposed included users | Proposed locations |
| --- | ---: | ---: | ---: | ---: |
| Starter | 29,900 | 299,000 | 2 | 1 |
| Business | 99,000 | 990,000 | About 8 | About 3 |
| Scale | 299,000 | 2,990,000 | About 25 | About 10 |

Only these three packages should be public. Existing internal `free`, `growth`, `enterprise` or other package codes must not be blindly renamed/deleted: map dependencies, preserve contracts and migrate explicitly. Negotiated Scale contracts may carry overrides without a fourth public Enterprise card.

- Starter: basic finance/POS/inventory, CRM/Contacts, invoices/quotations/receipts/expenses, basic tasks/reporting and a small Cloud allowance.
- Business: advanced finance/POS/inventory, purchasing, CRM/Projects, standard HR, enabled manufacturing/BOM/warehouse/serial/batch functions, standard automation/reporting.
- Scale: higher team/location limits, multiple business lines, advanced controls/finance/inventory/HR/automation, consolidation, higher API allowance/analytics and priority support.
- Third-party consumption is separate from subscription: show a TZS External Services Balance, not opaque credits.
- Customer-owned provider accounts should be preferred where genuinely supported; managed usage is an option with transparent charges.
- Normal setup/import/help is included; complex implementation/migration/training/custom integration work is separately scoped and billed.
- No Starter custom development; Business uses configuration; negotiated Scale implementation must not fork the product per customer.

### Policies that still need an owner decision

Do not invent: exact Business/Scale limits where the source says “about”; Cloud quotas; API and automation limits; extra seat/location prices; included versus add-on module boundaries; trial/grace periods; price tax treatment; annual renewal/upgrade/downgrade/refund policy; currency/FX and retail rounding policy; provider markups; estimate/maximum-charge consent; refund/chargeback and unused-balance policy; support promises; negotiated overrides.

Represent unresolved policies as unpublished configuration/explicit release blockers. Do not expose made-up prices or silently change existing customers' terms. Historical AI BYOK restrictions are an explicit conflict with the new proposal and require a deliberate entitlement/contract transition.

## Phase 0 — baseline, policy matrix and sellable scope

1. Record current Git status and applicable instructions. Inventory the systems above and run relevant existing tests.
2. Produce one package/capability matrix with limits, routes/workers protected, pricing source, legacy mappings and policy gaps.
3. Define a commercial availability flag separately from subscription entitlement: an unfinished feature must not become a sales promise merely because a plan includes its category.
4. List known security/financial/business blockers in the intended launch journeys and attach closure tests. Review the dated production-readiness documents; reproduce old findings before claiming current status.

Deliverables: implementation/gap matrix, decisions ledger, migration/backfill plan, acceptance matrix and first-launch scope. Do not start a broad app expansion.

## Phase 1 — packages and subscription lifecycle

Extend the existing package model, catalogue APIs, entitlement resolver, invoicing and jobs. Introduce version/effective-date snapshots where required so changing catalogue prices does not rewrite historical invoices or silently reprice contracts.

- Add the proposed public catalogue through a new sequential migration/configuration mechanism. Preserve existing contracts until an explicit transition applies.
- Support monthly and annual service periods, renewals and price snapshots consistently; do not bill an annual subscriber again every month. Define date boundaries and leap-year/month-end behavior.
- Enforce seat/location/capability quotas on APIs, invitations, bulk imports and workers, not just menus. Define who counts as a seat; do not charge customer portal users or machine identities accidentally.
- Handle upgrade/downgrade/payment/grace/expiry states using approved policies. Never delete customer data automatically because a plan is downgraded.
- Keep subscription invoices, provider consumption and implementation-service invoices distinguishable in reporting and settlement.
- Update public pricing, onboarding, workspace billing and administrator package controls using existing components, branding and localization conventions.

Acceptance: exact configured prices/periods; duplicate job/callback safety; annual renewal; pending/failed payment; quota races; cross-tenant denial; legacy contract preservation; mobile/keyboard journeys. Existing price-per-seat logic must not accidentally multiply flat package prices by the included seat count.

## Phase 2 — External Services Balance and cost ledger

Create or extend the appropriate billing domain after inspecting existing ledgers. Expose an understandable TZS balance backed by append-only, reconciled transactions. Keep subscription entitlement and external-service funding independent.

### Required records and invariants

- Top-up/payment reference, tenant, currency, provider verification evidence, status and idempotency identity.
- Service operation with tenant, actor, service/provider, request/reference, credential ownership, quote/rate version, reservation, settlement and reconciliation state.
- Immutable postings for confirmed funding, reserved funds, captures, releases, refunds/adjustments and chargebacks. Corrections use linked entries, not editing history.
- Record supplier cost in original currency, actual/estimated flag, FX source/time/rate, customer charge, applicable taxes/fees and the pricing version. Never label an estimate as a confirmed supplier bill.
- Use the repository's accepted exact-money representation; choose integer minor units or exact decimals consistently. Provider cost may need sub-TZS precision, with an explicit retail rounding policy. Avoid binary floating-point accumulation.
- Available funds must exclude reservations. Enforce sufficient funds and unique operation identities transactionally under concurrent calls. Preserve linkage to the existing financial accounting treatment approved by the accounting owner; do not treat every top-up as earned service revenue.

### Operation flow

`quote/maximum consent → reserve atomically → durable dispatch → provider call → capture actual charge or release known-unused funds → reconcile uncertain outcomes`

Do not hold a database transaction open over a network request. Reuse the existing durable job/outbox pattern. Use provider idempotency keys where supported. A timeout after sending is UNKNOWN, not proof the provider did nothing: retain the appropriate reservation and reconcile using the operation reference before retry/refund. If a provider charges for failed attempts, apply the agreed charge rule and disclose it; “failed” does not universally mean “free.”

For variable-cost AI, bound the request before dispatch using maximum tokens/tool budget and the approved spending ceiling. Stop or obtain further consent before exceeding the authorized ceiling. Do not allow parallel requests to overspend a stale balance.

Top-ups become spendable only after authenticating the callback and independently verifying reference, tenant association, amount, currency and successful payment with the real gateway. Browser redirects alone do not fund balances. Recover from crashes between recording a webhook and completing settlement.

Add customer statements, pending reservations, receipts/charges, low-balance notices, failed/uncertain operations and a permission-gated reconciliation console. Preserve audit trails; no arbitrary unlogged balance edits.

Acceptance: concurrent overspend prevention; duplicate/out-of-order callbacks; provider timeout-after-success; process crash/restart; late settlement; under/over-estimates; refund/chargeback; insufficient funds; cross-tenant IDs; immutable statements; ledger/accounting reconciliation. Use real local database tests and controlled adapters; label sandbox tests accurately.

## Phase 3 — provider ownership and metering rollout

First inventory every actual external call path, including scheduled jobs and older app-specific implementations. Roll out one supported provider/service at a time behind tenant/service flags; block unmanaged unmetered spend paths before enabling managed consumption.

- Reuse existing encrypted credential storage and OAuth flows. Never place keys in browser storage, API responses, logs or analytics.
- Resolve customer-owned versus Hudumika-managed credentials explicitly. Record ownership for every operation.
- BYOK must not silently fall back to a chargeable platform key on expiry/error. Display ownership, quota and operational failures honestly. Any platform fee for BYOK requires an explicit separate pricing rule.
- Migrate existing AI credits without inventing a TZS conversion: preserve historical entries; use an approved grandfathering/allowance policy and reconcile the transition.
- Integrate only existing supported adapters for AI/SMS/tracking/OCR/storage/etc. NIDA, BRELA, VFD, registrar or carrier names in the plan do not prove an API contract exists. Document unsupported providers and keep them unavailable rather than building a fake integration.
- Storage overages and annual domains have recurring charge/ownership lifecycles; do not force them through an inappropriate per-request billing flow. Keep them separately disclosed even when using shared settlement components.

Acceptance: per-provider success/failure/retry accounting, key rotation/revocation, ownership isolation, real sandbox contract where available, disclosed prices and historical statement consistency.

## Phase 4 — onboarding, implementation services and support economics

- Present a small number of industry-oriented entry journeys rather than an overwhelming app catalogue.
- Connect package selection, first useful workflow, import validation, invitations and help to activation checkpoints.
- Record implementation/migration scope, quote, consent, delivery and invoice using existing CRM/Projects/Finance capabilities. Keep ordinary included setup separate.
- Add support-time attribution and loaded hourly cost configuration; distinguish included support, paid implementation and sales assistance. Record actuals, not the plan's cost assumptions.
- Enable authorized staff to configure existing features without tenant-specific code forks.

Acceptance: representative logistics/distribution/retail/service journeys; bounded bad imports; repeat imports; clear included/paid work; accessible mobile onboarding; accurate support attribution and privacy permissions.

## Phase 5 — commercial analytics and operating dashboard

Reuse HuduBI/analytics/event conventions and authoritative billing/payment sources. Define each metric before implementing charts:

| Metric | Required definition |
| --- | --- |
| Paying workspaces | Paid subscription state from confirmed settlement, excluding tests/free/demo workspaces, with cancellation/refund policy |
| MRR/ARR | Recurring subscription value; normalize annual contracts by 12; separate cash collection, taxes, one-off services and prepaid top-ups |
| Retention | Dated paying/activation cohorts, 30/90/180/365-day windows; show immature cohorts as not yet measurable |
| Churn/upgrades | Explicit customer/revenue and plan-transition definitions; distinguish expired trials, involuntary failure and deliberate cancellation |
| Acquisition cost/payback | Attributed actual acquisition spend and gross contribution; show unavailable when attribution or cohort maturity is insufficient |
| Subscription margin | Actual subscription revenue and allocated relevant costs; allocation method/version visible |
| External-service margin | Actual earned service charges versus reconciled provider costs; estimates and unbilled operations separated |
| Support cost | Attributed support minutes × configured loaded cost; avoid silently treating missing time as zero |
| Active apps | Meaningful successful product actions per workspace/window; page views alone do not establish use |
| Provider reliability | Success/failure/unknown/retry rates by service and provider; linked to cost and reconciliation |
| Runway | Explicit actual/forecast cash assumptions and as-of dates, not a fabricated live metric |

Store the HTML's growth/cost cases as labelled editable planning scenarios, separate from actuals. Funding thresholds are decision-support indicators, not automatic certification or autonomous fundraising instructions. Alerts may flag missing targets; they must not automatically stop customer acquisition or change prices without an authorized business policy.

Acceptance: fixture-based reconciliation of all formulas, annual normalization, delayed/refunded payments, cohort maturity, missing data, tenant/platform permissions and reporting timezones. Platform-wide analytics must use the narrow authorized platform access path, never broad tenant bypass in ordinary routes.

## Phase 6 — staging, release and commercial rollout

Run typecheck, relevant API integration suites and actual browser journeys. Exercise a full scenario:

`signup → package → monthly/annual invoice → verified payment → quotas → provider ownership → top-up → reservation → usage → capture/reconciliation → statement → renewal/upgrade → margin/retention reports`

Also test declined/duplicate/late payments, gateway/provider outage, depleted balance, plan downgrade, revoked keys, customer data isolation, worker restarts, backup/restore and supported mobile widths. Do not weaken tests to obtain green output.

Validate on Contabo staging using the prepared deployment assets and genuine configured providers. Passing local compilation is insufficient. Never send real messages, purchase domains or charge customers merely to demonstrate a test; arrange a supported sandbox or explicit live-operation authorization.

Use a controlled tenant pilot with reconciliation and rollback plans. Keep historical data and avoid destructive plan migration. Measure genuine onboarding/support time and first renewals. Software can support the 25–50 / 100 / 250-customer milestones; it cannot manufacture those outcomes.

## Reporting after each phase

Provide changed paths, migrations/backfill, behavior before/after, exact test results/skips, browser evidence, remaining policy/provider dependencies, release risks and the next runnable milestone. Update the closure ledger and Hudumika memory with qualified statements. Stage only your own paths if a commit is requested. Do not claim commercial success or production certification from feature implementation.

## Recommended first coding milestone

Implement the approved draft catalogue and server-enforced package/limit model with legacy-contract preservation and a documented annual-billing design. In parallel at the design level, specify the external-service ledger invariants and test cases. Ship the ledger before wiring multiple paid providers; then migrate one actual supported service end to end. Do not attempt all 25 commercial-plan sections as one unreviewable change.
