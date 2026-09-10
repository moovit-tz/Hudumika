# Hudumika — Test Coverage Audit

Snapshot 2026-09-10.

## State

| Workspace | Test files | Runner | Against |
|-----------|-----------:|--------|---------|
| `apps/api` | 7 `*.test.ts` | vitest | 195 route modules · 153 services · 40 jobs · 470 migrations |
| `apps/web` | 0 | vitest (configured, unused) | 468 pages · 149 components |
| `packages/*` | (not yet counted) | — | — |

There is effectively **no regression net**. Every change from prior multi-agent work,
and every fix in this audit, is unverified against future edits. `check:triggers`
(studio trigger ↔ emitter consistency) is the one real automated guard and it passes.

## Quality-gate impact

- "Tests cover critical workflows" = **FAIL**.
- "Fixed bugs have regression coverage" = **FAIL** (HUD-0001/2/3 have no test).

## Recommended first tests (priority order)

1. **Tenant-isolation guard** (permanent regression for HUD-0001/2/3): for a
   representative set of tables across every app, assert that as tenant A the
   `hudumika_app` connection with `app.tenant_id=A` returns 0 rows that belong to
   tenant B. Fail the build if any new `tenant_id` table ships without RLS.
2. **Auth/session**: login → cookie set → `/auth/me` 200; refresh rotation; logout
   invalidates; revoked device → 401; CSRF mismatch → 403; refresh token rejected as
   API credential.
3. **RBAC matrix**: for each role, a table-driven test hitting one representative
   endpoint per permission class, asserting 200/403.
4. **Finance integrity**: invoice → GL posting balances; JE numbering is MAX-based
   (regression for `gl_entry_number_collision_fix`); credit-note void; idempotent
   double-submit.
5. **Declaration lifecycle**: create → items → assessment → release, with the new
   `declaration_items` / `tax_lines` RLS in the path.
6. **Web E2E** (Playwright): the master-prompt journey — register → verify → login →
   workspace → invite → permission change → core workflow → file op → notification →
   logout; plus unauthorized-access and network-failure paths.

## Notes

- API tests need an ephemeral Postgres with migrations applied (see HUD-0006 CI).
- Web has no E2E harness wired; the audit used ad-hoc Playwright scripts against the
  running dev servers.
