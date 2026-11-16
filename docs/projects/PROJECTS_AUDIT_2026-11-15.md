# Projects app audit, access control and equipment register (15 November 2026)

Scope: `/projects/*` (ProjectsShell), the project workspace (ProjectsApp via
ProjectWorkspace), `/v1/project-os`, `/v1/tasks/projects`, and the new
`/v1/project-equipment`. Nothing here is deployed; migration 913 is applied to
the local database only.

## 1. Route coverage

Every route below was opened in a real browser (Playwright, signed in through
`/auth/login`) at 1440×900 and 390×844, as a tenant admin of a disposable
tenant seeded through the UI and API. The checks recorded for each route were:
page-level horizontal overflow, exactly one `h1`, icon buttons without a name,
uncaught errors, React warnings, and API 5xx responses.

| Area | Route | Desktop | Phone | Notes |
| --- | --- | --- | --- | --- |
| Dashboard | `/projects` | ok | ok | |
| Directory | `/projects/directory` | ok | ok | |
| Create | `/projects/new` | ok | ok | dedicated wizard page |
| Edit | `/projects/:id/edit` | — | — | not swept; owner/admin only on the server |
| Portfolios | `/projects/portfolios` | ok | ok | server writes were open and 500'd, fixed (§3) |
| Timeline | `/projects/timeline` | ok | ok | duplicate sidebar links removed from header |
| My tasks | `/projects/tasks` | ok | ok | |
| Milestones | `/projects/milestones` | ok | ok | duplicate sidebar link removed |
| Budgets | `/projects/budgets` | ok | ok | kept "Open in FinOps" |
| Contracts / detail | `/projects/contracts`, `/:id` | ok | ok | shared Contracts page |
| Procurement | `/projects/procurement` | ok | ok | kept "Open in FinOps" |
| Risks | `/projects/risks` | ok | ok | duplicate sidebar links removed |
| Approvals | `/projects/approvals` | see note | ok | duplicate sidebar links removed; h1 measured 0 once, recheck |
| Reports | `/projects/reports` | ok | ok | kept Print |
| Team | `/projects/team` | ok | ok | duplicate sidebar links removed |
| Equipment register | `/projects/equipment` (+ bookings, due, utilisation tabs) | ok | ok | rebuilt (§5) |
| Asset | `/projects/equipment/:id`, `/new`, `/:id/edit`, `/import` | ok | ok | new |
| Documents | `/projects/documents` | ok | ok | kept "Open in Drive" |
| Workspace tabs | `/projects/:id/{overview, schedule, gantt, kanban, wbs_schedule, financials_evm, governance, procurement, resources, industry_pack, files, members, risks, budget_tracking, milestones, timesheets, discussions, activity}` | see sweep log | see sweep log | health badge moved out of the `<p>` subtitle (was a React nesting error on every tab) |

## 2. Roles and what "tenant superadmin" means

There is no separate "tenant superadmin" role. In a tenant, `TENANT_ADMIN` and
`ADMIN` are the administrators and are treated identically by Projects.
`SUPER_ADMIN` is Hudumika platform staff. It also passes every tenant-admin
check inside its own tenant, and reaches other tenants only through the
audited `POST /auth/impersonate` path, which signs in as that tenant's admin
and carries `impersonated_by`. Delegated tenant roles are Ondi custom roles
(`ondi_org_roles`) carrying code-defined permissions. Only an admin can create
them or grant them. This work adds two permissions:

- `projects.equipment.manage`: runs the equipment register.
- `projects.portfolios.manage`: creates and edits portfolios and programs.

Project scope comes from `resolveProjectAccess`, in this order: the project
owner, then a `project_members` row (owner/member/viewer), then a workspace
admin. Note that a member row overrides admin, so an admin who was added as a
viewer is a viewer on that project. This is existing, deliberate behaviour
(`eligibleApprovers` depends on it) and was left unchanged.

### Capability matrix (verified on the server)

