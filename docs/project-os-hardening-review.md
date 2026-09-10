# Project OS — hardening review

- **Round 1** (below): migration 448 + `project-os.ts`.
- **Round 2**: the API/service layer — `project-os.routes.ts`, 5 service files, `client.ts` (448 table types).
- **Round 3** (this section): the 9 frontend pages in `apps/web/src/pages/projects/` that sit on top of Round 2's API.

---

# Round 4 — the working Projects app was rewritten and shipped broken to `master`

**Status change:** commit `756ff13f` ("feat: implement CRM deals, multi-entity labeling system, and project governance modules…") landed everything — migration 448, the `/v1/project-os` API, the 9 new frontend pages, `client.ts`, **and a rewrite of the existing Projects app shell/UI** — onto `master`. Round-1 P0-2 (untracked migration) is resolved by the commit, but none of the P0/P1 findings from Rounds 1–3 were addressed first, so the Project OS layer is now in the mainline history in its non-functional state. It also got merged into one commit with unrelated CRM work.

`git diff 460a13b2 756ff13f` on the Projects app: `ProjectsApp.tsx` 2094 lines changed (net −276), `ProjectsShell.tsx` rewritten.

### RG-1 · The Projects app now opens on a permanent loading spinner (P0 — shipped regression)

`ProjectsShell.tsx` new default route:
```
<Route index element={<ProjectsApp initialMode="command_center" />} />
```
`ProjectsApp` renders `<ProjectCommandCenter>` for `command_center` mode → it calls `GET /v1/project-os/command-center` → 500 (`.sum('projects.current_budget')`, column doesn't exist — Round 2) → `catch { setData(null) }` → the render branch shows `"Loading Project OS Command Center…"` forever (Round-3 F8: failed and loading are indistinguishable). **Every user opening `/projects` now sees an indefinite spinner instead of their project list.** The working project list still exists but was demoted to `/projects/all` ("Projects Directory" in the new nav).

### RG-2 · New top-level nav destinations are dead

`ProjectsShell.tsx` nav: **Command Center** (RG-1), **Portfolios & Programs** (`/projects/portfolios` → `ProjectPortfolios`, all `/v1/project-os/portfolios|programs` calls 500), **Heavy Machinery & Fleet** (`/projects/resources` → `ProjectResources`, `/v1/project-os/resources` 500). 2 of the 3 "Executive & Strategy" nav items lead nowhere. "Contracts & Tenders" (`<Contracts/>`) is unchanged and fine.

### RG-3 · Five new project-detail tabs are dead, but the working ones survived

`ProjectsApp.tsx`'s `tab` union kept all 11 original tabs (`overview`, `board`, `gantt`, `timesheets`, `files`, `discussions`, `tickets`, `sales`, `activity`, `milestones`, `members`) — those still hit `/v1/tasks/projects/*` and work. It **added** `wbs_schedule`, `financials_evm`, `governance`, `procurement`, `industry_pack` (lines 1266–1292) rendering the Round-3 components against `/v1/project-os/*` → all 500. So opening a project is fine; clicking any of the 5 new tabs is broken. The `2094`-line diff is mostly this reorg (extracting `ProjectCreateModal`, adding the `appViewMode` switch), not deletion of working features — verified the detail-tab code paths survived.

### RG-4 · `ProjectCreateModal` — portfolio/program pickers silently always empty

`ProjectCreateModal.tsx:59-60` fetches `/v1/project-os/portfolios` + `/programs` on open (both 500 → `.catch(() => setPortfolios([]))`), so the "assign to portfolio / program" dropdowns never populate — no error shown, they just look like there are no portfolios. The actual create call (`:96`) is `POST /v1/tasks/projects` (the real, working endpoint), so **creating a project still works**, minus the portfolio linkage. (Also `:61` fetches `/v1/crm/customers` — confirm that's a real route; the platform's customer endpoint is `/v1/customers`.)

### Net effect for a real tenant on `master` today

- `/projects` → infinite spinner.
- 2 of 3 strategy nav items → broken pages.
- Project list, board, gantt, timesheets, milestones, files, discussions, invoicing (`sales` tab), members → **still work** (unchanged backend), reachable via `/projects/all`.
- Create project → works, portfolio/program linkage dead.

Recommend the reconciliation (Rounds 1–2) be treated as a `master` hotfix priority.

**Mitigation applied** (this session, `ProjectsShell.tsx` only): `/projects` index now renders `initialMode="projects_list"` (the working list); the Command Center / Portfolios / Resources views are kept routed (`/projects/command-center`, `/projects/portfolios`, `/projects/resources` — so the reconciliation work can test them) but removed from the nav. `npx tsc --noEmit` clean. To revert once `/v1/project-os` runs: restore the two-group `NAV` and `initialMode="command_center"` on the index route (a comment in the file spells this out). This addresses RG-1/RG-2 only — the API, RG-3/RG-4, and Rounds 1–3 are unchanged.

---

# Round 3 — frontend (`apps/web/src/pages/projects/`, 9 files, ~5,100 lines)

Static review only (no browser tool this session). Findings independent of Round 2's dead API — these are real regardless of backend status, and several will still be wrong once the schema is reconciled.

### F1 · Client-generated, collision-prone document numbers (P1)

`ProjectCreateModal.tsx:39`, `ProjectGovernance.tsx:64`, `ProjectIndustryPack.tsx:40,63`, `ProjectProcurement.tsx:47,54,61` all do `` `PRJ-${Math.floor(1000 + Math.random() * 9000)}` `` (same pattern for `CR-`, `RFI-`, `PN-`, `PR-`, `PO-`, `GRN-`) and type the result straight into the form field that becomes 448's `risk_code`/`req_number`/`po_number`/`grn_number`/… — every one of which is `NOT NULL UNIQUE`. A 4-digit range is ~9,000 values; two concurrent creates in the same project collide on a live UNIQUE constraint, client-side, with no server sequencing or retry. The platform already has `getNextDocNumber` (`lib/doc-numbering.js`) for exactly this — `task-projects.routes.ts` and the invoicing routes use it. These numbers should be server-generated the same way, not typed by the browser.

### F2 · No page uses `PageHeader` (P1 — CLAUDE.md: "no exceptions")

All 9 files hand-roll their own title block (e.g. `ProjectCommandCenter.tsx:94` `<h2 style={{fontSize:24,fontWeight:800,...}}>`, `ProjectIndustryPack.tsx:211`). None import `PageHeader`. This is brand-new code, not a legacy page inheriting the exemption — it loses the plain/Cormorant-italic identity and the per-tenant accent, and needs an individual fix per page instead of one shared component doing it everywhere.

### F3 · Hardcoded hex instead of design tokens — breaks dark mode and tenant theming (P1)

`ProjectCommandCenter.tsx` (24 raw hex literals) and `ProjectIndustryPack.tsx` (13) reimplement the platform's own green/amber/red/teal semantic palette as literal hex pairs instead of the CSS variables that already exist for this:

```
#dcfce7 / #bbf7d0 / #166534 / #15803d   →  var(--green-l) / var(--green)
#fef3c7 / #fde68a / #92400e / #b45309   →  var(--gold-l)  / var(--gold)
#fee2e2 / #fecaca / #991b1b / #b91c1c   →  var(--red-l)   / var(--red)
#ccfbf1 / #99f6e4 / #115e59 / #0f766e   →  var(--teal-l)  / var(--teal)
```
Plus Tailwind color utilities doing the same thing (`text-emerald-400`, `text-amber-400`, `text-rose-400` for CPI/SPI health). These are light-mode-only values — in dark mode they render as a bright pastel card sitting in a dark UI — and the teal ones can never pick up a tenant's actual brand colour the way `var(--teal)` does platform-wide. `FeaturedIcon`/`Badge` already read the derived tokens; these cards should too.

### F4 · Mislabeled metric — "Stage Gates Passed" displays the CRITICAL-health count

`ProjectCommandCenter.tsx:198-202` — a teal, good-news-styled "STAGE GATES PASSED · Executive approved" tile is bound to `data.health_distribution.critical`. `ProjectCommandCenterMetrics.health_distribution` only has `green/amber/red/critical`; there is no stage-gate count in the payload anywhere. Whatever number of projects are in the *worst* health bucket is currently shown, styled as an achievement. Independent of Round 2 — will still be wrong once the API works.

### F5 · Fabricated DORA metrics in the IT/DevOps industry pack (P0 — brief Part 58 forbids fake analytics)

`ProjectIndustryPack.tsx:679-693`, the "IT Sprint & DORA Cockpit":
```
DEPLOYMENT FREQUENCY     → "Daily (Elite)" / "2.4 production builds / day"
LEAD TIME FOR CHANGES    → "3.2 Hours"
CHANGE FAILURE RATE      → "0.8%"
```
These are literal strings in JSX — not interpolated from `records`, `data`, or any prop. The section immediately below this one (`records.map(...)`) does render real data; these three tiles don't reference anything. This is worse than Round 2's `portfolioSpi = 1.02` (a real but hardcoded value): these were never computed at all.

### F6 · Hand-rolled modal instead of `Dialog` (P2)

`ProjectCreateModal.tsx` is a raw `position: 'fixed'` overlay (own header/body/footer comments at lines 137/165/357), not built on `ui/dialog.tsx`. New code, not a legacy page — loses Radix's focus trap/portal/outside-click handling and the shared visual bar, and can't be brought under the `size`/`steady` steady-dialog convention (see the design-system session's own work on `ui/dialog.tsx`) even though a multi-section create form is exactly the case that convention exists for.

### F7 · No `PersonAvatar`/`CompanyAvatar` anywhere (needs a closer pass)

Zero hits across all 9 files, despite portfolio/program owners, deliverable reviewers/approvers, PR requesters, risk/issue owners, and resource operators all being "who" fields CLAUDE.md's avatar rule covers. Didn't find a plain-text name render for these fields either in the patterns checked — worth a dedicated pass once the API returns real `*_name` fields to confirm whether assignees are rendered at all, and if so, how.

### F8 · A failed fetch and a slow fetch look identical — indefinite fake-loading spinner

`ProjectCommandCenter.tsx`'s `loadMetrics` catches any error from `/command-center` and sets `data: null`; the render branch shows the same "Loading Project OS Command Center…" spinner whenever `!data`, whether that's "still loading" or "failed permanently." Right now (Round 2) every call 500s, so the tile is stuck spinning forever with no error ever surfaced. This is a real UX gap independent of today's outage — a genuine timeout or network blip later will look identical to "still loading."

---

# Round 2 — the API layer is DOA against the real database

**Verdict: the entire `/v1/project-os` surface is non-functional.** Every write endpoint and most reads 500 on the actual schema. `npx tsc --noEmit` passes only because `client.ts` was hand-edited to type the 448 tables as the *intended* (never-migrated) design, so the compiler validates the code against a database that does not exist.

### Proof (live, against the dev DB)

```
ProjectOsService.createPortfolio  → ERROR: column "owner_id" of relation "project_portfolios" does not exist
ProjectOsService.getProjectDetail → ERROR: column "baseline_budget" does not exist
```

`client.ts:5825 ProjectPortfoliosTable` declares `owner_id`, `target_roi`, `allocated_budget`, `spent_budget`, `strategic_alignment`.
Real `project_portfolios` columns: `id, tenant_id, name, code, description, manager_id, status, target_budget, currency, start_date, end_date, metadata, created_at, updated_at`.

### R2-1 · Every service method targets phantom columns (P0)

| service method | writes/reads columns that don't exist | real column |
|---|---|---|
| `createPortfolio` / `listPortfolios` | `owner_id`, `target_roi`, `allocated_budget`, `spent_budget`, `strategic_alignment`; `status:'active'` | `manager_id`, `target_budget`; `status:'ACTIVE'` |
| `createProgram` / `listPrograms` | `program_manager_id`, `target_benefits`; `status:'active'` | `manager_id`; no `target_benefits`; `status:'ACTIVE'` (no `cancelled`) |
| `createPhase` / `listPhases` / `updatePhaseGate` | `sequence_order`, `gate_review_date`, `gate_approver_role`, `gate_criteria`, `gate_passed`, `notes`; `status:'not_started'`; `code` sent null | `phase_number`, `sort_order`, `progress_pct`, `description`; `status:'PLANNED'`; `code` is **NOT NULL** |
| `createWorkPackage` / `listWorkPackages` | `parent_id`, `lead_id`, `planned_start/end`, `planned_cost`, `actual_cost`, `earned_value`, `deliverables_summary`; `status:'draft'` | `manager_id`, `budget`, `start_date/end_date`, `progress_pct`; `status:'PLANNED'` |
| `createDeliverable` / `reviewDeliverable` | `title`, `sign_document_id`, `sign_package_id`, `contract_id`, `approved_by`, `attachments`; `status:'pending'`; **no `deliverable_type`** | `name`, `code` (NOT NULL), `owner_id` (NOT NULL), `deliverable_type` (NOT NULL), `document_id`, `reviewer_id`; `status:'DRAFT'` |
| `getProjectDetail` | `projects.baseline_budget`, `current_budget`, `actual_cost`, `earned_value`, `planned_value`, `progress_pct`, `location_address`, `latitude`, `longitude` | none of these exist on `projects`; 448 added `original_budget`, `approved_budget`, `location_name`, `location_coords`, `planned/actual_start_date`… |
| `getCommandCenterMetrics` | `.sum('projects.current_budget'/'actual_cost'/'earned_value')` | don't exist → 500 |
| procurement: `createRfq`, `createPurchaseOrder` | `project_rfq_suppliers.supplier_name`, `project_purchase_orders.supplier_name`, `payment_terms`, `incoterms`, `delivery_location`; `supplier_id` sent null | `supplier_id` is **NOT NULL REFERENCES suppliers(id)**; no `supplier_name`/`payment_terms`/… columns |
| resources: `createResource` | `make_model`, `license_plate`, `capacity_rating`, `cost_rate_hourly`, `cost_rate_daily`, `telemetry_id`; `resource_type:'heavy_machinery'` | `model_or_specs`, `serial_number`, `cost_rate`+`rate_unit`, `billing_rate`, `owner_vendor_id`; `resource_type:'HEAVY_MACHINERY'` |
| governance: `createRisk` | `probability`/`impact` as strings (`'likely'`,`'high'`); `strategy`, `review_date`; no `risk_code` | `probability`/`impact` are **`INTEGER CHECK 1–5`**; `risk_code` **NOT NULL UNIQUE** |
| governance: `createIssue` / `createChangeRequest` | `assigned_to`, `impact_cost`; `reason`, `scope_impact`; no `issue_code`/`change_code`/`original_scope`/`requested_change` (all NOT NULL) | `owner_id` (NOT NULL), `issue_code`/`change_code` (NOT NULL), `original_scope`+`requested_change`+`justification` (NOT NULL) |

**Fix — pick ONE schema, make all four layers agree, once:**
Given 448 is already applied and the code volume (routes + 4 services + `client.ts` + UI) all assumes the *other* design, the lower-churn path is a corrective **migration 449** that reshapes the (empty) 448 tables to the design the code expects — rename `manager_id`→`owner_id`, `target_budget`→`allocated_budget`, add `spent_budget`/`strategic_alignment`, add the `projects` financial columns (`baseline_budget`/`current_budget`/`actual_cost`/`earned_value`/`planned_value`/`progress_pct`/`location_address`/`latitude`/`longitude`), switch enums to lowercase, `risk.probability`/`impact` to a string domain or keep int and fix the service, add `project_purchase_orders.supplier_name` **only if** the free-text-supplier decision below is accepted. Then rewrite `client.ts` from the *actual* post-449 `information_schema`, not by hand. Re-run `project-os-isolation.test.ts` + a new create-one-of-everything smoke test.

### R2-2 · Zero member-level authorization on the entire surface (P0, security)

`grep resolveProjectAccess|project_members|canEditProject` across `project-os.routes.ts` + all 5 services → **no matches.** Every route is `authenticate` + `requireEntitlement('projects')` then straight into the service with `user.tenant_id`. Consequences:

- Any user in the tenant with the `projects` entitlement can read **and mutate** every project's risk register, change requests, budgets, procurement, deliverables — with no `project_members` row. The existing `task-projects.routes.ts` gates every `/:id/*` route through `resolveProjectAccess`; this parallel API discards that.
- `POST /approvals/:id/steps/:stepId/decision` records `user.sub` as the decider but never checks it matches the step's assigned `approver_user_id` / role. Anyone approves any step — the "reusable approval engine" (brief Part 16) has no approver check.
- `PATCH /phases/:id/gate`, `PATCH /risks/:id/status`, `PATCH /deliverables/:id/review` — governance-state mutations, no role gate. Anyone passes their own stage gate / approves their own deliverable.
- Portfolio/program still have no access model (round-1 P1-2, unaddressed).

**Fix:** a shared `requireProjectScope(entityTableOrParam)` preHandler that resolves `project_id` (direct param, or via the entity row) and calls `resolveProjectAccess(user, projectId)`, refusing non-members and enforcing edit vs. view. `submitApprovalDecision` must verify the caller owns the step. Add `portfolio_members`/`program_members` + resolvers.

### R2-3 · Fabricated metric in the Command Center (P0 per brief Part 17 "do not fake these calculations")

`project-os.service.ts:638` — `const portfolioSpi = totalEv > 0 ? 1.02 : 1.0;`
Portfolio SPI is hardcoded to **1.02**. It is displayed as a real KPI. The brief explicitly forbids this. Compute it from real PV/EV across the portfolio's projects, or omit the tile until the inputs exist.

### R2-4 · Free-text supplier bypass (P1, undermines the platform)

`createRfq` / `createPurchaseOrder` accept `supplier_name: string` and write it to columns that don't exist; `supplier_id` is optional in the zod schema but `NOT NULL REFERENCES suppliers(id)` in the DB. This bypasses the real `suppliers` table, the PO-Suppliers app, and supplier-performance tracking (brief Part 18). 448 modelled it correctly (FK to `suppliers`). Keep the FK; the create endpoints should take `supplier_id` (required) with an inline "create supplier" affordance that writes a real `suppliers` row, exactly as `EntityPicker` does elsewhere.

### R2-4b · Full read of all 5 service files (coverage note)

All of `project-os.service.ts`, `project-governance.service.ts`, `project-procurement.service.ts`, `project-resources.service.ts`, `project-industry.service.ts` have now been read in full. The drift is uniform — every insert/select in every method targets the `project-os.ts` design, not the applied 448 schema, so **every endpoint 500s** (matches the live proof in R2-1). Two additional bugs that are *independent of the drift* and will still be wrong after reconciliation:

- **`project-procurement.service.ts:createGoodsReceipt`** sets the parent PO to `status: 'received'` — not a member of any PO status enum (drifted *or* real DB); and there's no check the PO belongs to the project.
- **`project-resources.service.ts:createAllocation`** sets the resource to `status: 'allocated'` on every allocation, with **no release/de-allocation path anywhere in the service** and **no overlap check** — so a resource is `ALLOCATED` forever after its first allocation, and unlimited conflicting allocations of the same machine/person are allowed. This directly defeats brief Part 19's "which machine is overallocated / which employee is on conflicting projects", and makes `getCommandCenterMetrics`' machinery-utilisation % a number that only ever rises.
- **`project-industry.service.ts:createRecord`** never provides `entity_type` / `entity_code` / `title` — all three `NOT NULL` in the real table — so it cannot succeed even once the column names are fixed; the EAV table's own required shape isn't satisfied (see round-1 P1-1).

### R2-5 · Smaller issues

- `project-os.routes.ts:210,638` — `ProjectDeliverablesService` is a bottom-of-file wrapper function called **without `await`**; `reply.code(201).send(deliv)` serializes a pending Promise → client gets `{}`.
- No pagination on any `list*` — `listRisks`, `listWorkPackages`, `listDeliverables`, `listAllocations` return the whole set (brief Part 53).
- No audit/activity log on any mutation (brief Part 41). `task-projects.routes.ts` writes `project_activity_log` on every change; this API writes nothing.
- `getCommandCenterMetrics` filters `resource_type in ['heavy_machinery','equipment']` and `rfqs.status = 'issued'` — lowercase vs the DB's UPPERCASE — so these silently return 0 rather than erroring. Wrong, not loud.
- `updatePhaseGate` / `reviewDeliverable` set `updated_at: new Date()` manually — fine, but inconsistent (most other methods don't), and there's no DB trigger.
- `industry-data` `POST` body has no `entity_code`/`title` but the DB requires both NOT NULL — `ProjectIndustryService.createRecord` must be generating them; if not, every insert fails. (Confirms round-1 P1-1: the EAV table's own required shape is already awkward to satisfy.)

---

## Executable form of this section

`apps/api/src/tests/project-os-smoke.test.ts` — 23 tests, all green today. Every `it.fails(...)` drives a real request through the real Fastify app against every create/read endpoint listed above and asserts the response it *should* give; it passes now because the endpoint 500s exactly as documented (confirmed live, e.g. `column "action_by" of relation "project_approval_steps" does not exist`). The moment the schema reconciliation lands, each one flips to a real failure — delete `.fails` on that line and confirm it's green, endpoint by endpoint. The plain `it()` cases (cross-tenant isolation, the entitlement grant) are safety invariants that must hold regardless and already do.

## Recommendation

This is not a "harden a few rough edges" situation — the Project OS API/UI layer does not run. Before it's built on further:

1. Reconcile the schema (R2-1) — one migration 449, `client.ts` regenerated from `information_schema`, services/routes updated to match. This is Antigravity's to do (it authored all of it); this session can supply the exact field map and the smoke-test harness.
2. Add `requireProjectScope` + approval-step ownership (R2-2) before any of it is exposed.
3. Delete the hardcoded SPI (R2-3).
4. Decide free-text vs. FK suppliers (R2-4) — recommend FK.
5. Commit 448 + the new files (round-1 P0-2 — **still uncommitted**).

Until (1)+(2), `apps/web/src/pages/projects/` and the `ProjectsApp.tsx` changes have no working backend.

---

# Project OS — hardening review (round 1)

Reviewer pass over the concurrent Project OS foundation as of `master` @ `460a13b2` + uncommitted working tree.
Scope of this round: **migration `448_project_os_core_and_governance.sql`** (22 new tables, applied to the dev DB) and **`packages/types/src/project-os.ts`** (589 lines, uncommitted).

Verification artefact: `apps/api/src/tests/project-os-isolation.test.ts` — 23 tests, all green. Proves 448's `tenant_isolation_policy` is load-bearing through the real `hudumika_app` role and pins the DB's real enum/CHECK contract.

Ranked most-severe first. Nothing here has been auto-fixed — the touched files are being actively edited by the other agent (role split: this session reviews, does not co-edit those files).

---

## P0-1 — `project-os.ts` and `448.sql` are two different schemas of the same system

The types file was authored independently of the migration and reconciled with neither the DB nor the platform's conventions. **Every service written against `project-os.ts` will 500 against the applied schema.** This blocks all forward progress and must be resolved before any Project OS service/route is written.

Representative field-level divergence (not exhaustive — the pattern holds for all 12 entities in the file):

| entity | `448.sql` — **applied to the DB, ground truth** | `project-os.ts` — **wrong, will fail** |
|---|---|---|
| **portfolio** | `manager_id`, `target_budget`, `start_date`, `end_date`; `status ∈ {PLANNING, ACTIVE, ON_HOLD, COMPLETED, ARCHIVED}` | `owner_id`, `target_roi`, `allocated_budget`, `spent_budget`, `strategic_alignment`; `status ∈ {active, planning, on_hold, archived}` |
| **program** | `manager_id`, `budget`; `status` UPPERCASE | `program_manager_id`, `target_benefits: string[]`; `status` lowercase |
| **phase** | `code` **NOT NULL**, `phase_number`, `progress_pct`, `sort_order`; `status ∈ {PLANNED, IN_PROGRESS, REVIEW, COMPLETED, ON_HOLD}` | `code?` nullable, `sequence_order`, `gate_review_date`, `gate_approver_role`, `gate_criteria`, `gate_passed`, `notes`; `status ∈ {not_started, in_progress, under_review, completed, on_hold}` |
| **work_package** | `manager_id`, `budget`, `start_date`/`end_date` | `parent_id`, `lead_id`, `planned_start/planned_end/actual_start/actual_end`, `planned_cost`, `actual_cost`, `earned_value`, `deliverables_summary`; lowercase status |
| **deliverable** | `name`, `code` **NOT NULL**, `deliverable_type` **NOT NULL** (CHECK: DRAWING/REPORT/SOFTWARE_BUILD/…), `reviewer_id`, `delivered_date`, `document_id → cloud_files`, `version`, `is_client_visible`; `status ∈ {DRAFT, INTERNAL_REVIEW, CLIENT_REVIEW, REVISION_REQUESTED, APPROVED, DELIVERED, REJECTED}` | `title` (not `name`), no `deliverable_type`, `approved_by/approved_at/rejection_reason`, `sign_document_id/sign_package_id/contract_id`, `attachments`; `status ∈ {pending, in_progress, submitted, approved, rejected}` |
| **cost_code** | `category ∈ {LABOUR, MATERIALS, EQUIPMENT, SUBCONTRACTOR, TRANSPORT, PROFESSIONAL_SERVICES, OVERHEAD, CONTINGENCY, OTHER}` | `category ∈ {labor, material, equipment, subcontract, overhead, other}` + `is_active` |
| **budget** | `version: int`, `total_amount`, `baseline_approved_at/by`; `status ∈ {DRAFT, SUBMITTED, ACTIVE, SUPERSEDED, ARCHIVED}` | `baseline_budget`, `revised_budget`, `contingency_reserve`, `management_reserve`, `approved_by/at`; lowercase status |
| **budget_line** | `planned_amount`, `committed_amount`, `actual_amount` | `unit_of_measure`, `planned_qty`, `planned_unit_rate`, `actual_qty`, `forecast_at_completion`, `variance` |
| **evm_snapshot** | `planned_value`, `earned_value`, `actual_cost`, `cost_variance`, `schedule_variance`, `cpi/spi/bac/eac/etc/vac` | `pv/ev/ac/cv/sv` (abbreviated names), `+ tcpi`, `+ notes` |
| **risk** | `probability: int 1–5`, `impact: int 1–5`, `score: int`, `severity`, `risk_code`, `financial_exposure`, `schedule_exposure_days`, `mitigation_strategy`, `contingency_plan`, `trigger_condition`; `status ∈ {IDENTIFIED, ANALYZING, MITIGATING, MONITORING, OCCURRED, CLOSED}` | `impact`/`probability` as **string** enums, `ProjectRiskStrategy`; `status ∈ {open, monitoring, mitigated, closed}` |
| **health** (`projects.health_status`) | CHECK `∈ {GREEN, AMBER, RED}` | `ProjectHealthStatus = 'green' | 'amber' | 'red' | 'critical'` — **`critical` and lowercase both rejected by the DB** |

### Fix

1. **Anchor on the applied DB schema (448).** It cannot be silently changed — it's already in `_migrations` on the dev DB.
2. **Rewrite `project-os.ts` field-for-field against 448.** Match column names, nullability, and the exact CHECK string sets (UPPERCASE). The isolation test's "schema contract" block encodes the values to match.
3. **Then, one corrective migration `449_project_os_core_followups.sql`** to fold in the genuinely better ideas from the types draft that 448 lacks, rather than losing them:
   - `project_work_packages.parent_id UUID REFERENCES project_work_packages(id)` — recursive WBS (the brief's WBS section needs nesting deeper than phase → WP).
   - `project_evm_snapshots.tcpi NUMERIC(8,4)` — To-Complete Performance Index; trivial to compute, standard EVM output.
   - `project_phases`: `gate_review_date DATE`, `gate_passed BOOLEAN DEFAULT false`, `gate_criteria JSONB` — phase-gate governance (Part 7 "gates").
   - `project_budget_lines`: `unit_of_measure`, `planned_qty`, `planned_unit_rate`, `forecast_at_completion` — required for BOQ / measured-works valuation in the Construction pack (Part 21).
   - `project_deliverables`: `sign_envelope_id UUID` (link to the existing Sign app — Part 10 "digital signatures"), `is_client_visible` already exists.
4. **Do not** try to reconcile by editing both files toward a compromise — pick 448 as the anchor, one direction only.

---

## P0-2 — migration 448 is applied to the DB but the file is untracked

`_migrations` has the `448_...` row and all 22 tables exist, but `git status` shows `?? apps/api/src/db/migrations/448_project_os_core_and_governance.sql` (plus `?? packages/types/src/project-os.ts`). A `git stash` / `git checkout .` / branch switch deletes the file while the DB keeps the migration row → `migrate.ts` reports "up to date", a fresh clone can never reproduce the schema, and the next migration author has no 448 to read.

### Fix
`git add` + commit `448_...sql` and `project-os.ts` **now**, before any more work lands on top. (Same applies to the uncommitted CRM migs 445–447 and `deals.routes.ts` / `Pipeline.tsx`.)

---

## P1-1 — `project_industry_data` is a single JSONB EAV table for all 14 industry packs

```
project_industry_data(industry, entity_type, entity_code, title, data JSONB, status)
```
One table holds BOQ items, RFIs, daily site logs, inspections, NCRs, punch-list items, BOMs, work orders, sprints, logframe indicators, SOP validations, … for every pack. This directly contradicts the brief ("Industry-specific tables should extend the core rather than pollute it") and won't support the queries the packs actually need:

- Construction valuation: `SUM(qty × rate)` over BOQ lines filtered by work package and measurement period — impossible to index or aggregate efficiently inside `data JSONB`.
- Per-line EVM roll-up from BOQ → budget_line → work_package.
- RFI SLA / overdue reporting, NCR-by-discipline, punch-list-by-zone.
- Pharma: an **immutable** audit trail on batch records / deviations / CAPA (Part 27) — a shared mutable JSONB row cannot give that.

### Fix
Keep `project_industry_data` **only** as a thin extension/attribute bag for genuinely low-volume, read-rarely pack config. Give the high-traffic pack objects real tables (`construction_boq_lines`, `construction_rfis`, `construction_daily_logs`, `construction_inspections`, `it_sprints`, `manufacturing_work_orders`, …), each `tenant_id` + `project_id` + RLS, shipped per-pack migration. This is a design decision to make **before** the Construction pack (Part 21) starts, not after.

---

## P1-2 — the new hierarchy has RLS but no intra-tenant access model

`resolveProjectAccess` (the `project_members` roster in `task-projects.routes.ts`) is the platform's authorization gate for a project. Nothing analogous exists for `project_portfolios`, `project_programs`, `project_phases`, `project_work_packages`. Test `portfolios/programs/phases: … any member of tenant A still sees every portfolio` currently **passes** — a `JUNIOR` user with no project relationship reads a "Confidential M&A Portfolio" purely because RLS is tenant-wide.

For the target industries this is a real leak: a subcontractor PM added to one project would see the whole tenant's portfolio budgets, every other project's risk register, all change-request cost impacts.

### Fix
- Add `portfolio_members` / `program_members` (or a single polymorphic `project_scope_members(scope_type, scope_id, user_id, role)`), plus `resolvePortfolioAccess` / `resolveProgramAccess`, before the portfolio/program UI ships.
- Phase/work-package/deliverable/risk/issue/change/approval visibility should inherit from `resolveProjectAccess(project_id)` — every one of those tables has a `project_id`; the resolver just needs to be called in each route. Bake it into a shared `requireProjectScope(entityTable)` preHandler so it can't be forgotten per-route.
- The `is_client_visible` flag on deliverables and the client-portal filter (Part 32) must be enforced **server-side** in the same resolver, not in the frontend.

---

## P1-3 — parallel systems next to existing platform modules

448 introduces procurement and resource concepts the platform already has:

| 448 table | already exists |
|---|---|
| `project_purchase_requests`, `project_purchase_orders`, `project_goods_receipts`, `project_rfqs` | PO-Suppliers app (`purchase_orders`, `suppliers`, GRN flow), FinOps `expenses` |
| `project_cost_codes` | FinOps cost centres / chart of accounts |
| `project_resources` (PERSONNEL rows) | `users` / HR staff, `hr_*` |
| `project_budgets` / `project_budget_lines` | FinOps `budgets` / `budget_lines` (migration ~FinOps program) |

Two disconnected procurement systems means a supplier invoice raised in the PO-Suppliers app never touches `project_budget_lines.committed_amount`, so project EVM is wrong by construction.

### Fix
Decide per concept: **extend** the existing table with a nullable `project_id` / `work_package_id` (preferred for procurement, expenses, budgets — one source of truth, project rolls it up) **or** keep the project-scoped table but make it a real projection that writes through to the platform system (as `task-projects.routes.ts`'s existing `POST /:id/invoice` already does — it creates a real `sales_invoices` draft, it doesn't reinvent invoicing). `project_resources` for equipment/machinery/materials is legitimately new; `project_resources` rows of type `PERSONNEL` should reference `users(id)`, not duplicate a person.

---

## P2 — consistency

- **Enum casing.** Existing `projects.status` is lowercase-snake (`not_started`); all 22 new tables use `UPPERCASE` (`PLANNED`, `IDENTIFIED`, `SUBMITTED`). One table family, two conventions. Pick one (the platform-wide precedent is lowercase-snake — see `contacts`, `tasks`, `sign_*`, `hr_*`) and apply it in 449 while the tables are still empty.
- **`ProjectIndustry`** in `project-os.ts` lists `agriculture / transport / public_sector / aerospace`; the brief's 14 industries and 448's own comment list a different set (`telecom`, `energy`, `logistics`, `professional_services`, `agencies`, `devops`). Neither is enforced (`projects.industry` is a free `VARCHAR(50)`). Settle the canonical list and add a CHECK or a reference table.
- **`projects.industry` / `project_type`** are `NOT NULL DEFAULT 'general' / 'standard'` free text — no CHECK, no FK. Part 48 ("industry-aware UX") is config-driven off these values; they need a controlled vocabulary or the pack-activation logic has nothing reliable to switch on.
- **No `updated_at` trigger.** All 22 tables have `updated_at TIMESTAMPTZ DEFAULT NOW()` but nothing bumps it on UPDATE (the platform doesn't use row triggers for this elsewhere either — it's set in app code). Fine, but the services must remember to set it; worth a lint/review checklist item.

---

## What's good in 448 (keep)

- RLS `ENABLE` + `FORCE` + `tenant_isolation_policy` on every table via the `DO $$` loop — verified load-bearing.
- `NULLIF(current_setting('app.tenant_id', true), '')::uuid` policy idiom matches the platform (240/242/292).
- `risk_code` / `issue_code` / `change_code` / `wbs_code` human references with `UNIQUE (project_id, code)`.
- Integer 1–5 probability/impact scoring on risks (simpler matrix math than string enums — `project-os.ts` should adopt this, not the reverse).
- `project_approvals` polymorphic `(entity_type, entity_id)` + ordered `project_approval_steps` — the right shape for the reusable approval engine (Part 16).
- `project_evm_snapshots` as an append-only dated snapshot table — correct for EVM trend reporting.
- FKs to real platform tables (`cloud_files`, `suppliers`, `users`, `tenants`) rather than loose text ids.

---

## Recommended sequence before any Project OS service is written

1. Commit 448 + `project-os.ts` + the CRM working-tree files (P0-2).
2. Rewrite `project-os.ts` against 448 (P0-1 step 2).
3. Migration 449: casing normalisation + the P0-1 step 3 additive columns + `portfolio_members`/`program_members` + `projects.industry` controlled vocabulary (P1-2, P2).
4. `resolvePortfolioAccess` / `resolveProgramAccess` + a shared `requireProjectScope` preHandler (P1-2).
5. Decide procurement/budget/cost-code integration with the existing platform modules (P1-3) — this shapes every financial-control service that follows.
6. Per-pack table decision (P1-1) before the Construction pack.

Re-run `apps/api/src/tests/project-os-isolation.test.ts` after 449; extend it with route-level `resolve*Access` tests once the resolvers land.
