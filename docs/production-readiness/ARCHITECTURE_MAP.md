# Hudumika — Architecture Map

Snapshot: 2026-09-10. Derived from live inspection of the repo, the running API
(`localhost:3001`) and the running Postgres (`localhost:5433/clearos`). Not from
the README.

## Monorepo shape

npm workspaces (`packages/*`, `apps/*`), Node ≥ 20.

| Path | What |
|------|------|
| `apps/api` | Fastify (TypeScript, ESM, `tsx watch` in dev). REST at `/v1/*`, `/auth/*`. |
| `apps/web` | React 18 + Vite 7 SPA, Tailwind v4 + Radix UI, `react-router-dom`. Port 5173. |
| `packages/types` | Shared TS types (`@hudumika/types`) — `SafeUser`, `JWTPayload`, domain models. |
| `packages/ui` | Shared component lib (built before api/web). |
| `packages/api-client` | Generated/typed client. |

## Backend (`apps/api/src`)

| Dir | Count | Notes |
|-----|------:|-------|
| `routes/*.routes.ts` | 195 | One module per domain, registered in `index.ts`. |
| `services/*.ts` | 153 | Business logic. |
| `jobs/` | 40 | Cron/queue jobs (`jobs/index.ts` scheduler). |
| `integrations/` | 9 | email, sms, whatsapp, payments, minio/object-storage, google/microsoft contacts, comply-agencies. |
| `subscribers/` | 12 groups | Domain-event handlers (bliss, finance, hrm, seal, studio, tracking, …). |
| `middleware/` | 5 | `auth.ts`, `csrf.ts`, `rbac.ts`, `entitlement.ts`, `agency-access.ts`. |
| `studio/` | — | Workflow engine + trigger registry (`triggers.ts`, validated by `check:triggers`). |
| `db/migrations/*.sql` | 470 files (478 applied) | Plain SQL, forward-only, tracked in `_migrations` by filename. Runner: `db/migrate.ts` (one txn per file). |
| `tests/` | 7 files | `vitest`. |

### Data layer

- Kysely over `pg`. `db/client.ts` exposes:
  - `db` — plain pool, RLS applies (role `hudumika_app`, **non-superuser, non-BYPASSRLS**).
  - `withTenant(tenantId, cb)` — opens a txn, `SET app.tenant_id`, runs `cb`. **Every tenant-scoped
    query must go through this.**
  - `dbPlatform` — separate pool as `hudumika_platform` (**BYPASSRLS**) for the audited set of
    genuinely cross-tenant call sites (SuperAdmin consoles, usage rollups, CMS platform pages,
    auth-middleware device checks, migrations).
- Postgres 13.23. 580 base tables. **474 carry `tenant_id`; after this audit all 474 + 9 structural
  child tables enforce RLS** (`ENABLE` + `FORCE` + `tenant_isolation_policy`). See SECURITY_AUDIT.md.
- Restricted role + `FORCE RLS` established in migrations 241/242.

### Auth

- Login (`auth.routes.ts`) issues an access JWT + refresh JWT (fast-jwt / `@fastify/jwt`,
  HS256, `env.JWT_SECRET`) as **httpOnly cookies** (`hudumika_access`, `hudumika_refresh`) plus a
  non-httpOnly `hudumika_csrf` cookie.
- `middleware/auth.ts` `authenticate` decorator: extracts token cookie-first
  (`lib/cookies.ts` `extractToken`), falls back to `Authorization: Bearer` for non-browser callers,
  also accepts `x-api-key` (→ `api_keys` via `dbPlatform`).
- Double-submit CSRF (`middleware/csrf.ts`): enforced when the credential was an ambient cookie
  (no `Authorization` header). `X-CSRF-Token` must equal the `hudumika_csrf` cookie.
- Rejects `typ` of `refresh` / `guest` / `twofa_setup` (except allow-listed routes).
- Session revocation: `hr_devices.revoked_at` re-checked live per request via `dbPlatform`;
  idle-timeout policy from `tenant_settings` / platform security settings.
- Gates layered after auth: tenant suspension, IP allowlist, maintenance mode, usage cap (402 on
  metered POSTs).
- Roles: `SUPER_ADMIN`, `ADMIN`, `TENANT_ADMIN`, `MANAGER`, `FINANCE`, `SALES`, `SENIOR`,
  `JUNIOR`, `OFFICER`, `CUSTOMER`, plus `ORG` (org-portal token, no `tenant_id`). Role sets in
  `apps/web/src/lib/permissions.ts` (`MGMT_ROLES`, `CRM_ROLES`, `OPS_ROLES`, `FIN_ROLES`, …) and
  server-side `middleware/rbac.ts`.

### Security middleware posture (verified present)

`@fastify/helmet`, `@fastify/cors` (allowlist: `env.CORS_ORIGINS` + tenant-configurable extra
origins; WS upgrade origin checked separately), `@fastify/rate-limit` (platform-configurable).
No secrets in `apps/web/src`. `.env` not tracked.

## Frontend (`apps/web/src`)

| Dir | Count | Notes |
|-----|------:|-------|
| `pages/**/*.tsx` | 468 | Screens. |
| `components/**/*.tsx` | 149 | Incl. `components/ui/` design system (Radix + Tailwind v4). |
| `shells/*.tsx` | ~35 | One per app: `WorkspaceApp` mounts the active app shell and sets per-app accent vars. |
| `hooks/`, `contexts/`, `lib/`, `i18n/`, `locales/` | — | `useAuth`, `useDesignSystem`, `useEntitlements`, `apiFetch`. |
| `__tests__/` | 0 | — |

- `apiFetch` (`lib/api.ts`): `credentials: 'include'`, echoes the CSRF cookie as `X-CSRF-Token`,
  auto-refreshes on 401, global session-clear on hard 401.
- `useAuth`: seeds from `localStorage['hudumika_user']` (SafeUser snapshot), then
  `hydrateIdentityFromServer` — a 401 there is the real "session dead" signal.

## The 31 apps (per `Hudumika Platform Overview`)

Customs/freight: ClearOS, SEAL, CargoTracker, Demurrage, Tracking.
Finance: FinOps, Petti.
People: NexusHR, Ondi.
Engagement: Bliss, CRM, Contacts, SMS, Email.
Compliance/identity: ComplyOS, Ondi.
Collaboration: Drive, Sign, Notes, Calendar, Tasks, Projects (Project OS).
Analytics/platform: HuduBI, Studio, Admin/SuperAdmin, Developer, OneSite/CMS, Store, Inventory,
Onsite, Workspace, Hudumika AI.

## External integrations (verify in Phase 12)

MinIO/S3 object storage, SMTP (email), Meta WhatsApp Cloud API, Africa's Talking / Twilio (SMS),
payment gateways, Google/Microsoft contacts sync, GPSWOX (fleet), AIS (vessel), IMAP ticket
ingest, blockchain anchoring (Sign/SEAL/declaration ledger jobs).

## CI/CD

`.github/workflows/dependency-audit.yml` only — weekly `npm audit --audit-level=high`,
`continue-on-error`. **No build/typecheck/lint/test/migration gate.** (HUD-0006)
