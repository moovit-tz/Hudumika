# Hudumika Studio — the platform automation layer

Implementation plan for turning `/studio` into the single place every workflow in the
platform is defined, run, observed and governed.

---

## 1. What exists today

Six workflow/automation surfaces have been built independently. This is the actual state,
verified against the code — not a guess.

| # | Surface | Where | Real? |
|---|---------|-------|-------|
| 1 | **Workflow Studio** | `/studio`, `workflow_studio_apps` + `workflow_studio_runs` (migration 155), `workflow-studio.routes.ts`, `WorkflowStudioPage.tsx` (955 lines) | **CRUD real, executor fake** |
| 2 | **ClearOS process engine** | `workflows` + `workflow_steps` + `workflow_comm_queue` (migration 105), `workflow.service.ts`, `workflow-resolver.service.ts`, `workflow-comms.service.ts`, `/clearos/workflows` | **Real and working** |
| 3 | **Domain event bus** | `domain_events`, `domain-events.service.ts`, 6 subscriber files | **Real**, 5 event types |
| 4 | **NexusHR case engine** | `hr_workflow_definitions/stages/cases/tasks/conditions` (migration 25) | **Real**, separate model |
| 5 | **SEAL automation rules** | migration 118, `seal-automation.routes.ts` | **Real**, manual button only — no scheduler |
| 6 | **AI Automations** | `/ai/automations`, `AIAutomations.tsx` (723 lines) on `@xyflow/react` + `FlowNodes.tsx` | **Canvas real**, generation via `/v1/ai/automations/generate` |

Plus: `NOTIFICATION_MATRIX` (7 hardcoded TS rules), `support_rules` (migration 50 + cron job),
11 cron jobs under `jobs/`, and `ComplyWorkflows.tsx` — 368 lines with **zero `apiFetch` calls**,
i.e. a static mockup.

### 1.1 Three blockers that must be fixed before any of this is credible

**A. The Studio executor does not execute anything.**
`workflow-studio.routes.ts:196-240` walks the nodes and pushes a hardcoded `status: 'SUCCESS'`
for every one, with `duration_ms: Math.floor(Math.random() * 45) + 20`. No action is performed,
no service is called. The run log is fabricated, and it is persisted to `workflow_studio_runs`
where it is indistinguishable from a real run. **Every "successful" run in that table today is fiction.**

**B. The three seeded workflows can never fire.**
Migration 155 seeds every tenant with workflows triggered by `shipment.created`,
`penalty.high_risk` and `shipment.arrived`. The only domain events the platform actually
emits are:

```
shipment.case_opened      shipment.stage_advanced    shipment.sla_breach
shipment.demurrage_risk   declaration.released
```

None of the three seeded triggers exist. They would be dead even with a real executor.

**C. Cross-tenant leak in the event bus (P0 security).**
`domain-events.service.ts:63-79` dispatches every domain event to every approved marketplace app:

```sql
SELECT webhook_url, name FROM marketplace_apps
WHERE status = 'approved' AND webhook_url IS NOT NULL
```

`marketplace_apps` is a **global catalog** — no `tenant_id`, and there is no install table
anywhere in the schema. So one tenant's shipment payloads, with `tenantId` attached, are POSTed
to every third-party developer who ever got an app approved, whether or not that tenant
installed it. This is live today and it is the foundation the whole Studio depends on.
It must be fixed first.

---

## 2. The core design decision

**Do not merge the two workflow shapes into one data model.** They are genuinely different:

- A **Process** is a state machine that *owns an entity's lifecycle*. Ordered steps, entry
  conditions, SLA per step, terminal states, exactly one process owns a case at a time.
  ClearOS clearance, HR onboarding, SEAL fulfilment.
- An **Automation** is a stateless pipeline: *event → condition → action*. Fires, does its work,
  ends. Many can react to the same event; none owns anything.

Forcing the ClearOS step-graph into the Studio node graph would break a working engine to make
a diagram look uniform. Instead:

> **Studio is one control plane over two workflow kinds.** One list, one permission model, one
> run log, one canvas, one place to see what automation exists. `kind = 'PROCESS'` keeps
> executing on `workflow.service.ts`; `kind = 'AUTOMATION'` executes on the new engine.

Everything the user asked for — one app, everything connected, existing workflows moved in —
is satisfied by unifying the *control plane*, not the *execution model*.

---

## 3. Architecture

### 3.1 Trigger registry — `apps/api/src/studio/triggers.ts`

A code-declared catalog replacing the hardcoded 8-item array at
`workflow-studio.routes.ts:307-316`. One entry per real event:

```ts
export interface TriggerDef {
  id: string;                  // 'shipment.sla_breach' — must match a real emitDomainEvent type
  app: AppId;                  // 'clearos' | 'seal' | 'finance' | ...
  label: string;               // 'SLA breached on a clearance case'
  entityType: string;          // 'shipment'
  payloadSchema: z.ZodType;    // validates what the emitter actually sends
  samplePayload: object;       // drives the UI's field picker and dry-run
}
```

