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

- Native `<select>`, short static option list → `Select` / `SelectTrigger` / `SelectValue` / `SelectContent` / `SelectItem` (`ui/select.tsx`). Radix `SelectItem` cannot have an empty-string `value` — use a sentinel like `'__none__'` and translate to/from `''` at the value/onChange boundary.
- Native `<select>` over a long or growing list (vehicles, drivers, staff, customers, shipments — anything from an API `.map()`) → `Combobox` (`ui/combobox.tsx`). No empty-string restriction here.
- Async "search-as-you-type against an API, with inline create" picker → `EntityPicker` (`apps/web/src/components/EntityPicker.tsx`), built on `Popover` + `PopoverAnchor` (not `Command`, since the input is the anchor/trigger itself, outside the popover).
- Hand-built action/kebab menu (a `useState` open flag + absolutely-positioned div) → `DropdownMenu` / `DropdownMenuItem` / `DropdownMenuSeparator` / `DropdownMenuCheckboxItem` (`ui/dropdown-menu.tsx`). Radix owns open/close and outside-click — delete the old `useState`/`useRef`/`mousedown`-listener boilerplate when you migrate one.
- Filter-toolbar pill ("Status: Open ▾") → `SingleSelectFilter` / `MultiSelectFilter` (`ui/filter-dropdown.tsx`).
- Full-width search bar with active-filter count badge (list pages where search is the dominant control; clicking "Filters ●N" opens a filter panel or reveals filter pills below) → `SearchToolbar` (`ui/filter-dropdown.tsx`). Props: `search`/`onSearch`, `placeholder`, `activeFilterCount` (drives the badge), `onFiltersClick`/`filtersOpen` (toggle the filter panel), `onExpand` (optional expand button), `actions` slot (extra ReactNode for icon buttons or a DropdownMenu in the right action area). **Do not hand-roll a `<div><Icon /><input /></div>` search block on a list page — use `SearchToolbar` instead.**
- Genuine right-click context menu (x/y positioned, not trigger-anchored) → `ui/context-menu.tsx` (Radix `ContextMenu` primitive).
- Native `<input type="date">` → `DatePicker` (`ui/date-picker.tsx`) for a single date; `DateRangePicker` (same file) for a from/to range. Both are a styled trigger button + `Popover` + the themed `Calendar` (`ui/calendar.tsx`, built on `react-day-picker`).
- Collapsible grouped sections (FAQ, checklists, filter groups) → `Accordion` / `AccordionItem` / `AccordionTrigger` / `AccordionContent` (`ui/accordion.tsx`). Card-style items (`rounded-xl border`), so wrap the list in a container with `className="flex flex-col gap-2"` for spacing between items.
- Checkbox/switch settings row with a label + helper text → `CheckboxRow` / `SwitchRow` (`ui/list-item-row.tsx`).
- Icon-in-a-colored-circle/square (empty states, document rows, notification lists, card headers) → `FeaturedIcon` (`ui/featured-icon.tsx`). Takes the icon as `children`, `variant` (`brand`/`gray`/`success`/`warning`/`error`/`info`), `size` (`sm`/`md`/`lg`/`xl`), `shape` (`square`/`circle`).
- Status pill (Cleared / Overdue / Draft / …) → `Badge` (`ui/badge.tsx`) with the soft-tint `variant`s (`brand`/`success`/`warning`/`error`/`info`/`gray`) — background tint + matching-hue text, not a solid fill.
- Multi-step popup with tabs/steps → `Dialog`/`DialogContent` **must** pass `size` (`sm`/`md`/`lg`/`xl`/`full`) and lay out `DialogHeader`+`DialogBody`+`DialogFooter`, so the dialog doesn't resize as the user moves between steps. Omitting `size` is fine only for a genuinely single-view dialog.
- Loading state → `SectionLoading`/`PageLoading`/`ButtonSpinner` (`ui/spinner.tsx`) or the shape-matched `Skeleton*` family (`ui/skeleton.tsx`) — never a hand-rolled `<div>Loading…</div>` or spin keyframe.

**Never hardcode a brand colour, corner radius, or control height/padding** — use `var(--teal)` (the *per-app* accent, seeded per tenant/app, not a fixed colour), `--r-sm`/`--r` for corners, and the `--ds-btn-py-*`/`--ctl-h-*` density tokens. A hardcoded value that happens to match today's default isn't a style nit — it's unreachable by the settings (SuperAdmin theme preset, density, shape) that exist to control it, and it silently breaks the moment a tenant or preset changes.

Full token tables, the Tailwind v4 traps (`w-(--var)` syntax, dropped `calc()`, Radix-portal accent variables), the `--primary`/`--primary-foreground` contrast-floor rule for button text, the elevation/shadow-token bug, and the motion/slop-scanner policy: see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

Verify with `npx tsc --noEmit` from `apps/web` after touching any of these files or their call sites.