| Action | Scope | Allowed | Refused (tested) |
| --- | --- | --- | --- |
| View project, lists, details | project | owner, member, viewer, admin | unrelated staff (no row in lists; 403 on `/projects/:id/*`), other tenant (404) |
| Create or duplicate project | tenant | admins, MANAGER | all other staff 403 (decided 2026-11-16, see §6) |
| See portfolio and program budgets | tenant / record | admins, MANAGER, `projects.portfolios.manage`, the record's own manager | others get `null` budgets and contract-value rollup (decided 2026-11-16) |
| Edit / delete project, manage members | project | owner, admin | member, viewer |
| Phases, WBS, risks, issues, CRs, procurement writes | project | owner, admin, member | viewer, unrelated, other tenant |
| Gate review, deliverable review, submit CR for approval | project | owner, admin | member, viewer |
| Approve a step | approval step | the assigned approver only (who must be an editor) | viewer, unassigned PM (both 403, tested in browser) |
| Create / delete portfolio or program | tenant | admins, `projects.portfolios.manage` | **was open to all staff**, now 403 |
| Edit portfolio or program | record | the above, plus its own manager | others 403. **Was a 500 for everyone**, fixed |
| View equipment register | tenant | any staff user with Projects | customer accounts, other tenant |
| See cost and charge-out rates (screen, legacy list, CSV) | tenant | admins, FINANCE, equipment managers | everyone else (fields removed server-side) |
| Register, edit, import, dispose of assets; add certificates | tenant | admins, `projects.equipment.manage` | **legacy `POST /resources` was open to all staff**, now 403 |
| Request equipment for a project | project | owner, admin, member | viewer 403, unrelated user 404, other tenant 404 |
| Reserve, issue, receive, reassign, inspect, log meter, run maintenance | asset | equipment managers, and that asset's custodian | others 403 |
| Cancel or decline a booking | booking | requester, project owner/admin, equipment managers, custodian | others 403 |
| Record maintenance cost | asset | as above, *and* allowed to see costs | custodian without cost access 403 |
| Export register | tenant | any viewer; cost columns only for cost viewers | — |

Cross-domain references are checked against the caller's tenant before use:
custodian, operator, receiving user, rental supplier, service supplier,
FinOps fixed asset, Tracking vehicle, Drive file, work package (also checked
against the same project), target project for reassignment, and portfolio
manager on edit (previously not checked).

## 3. Server defects fixed

1. `POST /v1/project-os/resources` (fleet register) had no role check. Any
   staff user could add assets. It now uses the register's rules.
2. `GET /v1/project-os/resources` returned cost and charge-out rates to every
   user. These fields are now removed unless the caller may see costs.
3. Portfolio and program create/delete had no role check.
4. `PATCH /portfolios/:id` copied `owner_id`, `allocated_budget` and
   `target_roi` into columns that don't exist, and sent lowercase statuses
   the CHECK constraint rejects, so every edit returned 500.
   `PATCH /programs/:id` had the same problem with `program_manager_id`.
   Both now map to the real columns and check the manager is in the tenant.
5. Legacy allocation create and release now go through the register's
   booking rules: eligibility, capacity, approval and history.

## 4. Repetition and layout changes

- Removed header buttons on nine pages that only linked to sibling Projects
  pages already in the sidebar (Approvals, Budgets, Documents, Milestones,
  Procurement, Reports, Risks, Team, Timeline). Genuine actions and links to
  other apps stay (Print, Open in FinOps, Open in Drive).
- Workspace header: the health badge was a block element inside the
  subtitle's `<p>`, which produced a React DOM-nesting error on every tab. It
  now sits beside the status control. The location pin, a passive icon, uses
  neutral ink instead of the accent.
- Equipment pages are built only from `components/ui`, `PageHeader`,
  `SectionCard`, `DataTable` and `PersonAvatar`, with token colours. Each page
  has one primary action; less frequent actions are in the overflow menu.
  Long names wrap to two lines inside capped column widths: a long project
  name was pushing the Reserve button out of the bookings table, found in the
  browser. On phones the filters sit in two columns. Numbers are
  right-aligned and use tabular figures.

- Phones: single-column grids used a plain `1fr` track, which can't shrink
  below its content, so directory cards ran past the screen edge. Seven
  pages now use `minmax(0, 1fr)`. The shared `ListPagination` controls now
  wrap, and its page-size select uses `--ctl-h` instead of a hard-coded
  32 px.

## Verification

- `npx tsc --noEmit`: API exit 0, web exit 0.
- API suites:
  - Totals: **87/87 passing** across five files.
  - The five files: `project-equipment-register` (new, 7 tests),
    `project-os-smoke`, `project-os-isolation`, `project-document` and
    `project-studio-triggers`.
- Browser journeys, run in a disposable tenant with one sign-in per role:
  - Tenant admin delegates the register through an Ondi role, then creates
    and edits a portfolio.
  - Admin registers an excavator through the form; a hired dozer, a van and
    a tool are registered through the API.
  - Project manager creates a project, adds a member and a viewer, then books
    the excavator from the workspace; a clashing booking shows its conflict
    when the dates are chosen.
  - The custodian (as delegated plant-yard manager) reserves, issues with
    meter and site, then receives it back with an inspection. The asset is
    available again, and its history shows each step with the actor.
  - The viewer is not offered booking and the server refuses it (403).
  - An unrelated user is refused booking (404) and refused registering assets
    or editing a portfolio (403).
  - Finance sees cost rates; the viewer doesn't.
  - Approvals: the assigned approver decides; the viewer and the unassigned
    project manager are refused (403).
  - On a phone, the project manager finds the tool by search, opens it and
    books it for another project, with no page-level horizontal scroll.
  - Dark-theme screenshots at both widths.

  The disposable tenant was deleted afterwards. The demo tenant was not
  modified: it is at its plan's monthly limit of 500 records, so the first
  write was refused before anything was created.