A trigger may only be listed if a real emit site exists. A CI check greps `emitDomainEvent`
call sites and fails the build if the registry and the emitters disagree — that is what stops
blocker **B** recurring.

Scheduled triggers (`schedule.daily`, `schedule.hourly`) and manual triggers
(`manual.button`) are registry entries too, so a cron-driven automation is authored the same way.

### 3.2 Action registry — `apps/api/src/studio/actions.ts`

The crux of the whole design:

```ts
export interface ActionDef {
  id: string;                       // 'support.create_ticket'
  app: AppId;
  label: string;
  inputSchema: z.ZodType;
  requiredEntitlement?: string;     // reuses requireEntitlement
  requiredRole?: Role[];            // reuses requireRole
  execute(ctx: ActionContext, input: unknown): Promise<ActionResult>;
}
```

**Rule: an action is a thin wrapper over an existing service. It never contains business logic.**
`support.create_ticket` calls the same code path `RaiseSealTicketButton` already hits.
`finance.create_invoice` calls the finance service. If an action needs logic that does not exist
yet, that logic goes in the service and the action calls it. This is the only thing that keeps
Studio from becoming a second, divergent implementation of the platform — the same drift trap
that has already bitten the landed-cost calculators.

Every action runs under the tenant of the triggering event and writes `tenant_id` explicitly.

### 3.3 The executor — `apps/api/src/studio/executor.ts`

Replaces the fake loop. Real semantics:

- Topological walk of `nodes`/`edges` from the trigger node.
- **Condition nodes** evaluate against the real event payload using the existing
  `evaluateEntryConditions` operator vocabulary from `workflow-resolver.service.ts` — one
  condition language across the platform, not a second one.
- **Action nodes** call `ActionDef.execute` and record the *real* result, duration and error.
- **Idempotency**: unique key `(workflow_id, domain_event_id)`. A redelivered event never
  double-charges a customer or double-sends a WhatsApp.
- **Failure**: the run is marked `FAILED` at the failing node with the real error message. No
  step is ever recorded `SUCCESS` unless its action returned success. Retries are bounded and
  explicit; a permanently failed run surfaces in the UI rather than disappearing.
- **Dry run**: same walk, actions short-circuited to `SIMULATED`, clearly labelled in the log.

### 3.4 Bus integration

No change to `domain-events.service.ts` beyond the P0 fix. At boot, Studio loops over its own
trigger registry and calls the existing `registerSubscriber(triggerId, …)` for each. One
subscriber file (`subscribers/studio.subscribers.ts`) added to `subscribers/index.ts` — the
pattern that file's own comment already describes.

The subscriber loads active automations for `(tenant_id, trigger_event)` and enqueues a run.
Execution goes through BullMQ where Redis is available, falling back to the existing in-memory
interval path in `jobs/index.ts`, so behaviour matches the rest of the platform.

### 3.5 App context handoff

The requirement that Studio behaves differently depending on which app sent the user:

```
/studio?app=clearos&entity=shipment&id=<uuid>&return=/clearos/clearance/<id>
```

- `workflow_studio_apps` gains `owner_app TEXT` — every workflow belongs to an app.
- With `?app=`, Studio opens **scoped**: list filtered to that app's workflows, trigger and
  action catalogs filtered to that app's own plus platform-wide ones, and a persistent
  "← Back to ClearOS" control driven by `return=`.
- With `&entity=&id=`, Studio additionally shows *runs that touched this entity*, so arriving
  from a shipment shows that shipment's automation history, not a global list.
- Without params, Studio opens as the full platform view across every app.
- The launcher entry (`LauncherApps.tsx:28`) keeps pointing at the unscoped view.

Each app's sidebar "Workflows" entry becomes a scoped deep-link instead of a separate page.

---

## 4. Phases

### Phase 0 — Stop the bleeding *(no new features)*
1. Fix the marketplace webhook cross-tenant leak. Add a `tenant_marketplace_installs` table
   (`tenant_id`, `app_id`, `installed_at`, `webhook_secret`) and dispatch only to apps that
   *this tenant* installed. Sign each delivery with the per-install secret.
2. Delete or rewrite the three dead seeded workflows in a new migration (keep the seeding
   pattern, point it at real events).
3. Mark existing `workflow_studio_runs` rows as `SIMULATED` rather than `SUCCESS` — they never
   ran. Do not silently leave fabricated history in the table.
4. Disable the "Run" button until Phase 2 lands, rather than shipping a control that lies.

*Verify: signed-JWT curl proving tenant A's event no longer reaches tenant B's app webhook.*

### Phase 1 — Registries
Trigger registry + action registry + the CI consistency check. Replace the hardcoded
`/integrations` endpoint with one derived from the registries. Start with the 5 real events and
roughly 12 actions wrapping existing services.

*Verify: `/v1/studio/triggers` and `/v1/studio/actions` return catalogs that match the code;
CI check fails when an entry has no emit site.*

### Phase 2 — Real executor
The executor, idempotency, run log, dry run. Re-enable Run.

*Verify: build an automation that creates a real support ticket; trigger it; the ticket exists
in `support_tickets` with the right `tenant_id`. Assert on the target app's data, never on
"the subscriber didn't throw".*

