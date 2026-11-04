# Implementation Status — Hudumika Platform Integration

**Current phase:** E in progress (A+B+C+D complete)
**Last updated:** 2026-11-03T14:00+03:00
**Branch:** master (uncommitted — preserving existing dirty files from SEAL/Inventory/ComplyOS sessions)

## Phase A — Baseline + App Registration + Domain Tables ✅

### Source inspection
- [x] Cloned all 4 repos into `.source-staging/`, pinned in SOURCE_LOCK.json
- [x] Tuma inspection: 45 Prisma models, ~170 endpoints, 6-state parcel lifecycle, float system
- [x] LexCore/Ngao inspection: ~35 Prisma models, ~145 endpoints, 31 route modules, 38 pages
- [x] Confirmed LexCore and Ngao differ in exactly 5 files (all billing/config) — ADR-001
- [x] SOURCE_FEATURE_MATRIX.md + ADRS.md (8 ADRs) written

### App registration (all 4 apps)
- [x] AppId type union: `tuma`, `lexcore`, `ngao`, `gereji` added to ALL_APP_IDS
- [x] Feature keys: 11 new keys (tuma, tuma.dispatch, tuma.settlement, lexcore, lexcore.trust, lexcore.conflicts, ngao, ngao.dpia, ngao.incidents, gereji, gereji.warranty)
- [x] APP_LABELS, APP_COLORS, APP_PALETTE_SLOT, APP_ICONS, slogans — all registered
- [x] navConfigs entries (empty — shells own their sidebar nav)
- [x] LAUNCHER_APPS + LAUNCHER_SVG_ICONS + LAUNCHER_APP_META — all 4 apps visible in launcher
- [x] APP_META in WorkspaceHome — all 4 apps visible on landing page grid

### Frontend — shells + pages
- [x] TumaShell: 7 pages (Overview, Parcels, Agents, Float, Fleet, Offices, Settlement)
- [x] LexCoreShell: 12 pages (Overview, Clients, Matters, Court Diary, Deadlines, Documents, Time Entries, Disbursements, Invoices, Trust Accounts, Conflicts, Fee Earners)
- [x] NgaoShell: 8 pages (Overview, Assessments, Registers, Consent, Incidents, Rights, Vendors, Alerts)
- [x] GerejiShell: 5 pages (Overview, Job Cards, Vehicles, Estimates, Warranty)
- [x] All 4 lazy-loaded in App.tsx via React.lazy()
- [x] Web typecheck passes clean

### API routes
- [x] tuma.routes.ts: 6 GET endpoints (parcels, agents, fleet, offices, float, settlement)
- [x] lexcore.routes.ts: 12 GET endpoints (matters, time-entries, trust-accounts, conflicts, clients, court-cases, court-events, deadlines, disbursements, invoices, fee-earners, documents)
- [x] ngao.routes.ts: 7 GET endpoints (assessments, registers, incidents, consent, alerts, vendors, rights-requests)
- [x] gereji.routes.ts: 4 GET endpoints (job-cards, vehicles, estimates, warranty)
- [x] All registered in index.ts with `/v1/{app}` prefix
- [x] All use `withTenant()` + explicit `tenant_id` WHERE + `requireEntitlement()`

### Database migrations
| Migration | Domain | Tables | Notes |
|-----------|--------|--------|-------|
| 656 | Tuma parcel logistics | 19 tables | parcel_types through user_shifts, full RLS |
| 657 | Legal/Privacy core | 8 tables | legal_clients/matters/time_entries/trust/conflicts + privacy_assessments/incidents |
| 658 | Gereji automotive | 3 tables | estimates, estimate_lines, warranty_claims (extends mig 621) |
| 659 | Entitlement seeds | 0 (seed data) | package_features, app_status, industry_registry entries |
| 660 | Legal/Privacy extended | 15 tables | court_cases/events/deadlines/disbursements/invoices/docs/KYC/certs/partner_capital + alerts/vendors/rights_requests + holidays |
| 661 | Industry composition | 0 (seed data) | industry_app_capabilities mappings for legal/privacy/logistics/automotive + logistics industry_registry entry |
| 662 | TZS tier grants | 0 (seed data) | package_features for business-tzs and scale-tzs tiers |
| 663 | Industry draft packages | 0 (seed + DDL) | default_package_code column + 4 draft packages |
| **Total** | | **45 new tables** | All RLS-enabled + FORCE RLS |

