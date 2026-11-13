# Hudumika

Multi-tenant logistics/customs/finance/HR platform. Fastify API in `apps/api`, React SPA in `apps/web`, Postgres via Kysely.

Backend patterns, verification and known traps: [`AGENTS.md`](AGENTS.md). Design reasoning and tokens: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Tenant isolation

- Every query has an explicit `.where('tenant_id', '=', user.tenant_id)`.
- Every route or service that touches the database runs inside `withTenant(tenantId, ...)`. The narrow, audited set of cross-tenant/platform call sites uses `dbPlatform` instead.
- Querying the bare `db` singleton outside `withTenant()` is a real bug. Row-Level Security is enforced and rejects it; RLS is a second line of defense, not a substitute for the two rules above.

## Page titles

**Every page in every app opens with `PageHeader` (`apps/web/src/components/PageHeader.tsx`).** A hand-rolled title is wrong and gets migrated.

- `titleEm` is the final word only. It is coloured `var(--teal)`; never hardcode that colour or give it a different font.
- Never type the trailing `.`; the component adds it.
- Do not add `PageHeader` to the full-screen apps: Email, Drive, Calendar, Tasks, the Studio workflow builder.

## Avatars

**Wherever a user, contact, customer/lead, driver, supplier or tenant/company is named, assigned, mentioned or listed, render their real photo with `PersonAvatar` / `CompanyAvatar` (`apps/web/src/components/PersonAvatar.tsx`).** A name with no avatar, or a hand-rolled initials `<div>`, is wrong and gets migrated.

- Never draw `avatar_url`/`logo_url` yourself with a raw `<img>`.
- Never add a status dot next to `PersonAvatar`; live presence is built in.

## Design system

`apps/web/src/components/ui/` is the component library. **Build any new UI from it, not by hand** — check `/admin/components` first, and the replacement table in docs/DESIGN_SYSTEM.md ("Which component replaces what") before hand-building a select, menu, date input, filter or spinner.

**Never hardcode a brand colour, corner radius, or control height/padding.** Use `var(--teal)` (the per-app, per-tenant accent), `--r-sm`/`--r`, and the `--ds-btn-py-*`/`--ctl-h-*` density tokens, so the SuperAdmin theme, density and shape settings can reach them.

Verify with `npx tsc --noEmit` from `apps/web` after touching these files or their call sites.
