# Hudumika

Multi-tenant logistics/customs/finance/HR platform. Fastify API in `apps/api`, React SPA in `apps/web`, Postgres via Kysely. RLS exists on tables but does **not** protect data on its own — every query must have an explicit `.where('tenant_id', '=', user.tenant_id)`.

See [`AGENTS.md`](AGENTS.md) for the rest of the stack's conventions — backend/API patterns, verification, dependency hygiene, and the specific traps other agents (or you, in a future session) have already hit once. This file (`CLAUDE.md`) is authoritative for the design-system mapping and the tenant-isolation rule above; `AGENTS.md` is authoritative for everything else, and governs any AI agent working in this repo, not just Claude.

## Design system

`apps/web/src/components/ui/` is the platform's component library (shadcn/Radix-based, themed to the app's real brand palette — teal `--primary`, not shadcn's default blue). **Any new UI — new page, new form, new modal, new panel — must be built from these components, not hand-rolled.** A live, interactive catalog of everything below lives at `/admin/components` (`apps/web/src/pages/ComponentShowcase.tsx`) — check it before building a component from scratch.

Mapping from "what native/ad-hoc thing you'd reach for" → the design-system equivalent:

- Native `<select>`, short static option list → `Select` / `SelectTrigger` / `SelectValue` / `SelectContent` / `SelectItem` (`ui/select.tsx`). Radix `SelectItem` cannot have an empty-string `value` — use a sentinel like `'__none__'` and translate to/from `''` at the value/onChange boundary.
- Native `<select>` over a long or growing list (vehicles, drivers, staff, customers, shipments — anything from an API `.map()`) → `Combobox` (`ui/combobox.tsx`). No empty-string restriction here.
- Async "search-as-you-type against an API, with inline create" picker → `EntityPicker` (`apps/web/src/components/EntityPicker.tsx`), built on `Popover` + `PopoverAnchor` (not `Command`, since the input is the anchor/trigger itself, outside the popover).
- Hand-built action/kebab menu (a `useState` open flag + absolutely-positioned div) → `DropdownMenu` / `DropdownMenuItem` / `DropdownMenuSeparator` / `DropdownMenuCheckboxItem` (`ui/dropdown-menu.tsx`). Radix owns open/close and outside-click — delete the old `useState`/`useRef`/`mousedown`-listener boilerplate when you migrate one.
- Filter-toolbar pill ("Status: Open ▾") → `SingleSelectFilter` / `MultiSelectFilter` (`ui/filter-dropdown.tsx`).
- Genuine right-click context menu (x/y positioned, not trigger-anchored) → `ui/context-menu.tsx` (Radix `ContextMenu` primitive).
- Native `<input type="date">` → `DatePicker` (`ui/date-picker.tsx`) for a single date; `DateRangePicker` (same file) for a from/to range. Both are a styled trigger button + `Popover` + the themed `Calendar` (`ui/calendar.tsx`, built on `react-day-picker`).
- Collapsible grouped sections (FAQ, checklists, filter groups) → `Accordion` / `AccordionItem` / `AccordionTrigger` / `AccordionContent` (`ui/accordion.tsx`). Card-style items (`rounded-xl border`), so wrap the list in a container with `className="flex flex-col gap-2"` for spacing between items.
- Checkbox/switch settings row with a label + helper text → `CheckboxRow` / `SwitchRow` (`ui/list-item-row.tsx`).
- Icon-in-a-colored-circle/square (empty states, document rows, notification lists, card headers — the pattern this app used to reinvent inline with a one-off `<div style={{background: ...}}>` every time) → `FeaturedIcon` (`ui/featured-icon.tsx`). Takes the icon as `children` (works with the app's own `Icon` component or a raw lucide icon), `variant` (`brand`/`gray`/`success`/`warning`/`error`/`info`), `size` (`sm`/`md`/`lg`/`xl`), `shape` (`square`/`circle`).
- Status pill (Cleared / Overdue / Draft / …) → `Badge` (`ui/badge.tsx`) with the soft-tint `variant`s (`brand`/`success`/`warning`/`error`/`info`/`gray`) — background tint + matching-hue text, not a solid fill. Same semantic colors as `FeaturedIcon`, both sourced from the app's existing `--green`/`--gold`/`--red`/`--blue`/`--teal` (+ `-l` light-tint) CSS variables in `index.css`, not a new palette.

All of the above render inside Radix Popper portals; `index.css` has a global rule pinning their font to `var(--font)`, and `PopoverContent`/`SelectContent`/`DropdownMenuContent`/etc. all share one visual bar: `rounded-xl`, soft layered shadow, `backdrop-blur-md`, `ring-1 ring-black/5 dark:ring-white/10`. Match that bar if you ever add a new primitive rather than inventing a new shadow/radius style.

`Button` / `Input` / `Textarea` (`ui/button.tsx` etc.) exist and are polished to the same `rounded-lg` bar, but almost nothing in the app calls them yet — most pages still hand-roll `<button style={{...}}>` or use the legacy `.btn`/`.btn-primary` CSS classes. Prefer the `ui/` versions in new code; don't feel obligated to retrofit old call sites on sight.

**Stack note:** this design system is Radix UI + Tailwind v3 (not React Aria, not Tailwind v4). If a visual reference (Dribbble, Figma, another design system) uses a different headless-UI library, match its *look* on top of the existing Radix components rather than importing its source — mixing two headless-UI libraries means two portal/focus-trap/keyboard-nav systems fighting each other. See the design-system-extension work for the reasoning if this comes up again.

**Soft-tint backgrounds — always use the derived tokens, never hand-roll `color-mix()`.** The live brand color is set platform-wide by a SuperAdmin (or per-tenant) through `/admin/design-system` (`apps/web/src/hooks/useDesignSystem.ts`), which injects a `<style>` tag defining `--teal`/`--teal-l`/`--teal-m` (and `--green-l`/`--red-l`/`--gold-l`/`--blue-l`/`--purple-l`) computed from that one source color — `FeaturedIcon` and `Badge` already read these and so pick up the live theme automatically. When building a new soft-tint card/panel/icon chip by hand, reuse those same tokens directly (`background: var(--teal-l)`, `border: 1px solid var(--teal-m)`) instead of inventing your own `color-mix(in srgb, var(--teal) X%, ...)` percentage — a hand-picked percentage will *look* plausible in isolation but drifts from the canonical tint the rest of the app uses, especially once a tenant switches to a different platform theme/preset. This applies to every app in the platform and to any new app added later, not just one page.

Verify with `npx tsc --noEmit` from `apps/web` after touching any of these files or their call sites.