### Kysely Database interface
- [x] All 45+ table type definitions added to `apps/api/src/db/client.ts`
- [x] API typecheck: 0 errors in new code (33 pre-existing in other sessions' files)
- [x] Web typecheck: clean

## Phase B — Commercial Catalogue ✅

- [x] Migration 661: industry_app_capabilities mappings (4 industries, 22 app-capability rows)
- [x] Migration 662: TZS tier feature grants
- [x] Migration 663: Industry solution draft packages (legal-tzs, logistics-tzs, automotive-tzs, privacy-tzs — all `is_active = false`), `default_package_code` column on `industry_registry`
- [x] COMMERCIAL_MODEL.md documenting catalogue structure, feature key registry, entitlement resolution, industry composition
- [x] API typecheck: 0 new errors (33 pre-existing unchanged)

## Phase C — Vertical Slices ✅

### CRUD routes implemented
- [x] **LexCore** (legal.routes.ts): Full CRUD — clients, matters, time entries, trust accounts, conflict checks/clear, court cases/events, deadlines; state machine transitions
- [x] **Tuma** (tuma-parcels.routes.ts): Full lifecycle — receive (POST), dispatch, offload, deliver, cancel; tracking records; state machine with PARCEL_TRANSITIONS; paginated list with filters
- [x] **Ngao** (ngao-crud.routes.ts): Full workflows — create DPIA + status transitions, register processing activity, log incident + status transitions, data subject rights requests + respond, vendor management
- [x] **Gereji** (gereji-crud.routes.ts): Full lifecycle — create estimate with line items + auto-totals, send/approve/reject/convert; estimate→job card conversion (creates parent finance_industry_work + child finance_job_cards); warranty claims with review workflow
- [x] All 3 new CRUD route files registered in index.ts under same `/v1/{app}` prefix as read-only routes
- [x] API typecheck: 33 pre-existing errors unchanged, 0 new errors

### Golden path coverage
| App | Golden path | Status |
|-----|-------------|--------|
| Tuma | Receive → dispatch → offload → deliver | ✅ Full lifecycle with tracking |
| LexCore | Open client → open matter → record time → trust account | ✅ Client + matter + time entry + trust CRUD |
| Ngao | Run DPIA → register activity → log incident → rights request | ✅ All workflows with state machines |
| Gereji | Estimate → approve → convert to job card → warranty claim | ✅ Estimate lifecycle + FinOps job card bridge |

### Frontend pages wired to API (32 pages)
- [x] **Tuma** (7 pages): Overview dashboard, Parcels (full CRUD + tracking + state transitions), Agents, Fleet, Offices, Float, Settlement — 19 apiFetch calls
- [x] **LexCore** (12 pages): Overview dashboard, Clients (list + create), Matters (list + create + status transitions + expand detail), Court Diary, Deadlines (with complete action), Documents, Time Entries (list + log), Disbursements, Invoices, Trust Accounts (list + create), Conflicts (search + clear), Fee Earners — 36 apiFetch calls
- [x] **Ngao** (8 pages): Overview dashboard, Assessments (create + 5-state transitions), Registers (create), Consent, Incidents (create + 6-state transitions), Rights (create + respond), Vendors (create), Alerts — 31 apiFetch calls
- [x] **Gereji** (5 pages): Overview dashboard, Job Cards, Vehicles, Estimates (create with dynamic line items + status transitions + convert to job card), Warranty (create + review workflow) — 21 apiFetch calls
- [x] Web typecheck: 0 errors

## Phase D — Industry Composition ✅

### Backend wiring
- [x] `GET /v1/industry-registry/:key/solution` — returns industry entry + core/optional apps + recommended package
- [x] `GET /v1/onboarding/industries` — public endpoint for signup industry picker
- [x] `onboarding.service.ts` — auto-activates tenant's industry post-signup (non-blocking)
- [x] `activation.service.ts` — `listJourneys()` JOINs `industry_registry` for `recommended_package_code`

### Frontend wiring
- [x] `OnboardingJourney` type updated with `recommended_package_code: string | null`
- [x] `StepCompany.tsx` — selecting a journey auto-sets `draft.package_code`
- [ ] Admin panel industry management UI (future — not blocking)

## Phase E — Cross-App Integration (in progress)

### Backend bridges — GL posting
- [x] Gereji estimate→job card conversion bridges to FinOps via `finance_industry_work` + `finance_job_cards`
- [x] All apps use platform auth (`request.user.sub`), entitlements (`requireEntitlement()`), tenant isolation (`withTenant()`)
- [x] LexCore trust deposit/disburse → GL (DR/CR Bank 1010 ↔ Trust Liability 2700) — `legal.routes.ts`
- [x] LexCore trust transaction listing per account — `GET /v1/legal/trust/accounts/:id/transactions`
- [x] Tuma float settlement → GL (DR Float Liability 2710 / CR Revenue 4600) — `tuma-parcels.routes.ts`
- [x] Tuma float replenishment → GL (DR Bank 1010 / CR Float Liability 2710)
- [x] Migration 664: Cross-app GL accounts (2700 Trust, 2710 Float, 4400 Legal Revenue, 4600 Parcel Revenue) backfilled

### Backend bridges — Inventory
- [x] Gereji parts issue from job card → InventoryService.recordMovement() — `POST /v1/gereji/job-cards/:id/issue-part`
- [x] Gereji job card parts listing — `GET /v1/gereji/job-cards/:id/parts`

### Frontend cross-app deep links
- [x] LexCoreTrustAccounts: deposit/disburse dialogs, transaction history expand, "View in FinOps" link
- [x] GerejiJobCards: action menu with "View costs in FinOps", "Issue parts from Inventory", "Back to Estimates"
- [x] GerejiEstimates: "View Job Card" and "View costs in FinOps" links on converted estimates
- [x] TumaFloat: replenish/settle dialogs, "View in FinOps" link

### Remaining
- [ ] LexCore deadlines → Calendar event creation (cross-app link)
- [ ] Cross-app notification hooks (Studio workflow triggers)
- [ ] Retail/Distribution composition (POS + Inventory + Purchasing + FinOps)

## Phase F — Shadow-Test Billing (not started)

## Phase G — Cross-Product Regression (not started)

## Build Status

| Check | Result | Notes |
|-------|--------|-------|
| `npx tsc --noEmit` (web) | ✅ 0 errors | Clean |
| `npx tsc --noEmit` (api) | ⚠️ 33 errors | All pre-existing from SEAL/Inventory/ComplyOS sessions |
| New code errors | ✅ 0 | No regressions from this implementation |
