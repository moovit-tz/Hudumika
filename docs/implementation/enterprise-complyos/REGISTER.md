# Enterprise ComplyOS Implementation Register

Last updated: 2026-10-29

## Phase status

| Phase | Blueprint § | Title | Status | Migrations | Tests | Test file |
|-------|-------------|-------|--------|------------|-------|-----------|
| C | § C (Phase 1) | ComplyOS integrity fixes | **Done** | None (code-only) | 13/13 | complyos-integrity.test.ts |
| D | § D (Phase 2) | Organizational scope & multi-industry | **Done** | 641, 642 | 20/20 | org-model-integrity.test.ts |
| E | § E (Phase 3) | Administrator hierarchy & visibility | **Done** | 643 | 18/18 | admin-hierarchy-integrity.test.ts |
| F | § F (Phase 4) | Canonical permit & regulatory engine | **Done** | 644 | 20/20 | permit-engine-integrity.test.ts |
| G | § G (Phase 5) | Permit capture & cross-app checks | **Done** | 645 | 20/20 | permit-check-integrity.test.ts |
| H | § H (Phase 6) | Industry-specific workflows | **Done** | 646 | 22/22 | industry-workflow-integrity.test.ts |
| I | § I (Phase 7) | Company/product launch planner | **Done** | 647 | 25/25 | launch-planner-integrity.test.ts |
| J | § J (Phase 8) | Consultant delegation | **Done** | 648 | 32/32 | consultant-delegation-integrity.test.ts |
| K | § K (Phase 9) | Marketplace | **Done** | 649 | 30/30 | marketplace-integrity.test.ts |
| L | § L (Phase 10) | Enterprise metrics & scale ops | **Done** | 650 | 35/35 | enterprise-metrics-integrity.test.ts |

**Total: 10 phases complete, 235+ integration tests green, 11 migrations (641–650 + code-only C), zero typecheck errors.**

---

## Migrations applied (641–650)

| # | File | Tables created | Key features |
|---|------|----------------|--------------|
| 641 | `641_shared_org_model.sql` | tenant_entities, tenant_sites, entity_industries, site_activities | Shared org hierarchy; all RLS+FORCE |
| 642 | `642_industry_registry.sql` | industry_registry, industry_app_capabilities | Platform-scoped registry; no tenant_id |
| 643 | `643_admin_hierarchy_scope.sql` | admin_scope_grants, platform_operator_sessions, scope_audit_log, field_access_policies | Delegated scope, operator audit, field policies |
| 644 | `644_canonical_permit_engine.sql` | comply_permit_holders, comply_permit_records, comply_requirement_definitions, comply_fee_definitions, comply_renewal_cycles | Full permit lifecycle; versioned requirements; fee/penalty structures |
| 645 | `645_permit_capture_checks.sql` | comply_capture_candidates, comply_permit_checks, comply_app_coverage, comply_capture_config, comply_check_rules | Cross-app capture pipeline; check contract with assurance levels |
| 646 | `646_industry_workflows.sql` | workflow_definitions (platform), industry_app_matrix (platform), tenant_workflow_instances, workflow_transactions | Industry×app workflows; platform-scoped definitions + tenant instances |
| 647 | `647_launch_planner.sql` | launch_cases, launch_case_sites, launch_case_products, launch_plan_items, launch_plan_snapshots | Multi-site/multi-industry launch readiness |
| 648 | `648_consultant_delegation.sql` | provider_client_portfolios, delegation_mandates, mandate_staff_assignments, delegation_audit_log, provider_engagements | Scoped mandates; dual-party RLS; staff-level access enforcement |
| 649 | `649_marketplace.sql` | marketplace_provider_listings, marketplace_enquiries, marketplace_quotations, marketplace_assignments, marketplace_milestones, marketplace_disputes | Published listings visible cross-tenant; fee breakdown; milestone evidence |
| 650 | `650_enterprise_metrics.sql` | platform_metric_snapshots, tenant_metric_snapshots, tenant_resource_limits, durable_jobs, bulk_operations | Platform metrics (no RLS); resource limits; durable jobs with dedup+retry |

---

## Services & routes

| Phase | Service | Route plugins |
|-------|---------|---------------|
| C | comply.service.ts (patched) | comply.routes.ts (patched) |
| D | org-model.service.ts | org-model.routes.ts |
| D | industry-registry.service.ts | (registered via org-model routes) |
| E | admin-hierarchy.service.ts | (registered via org-model routes) |
| F | permit-engine.service.ts | permit-engine.routes.ts |
| G | permit-check.service.ts | permit-check.routes.ts |
| H | industry-workflow.service.ts | industry-workflow.routes.ts |
| I | launch-planner.service.ts | launch-planner.routes.ts |
| J | consultant-delegation.service.ts | consultant-delegation.routes.ts |
| K | marketplace.service.ts | marketplace.routes.ts |
| L | enterprise-metrics.service.ts | enterprise-metrics.routes.ts |

---

## Shared types (packages/types/src/comply.ts)

All phases export typed interfaces and union-type literals. Each phase's types are appended in order: C (base patched), D–E (org/admin), F (permit engine), G (capture/checks), H (workflows), I (launch planner), J (delegation), K (marketplace), L (enterprise metrics).

---

## Phase C findings (closed)