### Phase 3 — Bus + scheduler wiring
`studio.subscribers.ts`; scheduled triggers; migrate the 6 hardcoded subscriber files into
Studio automations so they become visible and editable, keeping the code path as the fallback
until each is proven.

*Verify: advance a real shipment stage; confirm the run row and the real side effect.*

### Phase 4 — The Studio UI
Rebuild `WorkflowStudioPage.tsx` on `@xyflow/react` — already a dependency, already proven in
`AIAutomations.tsx`, with `FlowNodes.tsx` reusable. Retire the hand-rolled canvas.

Built from `apps/web/src/components/ui/` per CLAUDE.md. Workflow creation is a **dedicated
route**, not a modal — `/studio/new`, following the OnboardingWizard/TradeWizard precedent.

Screens: workflow list (filterable by app/kind/status) · canvas editor with trigger, condition
and action pickers driven by the registries · run log with real per-node results and error
detail · dry-run panel · per-workflow enable/disable.

### Phase 5 — Absorb the existing engines
- **ClearOS processes**: `kind='PROCESS'` rows in the Studio list; editing opens the step-graph
  editor. `workflow.service.ts` keeps executing them, untouched.
- **SEAL automation rules** → Studio automations on scheduled triggers, which also gives them
  the scheduler they never had.
- **`NOTIFICATION_MATRIX`** → seeded Studio automations, so a tenant can finally change a
  notification rule without a code deploy.
- **`support_rules`** → Studio automations; retire `support-rules.job.ts` once parity is proven.
- **NexusHR cases** → surfaced as `kind='PROCESS'`; its engine keeps running.
- **`ComplyWorkflows.tsx`** → delete. It is a static mockup; replace with a scoped Studio link.
- **`AIAutomations.tsx`** → becomes "generate a workflow with AI" *inside* Studio, emitting a
  real node graph against the registries instead of a parallel builder.

### Phase 6 — Governance
Versioning with rollback · change approval for `PROCESS` kinds · per-tenant kill switch ·
run quotas metered on the existing `tenant_usage_counters` · full audit trail of who changed
which workflow.

---

## 5. Starter workflows

Ordered by value-to-risk. **Tier 1 needs no new events** — the trigger already fires today.

### Tier 1 — buildable the moment the executor is real

| Workflow | Trigger | Actions |
|---|---|---|
| **Consignee onboarding notice** | `shipment.case_opened` | WhatsApp + email to consignee, in-app to assigned officer |
| **SLA breach escalation** | `shipment.sla_breach` | Create Bliss ticket, notify manager, flag case |
| **Demurrage countdown** | `shipment.demurrage_risk` | Urgent alert to customer + officer, raise demurrage task |
| **Release-to-warehouse** | `declaration.released` | Release the linked SEAL lot, post the customs-duty ledger line |
| **Trip dispatch** | `shipment.stage_advanced` (to a discharge stage) | Update linked trip, notify assigned driver |

The last four already exist as hardcoded subscribers. Moving them into Studio changes nothing
functionally — it makes them **visible, editable and auditable** by the tenant. That is the
honest early win, and it proves the migration path before anything new is built.

### Tier 2 — one-line `emitDomainEvent` next to an existing mutation

| Workflow | Trigger to add | Actions |
|---|---|---|
| **Pro-forma on arrival** | `invoice.generated` | Email invoice, create GL draft, notify finance |
| **Quote-to-case** | `quotation.accepted` | Open a ClearOS case from the accepted quote, assign an officer |
| **Payment releases hold** | `payment.received` | Clear the cargo hold, notify warehouse + customer |
| **Landed-cost lead follow-up** | `landed_cost.share_unlocked` | Create the CRM lead task, assign to sales |
| **Compliance renewal ladder** | `comply.expiry_approaching` | Task at 60/30/7 days, escalate to manager at 7 |
| **Storage expiring** | `seal.storage_expiring` | Invoice storage, notify customer |

Each of these is a real mutation point today; only the emit line is missing.

### Tier 3 — needs product decisions first
Document-missing escalation ladder (interacts with `reminder.job.ts`'s existing repeat logic),
duty-threshold approval gates, and anything that auto-assigns an HS code — which, per the
landed-cost work, must stay agent-confirmed and must never be automated.

---

## 6. Verification standard

Carried over unchanged from the current work:

1. `npx tsc --noEmit` in both `apps/api` and `apps/web` after each phase.
2. Every migration applied via `npm run db:migrate`, confirmed idempotent.
3. Live verification via signed-JWT curl against the running dev servers, plus Playwright for
   UI flows.
4. **An action's effect is never claimed unless the target app's own data actually changed.**
   No run is recorded `SUCCESS` unless its action returned success. No fabricated timings.
5. Every query carries an explicit `.where('tenant_id', '=', …)`. Cross-tenant id smuggling
   through a valid-looking `entity_id` in an event payload is the realistic attack shape here —
   an action must validate that the entity it is about to touch belongs to the triggering tenant.

---

## 7. Immediate next step

**Phase 0.** The cross-tenant webhook leak is live, and everything else in this plan is built on
that bus.
