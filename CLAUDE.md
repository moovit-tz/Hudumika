# Hudumika

Multi-tenant logistics/customs/finance/HR platform. Fastify API in `apps/api`, React SPA in `apps/web`, Postgres via Kysely. Postgres Row-Level Security is genuinely enforced (the app connects as a restricted, non-superuser, non-BYPASSRLS role — `hudumika_app`, migration 241 — and every RLS-enabled table carries `FORCE ROW LEVEL SECURITY`, migration 242) — but it is a second line of defense, not a substitute for correct code: every query must still have an explicit `.where('tenant_id', '=', user.tenant_id)`, and every route/service that touches the database must run inside `withTenant(tenantId, ...)` (or, for the narrow, audited set of genuinely cross-tenant/platform call sites, use the separate `dbPlatform` connection) so the `app.tenant_id` session variable RLS keys off is actually set. A file that queries the bare `db` singleton outside `withTenant()` is a real bug, not a style nit — RLS will reject it outright rather than silently leaking data, but it's still broken.

See [`AGENTS.md`](AGENTS.md) for the rest of the stack's conventions — backend/API patterns, verification, dependency hygiene, and the specific traps other agents (or you, in a future session) have already hit once. This file (`CLAUDE.md`) is authoritative for the design-system mapping and the tenant-isolation rule above; `AGENTS.md` is authoritative for everything else, and governs any AI agent working in this repo, not just Claude. The full reasoning, postmortems and token tables behind every rule below live in [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — this file keeps only what most tasks need on first read.

## Page titles — one style, every app, no exceptions

**Every page in every app opens with `PageHeader` (`apps/web/src/components/PageHeader.tsx`). This is not a preference; a page that hand-rolls its title is wrong and gets migrated.** Applies to every app, new and existing.

```tsx
<PageHeader
  crumbs={['ClearOS', 'Declarations']}
  titlePlain="Customs"
  titleEm="declarations"
  subtitle="Every TANSAD lodged for this workspace — its assessment, lane and release."
  actions={<Button>New declaration</Button>}   // optional
/>
```

`titleEm` is the **final** word only, coloured `var(--teal)` so it picks up each app's and tenant's own accent — never hardcode that colour or introduce a different font for it. The trailing `.` is added by the component itself; never type it into `titleEm`.

**Full-screen app surfaces are excluded, deliberately**: Email, Drive, Calendar, Tasks and the Studio workflow builder are `height:100%`/`flex:1; overflow:hidden` layouts where a title block lands *inside* the content, not above it. Do not add `PageHeader` to these.

Title-splitting examples, the `HRM.tsx`/`SuperAdmin.tsx` delegate pattern (don't add a third), and the font/token details: see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) → **Page titles (full detail)**.

## Person & company avatars — pull the real photo, everywhere

**Whenever a user, contact, customer/lead, driver, supplier, or tenant/company is named, tagged, assigned, @-mentioned, or otherwise displayed anywhere in the platform, render their real photo.** A row that shows a name with no avatar, or a hand-rolled colored-initials `<div>`, is wrong and gets migrated — assignee fields, recipient/signer lists, comment authors, mention pickers, team directories, account switchers, everywhere.

```tsx
<PersonAvatar userId={task.assigneeId} name={task.assigneeName} size={28} />
<CompanyAvatar name={tenant.name} logoUrl={tenant.logo_url} size={40} shape="square" />
```

**Never read `avatar_url`/`logo_url` off a fetched record and draw it yourself** with a raw `<img src={record.avatar_url}>` or a hand-rolled initials circle — `PersonAvatar`'s fetch carries auth context a bare `<img>` can't, and some stored pictures are base64 data URIs only a few endpoints return inline.

**The presence dot is built into `PersonAvatar` — never hand-roll a status dot next to it.** Every avatar for a real account already shows live, three-state presence (grey/gold/green) on its own; a second hand-rolled dot either duplicates it or goes stale.

The two real bugs these rules fixed (a redirect that broke authenticated fetch; a hardcoded "always online" dot), the six supported subject kinds, and the privacy-toggle behaviour: see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) → **Avatars (full detail)**.

## Design system

`apps/web/src/components/ui/` is the platform's component library (shadcn/Radix-based, themed to the app's real brand palette — teal `--primary`, not shadcn's default blue). **Any new UI — new page, new form, new modal, new panel — must be built from these components, not hand-rolled.** A live, interactive catalog lives at `/admin/components` (`apps/web/src/pages/ComponentShowcase.tsx`) — check it before building a component from scratch.

Mapping from "what native/ad-hoc thing you'd reach for" → the design-system equivalent:

- Native `<select>`, short static list → `Select` (`ui/select.tsx`)
- Native `<select>` over a long/growing list (API `.map()`) → `Combobox` (`ui/combobox.tsx`)
- Async search-as-you-type picker with inline create → `EntityPicker` (`components/EntityPicker.tsx`)
- Hand-built action/kebab menu → `DropdownMenu` (`ui/dropdown-menu.tsx`)
- Filter-toolbar pill ("Status: Open ▾") → `SingleSelectFilter` / `MultiSelectFilter` (`ui/filter-dropdown.tsx`)
- Full-width search bar with filter-count badge → `SearchToolbar` (`ui/filter-dropdown.tsx`) — never hand-roll this
- Right-click context menu → `ui/context-menu.tsx`
- Native `<input type="date">` → `DatePicker` / `DateRangePicker` (`ui/date-picker.tsx`)
- Collapsible grouped sections → `Accordion` (`ui/accordion.tsx`)
- Checkbox/switch settings row → `CheckboxRow` / `SwitchRow` (`ui/list-item-row.tsx`)
- Icon-in-a-colored-circle (empty states, card headers) → `FeaturedIcon` (`ui/featured-icon.tsx`)
- Status pill → `Badge` (`ui/badge.tsx`), soft-tint variants only
- Multi-step popup with tabs/steps → `Dialog`, **must** pass an explicit `size`
- Loading state → `SectionLoading`/`PageLoading`/`Skeleton*` — never a hand-rolled spinner

Per-component gotchas (Radix `SelectItem`'s empty-string restriction, why `EntityPicker` uses `Popover`+`PopoverAnchor` not `Command`, `SearchToolbar`'s full prop list, exact `FeaturedIcon`/`Badge` variants, the `Dialog` resize reasoning): see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) → **Component mapping (full detail)**.

**Never hardcode a brand colour, corner radius, or control height/padding** — use `var(--teal)` (the *per-app* accent, seeded per tenant/app, not a fixed colour), `--r-sm`/`--r` for corners, and the `--ds-btn-py-*`/`--ctl-h-*` density tokens. A hardcoded value that happens to match today's default isn't a style nit — it's unreachable by the settings (SuperAdmin theme preset, density, shape) that exist to control it, and it silently breaks the moment a tenant or preset changes.

Full token tables, the Tailwind v4 traps (`w-(--var)` syntax, dropped `calc()`, Radix-portal accent variables), the `--primary`/`--primary-foreground` contrast-floor rule for button text, the elevation/shadow-token bug, and the motion/slop-scanner policy: see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

Verify with `npx tsc --noEmit` from `apps/web` after touching any of these files or their call sites.