| ID | Finding | Fix | Test |
|----|---------|-----|------|
| C01 | Unchanged expiry falsely closes renewal | Read current expiry, compare before closing | 2 tests |
| C03 | Cross-tenant customer_id on update paths | Validate customer ownership in update methods | 4 tests |
| C04 | Silent TZ substitution for unsupported jurisdiction | SUPPORTED_JURISDICTIONS allowlist with explicit reject | 3 tests |
| C06 | Reminder marked sent before delivery | Reordered to deliver-then-mark with try/catch | — (job) |
| C07 | Misleading 100% health / perpetual null-expiry | -1 sentinel + "unknown" status + frontend handling | 2 tests |
| C09 | Approve nonexistent renewal returns success | numUpdatedRows check, throws on no-op | 2 tests |

---

## Cross-cutting patterns

### Tenant isolation
- Every tenant-scoped table has RLS with `FORCE ROW LEVEL SECURITY`.
- Platform-scoped tables (`platform_metric_snapshots`, `industry_registry`, `industry_app_matrix`, `workflow_definitions`) have no tenant_id; accessed via `dbPlatform`.
- Dual-party RLS (Phases J/K): `USING (owner_tenant_id = ... OR provider_tenant_id = ...)` on mandates, audit logs, enquiries, quotations, assignments, disputes.
- Published marketplace listings have a second `FOR SELECT` policy allowing all tenants to read published records.
- Cross-tenant UPDATE pattern (K04): read via client context to verify access + get provider_tenant_id, then write via provider context.
- `durable_jobs` allows NULL tenant_id for platform jobs: `USING (tenant_id IS NULL OR tenant_id = ...)`.

### NUMERIC handling
- All Postgres NUMERIC columns wrapped with `Number()` in service return values.

### Route auth
- All routes use `fastify.addHook('preHandler', fastify.authenticate)` at plugin level.
- Role guards: `requireAdmin` (SUPER_ADMIN/ADMIN/MANAGER), `requireSuperAdmin` (SUPER_ADMIN only).
- No custom `onRequest` hooks with `(req as any).user`.

### Test pattern
- `createTestTenant(role)` for disposable tenants.
- `getApp()` + `server.inject()` for HTTP-level route tests.
- Cross-tenant isolation verified by "bystander blocked" tests in every phase.

---

## Decisions/blockers ledger

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Shared entities as new tables, not renaming HR tables | HR tables have ~50 FK dependencies; new `tenant_entities` with optional bridge | 2026-10-29 |
| 2 | Industry registry in DB, not code arrays | Runtime management + versioned packs vs deploy-only changes | 2026-10-29 |
| 3 | Finance business_lines kept as-is, bridged | 530+ migration FK dependencies; new `tenant_business_lines` references entities | 2026-10-29 |
| 4 | Platform-scoped workflow definitions | Shared across tenants; tenant instances reference them | 2026-10-29 |
| 5 | Cross-tenant milestone review via two-step pattern | Client reads to verify access, provider context for write; avoids complex UPDATE RLS | 2026-10-29 |
| 6 | Resource limits: soft allows, hard blocks | Soft enforcement warns but doesn't prevent; hard enforcement blocks at the API layer | 2026-10-29 |
| 7 | Durable jobs: dedup via UNIQUE(tenant_id, job_type, job_key) + ON CONFLICT DO NOTHING | Prevents duplicate job creation without locking | 2026-10-29 |

---

## Remaining work and external dependencies

### Not in scope of this backend implementation pass
- **Frontend UI pages** for Phases D–L (services and APIs are complete; frontend pages not built)
- **Browser/desktop/mobile verification** for new pages (no new UI was created)
- **Real provider integrations** (gateway credentials, government API connections)
- **Load/performance testing** against the illustrative fixture (100 groups / 5K entities / 100K sites / 2M permits)
- **Deployment/migration compatibility** testing on Contabo production
- **Backup/restore/failover** runbooks
- **Regulated-use evidence** (GxP, privacy, security certification)

### External dependencies (cannot be resolved by code)
- Real government API credentials for permit submission (Tanzania TRA, BRELA, etc.)
- Payment gateway production credentials (Stripe, DPO, etc.)
- Qualified legal/regulatory review of jurisdiction packs
- Design partner workload agreement for scale targets
- Security audit / penetration test by qualified third party

---

## Verification summary

```
Phase C:  npx vitest run src/tests/complyos-integrity.test.ts            → 13/13 green
Phase D:  npx vitest run src/tests/org-model-integrity.test.ts           → 20/20 green
Phase E:  npx vitest run src/tests/admin-hierarchy-integrity.test.ts     → 18/18 green
Phase F:  npx vitest run src/tests/permit-engine-integrity.test.ts       → 20/20 green
Phase G:  npx vitest run src/tests/permit-check-integrity.test.ts        → 20/20 green
Phase H:  npx vitest run src/tests/industry-workflow-integrity.test.ts   → 22/22 green
Phase I:  npx vitest run src/tests/launch-planner-integrity.test.ts      → 25/25 green
Phase J:  npx vitest run src/tests/consultant-delegation-integrity.test.ts → 32/32 green
Phase K:  npx vitest run src/tests/marketplace-integrity.test.ts         → 30/30 green
Phase L:  npx vitest run src/tests/enterprise-metrics-integrity.test.ts  → 35/35 green

Typecheck:  npx tsc --noEmit (apps/web)  → 0 errors
Typecheck:  npx tsc --noEmit (apps/api)  → 0 errors
```

All commands run from `apps/api` directory. All tests use real Postgres with disposable tenants and the restricted `hudumika_app` DB role with FORCE RLS.