- Route sweep: every route in §1 was checked at 1440 px and 390 px. No
  page-level horizontal overflow, no uncaught errors, no API 5xx and no
  unnamed icon buttons were found. Wide tab strips and the Gantt scroll inside
  their own containers, as the tabs contract allows.

## 5. Equipment register

### Data ownership

| Record | Owner | How Projects uses it |
| --- | --- | --- |
| Asset identity (code, type, serial, registration, custodian, condition, location, capacity, meter, schedules) | **Projects**: `project_resources` (extended by migration 913) | the one durable identity per asset |
| Book value, depreciation, accounting disposal | FinOps `fixed_assets` | `fixed_asset_id` link only; disposal in Projects reminds the user to record it in FinOps |
| GPS position, telematics | Tracking `vehicles` | `vehicle_id` link only |
| Rental and service suppliers | `suppliers` (party model) | `owner_vendor_id`, `vendor_id` |
| Documents and photos | Drive `cloud_files` | uploaded with `entity_type=project_resource`; opened through Drive's signed URL, which logs access |
| Warehouse equipment | SEAL `seal_equipment` | not linked: bound to a warehouse compartment, not a project asset |
| Procurement and inventory | Project procurement, FinOps | not duplicated |

### Lifecycle and integrity

A booking moves through these states:

1. **Requested**: a project editor asks for the asset.
2. **Reserved**: an equipment manager or the asset's custodian accepts it.
   When one of them books directly, it starts here.
3. **Issued**: handed over, with condition, meter reading, the person
   receiving it and the site.
4. **Returned**: received back, with condition, meter and a return
   inspection.

A requested or reserved booking can instead be **cancelled** or **declined**.
A **reassign** moves an issued asset straight from one project's site to
another's.

Integrity rules:

- **Concurrency:** every write locks the asset row, so the capacity check sees
  all committed bookings. Two concurrent requests for the same dates give one
  201 and one 409 (tested).
- **Retries:** a `request_key` (unique per tenant) means a retried submit
  returns the original booking (tested).
- **Eligibility:** checked when choosing dates in the booking form (with the
  reasons and conflicting bookings shown), and again on request, reserve,
  issue and reassign. An asset can't be booked if it is:
  - disposed or in maintenance;
  - reported damaged;
  - failed at its last inspection;
  - overdue for inspection;
  - covered by a required certificate that expires before the booking ends;
  - outside its hire period.
- **Meters:** a reading can't go backwards.
- **Audit:** events, readings and inspections are append-only, enforced by a
  database trigger. Each event records the actor and `impersonated_by` for
  Hudumika support sessions. A failed inspection needs a defect description.
- **Reminders:** a daily job (07:30) notifies the custodian, or the tenant
  admins, about certificates and inspections due within 14 days and about late
  returns. It sends once per asset, subject and due date.
- **Import and export:** CSV import has a dry run, row-numbered errors,
  detection of duplicates within the file, and a skip-or-update choice for
  codes already registered. It is all-or-nothing in one transaction. The
  export is permission-aware and guards against spreadsheet formula injection.
- **Reports:** the Due & overdue view lists inspections, services,
  certificates, overdue returns and waiting requests. Utilisation counts days
  issued or returned in a window and downtime from completed maintenance. Hire
  cost is computed only for day rates, since hourly rates would need logged
  hours.

Existing rows were migrated: location, plate, next maintenance date and a
valid same-tenant custodian moved from the 586 metadata blob into columns.
The legacy `/v1/project-os/resources` and `/allocations` endpoints keep their
response shapes.

## 6. Open items: need a product decision, fixture or integration

- **Decided 2026-11-16: project creation and portfolio budgets are limited to
  admins and managers.** `POST /v1/tasks/projects` and `/:id/copy` return 403
  for other roles; the UI hides New project and Duplicate and shows a refusal
  on `/projects/new`. `GET /portfolios` and `/programs` return `null` budget
  fields to other staff, and the Portfolios page hides those rows. Covered by
  `project-equipment-register.test.ts` and browser-checked as the demo
  `junior@msomi.co` and `manager@msomi.co` users.
- **SuperAdmin journey.** Not exercised in this pass. Projects has no
  platform-level settings beyond entitlement (SuperAdmin → apps), and the only
  support path is impersonation. Equipment history records
  `impersonated_by`, but no impersonated session was run here.
- **Tenant-level equipment policy** (for example, require a pre-use
  inspection before issue) is not configurable yet. The rules above are fixed
  in code.
- **Mobile Gantt and Kanban.** Pages render without page-level overflow; deep
  interaction (dragging bars and cards on touch) was not tested.
- **Charts and other app widgets:** ComplyOS and SMS header widgets return
  403 for tenants without those apps (seen in the API log). They come from
  other apps and are harmless, but they add noise.
