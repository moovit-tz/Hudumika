# Hudumika

Multi-tenant logistics/customs/finance/HR platform. Fastify API in `apps/api`, React SPA in `apps/web`, Postgres via Kysely.

This file is authoritative for tenant isolation and the design-system mapping. Everything else (backend patterns, verification, dependency hygiene, known traps) is in [`AGENTS.md`](AGENTS.md), which governs every AI agent in this repo. Reasoning, token tables and per-component caveats are in [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Tenant isolation

- Every query has an explicit `.where('tenant_id', '=', user.tenant_id)`.
- Every route or service that touches the database runs inside `withTenant(tenantId, ...)`. The narrow, audited set of cross-tenant/platform call sites uses `dbPlatform` instead.
- Querying the bare `db` singleton outside `withTenant()` is a real bug. Row-Level Security is enforced and rejects it; RLS is a second line of defense, not a substitute for the two rules above.

## Page titles

**Every page in every app opens with `PageHeader` (`apps/web/src/components/PageHeader.tsx`).** A hand-rolled title is wrong and gets migrated.

```tsx
<PageHeader
  crumbs={['ClearOS', 'Declarations']}
  titlePlain="Customs"
  titleEm="declarations"
  subtitle="Every TANSAD lodged for this workspace — its assessment, lane and release."
  actions={<Button>New declaration</Button>}   // optional
/>
```

- `titleEm` is the final word only. It is coloured `var(--teal)`; never hardcode that colour or give it a different font.
- Never type the trailing `.`; the component adds it.
- Do not add `PageHeader` to the full-screen apps: Email, Drive, Calendar, Tasks, the Studio workflow builder.

## Avatars

**Wherever a user, contact, customer/lead, driver, supplier or tenant/company is named, assigned, mentioned or listed, render their real photo.** A name with no avatar, or a hand-rolled initials `<div>`, is wrong and gets migrated.

```tsx
<PersonAvatar userId={task.assigneeId} name={task.assigneeName} size={28} />
<CompanyAvatar name={tenant.name} logoUrl={tenant.logo_url} size={40} shape="square" />
```

- Never draw `avatar_url`/`logo_url` yourself with a raw `<img>`.
- Never add a status dot next to `PersonAvatar`; live presence is built in.

## Design system

`apps/web/src/components/ui/` is the component library. **Build any new UI from it, not by hand.** Check the live catalog at `/admin/components` (`apps/web/src/pages/ComponentShowcase.tsx`) first.

- Native `<select>`, short static list → `Select` (`ui/select.tsx`)
- Native `<select>` over a long/growing list (API `.map()`) → `Combobox` (`ui/combobox.tsx`)
- Async search-as-you-type picker with inline create → `EntityPicker` (`components/EntityPicker.tsx`)
- Hand-built action/kebab menu → `DropdownMenu` (`ui/dropdown-menu.tsx`)
- Filter-toolbar pill ("Status: Open ▾") → `SingleSelectFilter` / `MultiSelectFilter` (`ui/filter-dropdown.tsx`)
- Full-width search bar with filter-count badge → `SearchToolbar` (`ui/filter-dropdown.tsx`)
- Right-click context menu → `ui/context-menu.tsx`
- Native `<input type="date">` → `DatePicker` / `DateRangePicker` (`ui/date-picker.tsx`)
- Collapsible grouped sections → `Accordion` (`ui/accordion.tsx`)
- Checkbox/switch settings row → `CheckboxRow` / `SwitchRow` (`ui/list-item-row.tsx`)
- Icon in a coloured circle → `FeaturedIcon` (`ui/featured-icon.tsx`)
- Status pill → `Badge` (`ui/badge.tsx`), soft-tint variants only
- Multi-step popup with tabs/steps → `Dialog`, **must** pass an explicit `size`
- Loading state → `SectionLoading` / `PageLoading` / `Skeleton*`, never a hand-rolled spinner

**Never hardcode a brand colour, corner radius, or control height/padding.** Use `var(--teal)` (the per-app, per-tenant accent), `--r-sm`/`--r`, and the `--ds-btn-py-*`/`--ctl-h-*` density tokens, so the SuperAdmin theme, density and shape settings can reach them.

Verify with `npx tsc --noEmit` from `apps/web` after touching these files or their call sites.
