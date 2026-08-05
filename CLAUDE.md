# Hudumika

Multi-tenant logistics/customs/finance/HR platform. Fastify API in `apps/api`, React SPA in `apps/web`, Postgres via Kysely. RLS exists on tables but does **not** protect data on its own — every query must have an explicit `.where('tenant_id', '=', user.tenant_id)`.

See [`AGENTS.md`](AGENTS.md) for the rest of the stack's conventions — backend/API patterns, verification, dependency hygiene, and the specific traps other agents (or you, in a future session) have already hit once. This file (`CLAUDE.md`) is authoritative for the design-system mapping and the tenant-isolation rule above; `AGENTS.md` is authoritative for everything else, and governs any AI agent working in this repo, not just Claude.

## Page titles — one style, every app, no exceptions

**Every page in every app opens with `PageHeader` (`apps/web/src/components/PageHeader.tsx`). This is not a preference; a page that hand-rolls its title is wrong and gets migrated.** It applies to new pages and existing ones alike, in ClearOS, SEAL, Studio, NexusHR, Drive, HuduFreight, ComplyOS, Calendar, Tasks, Email, Inventory, CargoTracker, Store, Ondi, Admin, FinOps and anything added later.

```tsx
<PageHeader
  crumbs={['ClearOS', 'Declarations']}
  titlePlain="Customs"
  titleEm="declarations"
  subtitle="Every TANSAD lodged for this workspace — its assessment, lane and release."
  actions={<Button>New declaration</Button>}   // optional
/>
```

The look is a **font pairing, not just a colour**, and all three parts matter:

- `titlePlain` — the leading word(s), in `var(--font)` at weight 300. The plain face.
- `titleEm` — the **final** word only, in `Cormorant Garamond` italic 700, coloured `var(--teal)`. The special face. This is what makes it recognisable.
- The trailing `.` is added by the component in the plain face and ink colour — never type it into `titleEm`.
- `crumbs` renders uppercase, letter-spaced, `·`-separated.

Because the em word reads `var(--teal)`, the title automatically takes each app's own colour and the tenant's brand — orange in ClearOS, green in Admin, whatever a SuperAdmin sets. **Never hardcode that colour**, and never substitute a different serif; the face is part of the platform's identity.

Splitting the title: put the noun the page is *about* in `titleEm`, the qualifier in `titlePlain` — "Customs *declarations*", "Component *showcase*", "Clearance *operations*", "Employment *records*". One word in `titleEm`, not a phrase.

Sizing, spacing and the 768/480 breakpoints live in `.page-header*` in `index.css`. Do not set a page's own `<h1>`, `fontSize`, or margin above the header — if something looks wrong, fix the CSS so every app gets the fix.

`PageHeader` is defined once. `HRM.tsx` and `SuperAdmin.tsx` grew private `PageHdr` copies; those are being removed, so do not add a third.

**Full-screen app surfaces are excluded, deliberately.** Email, Drive, Calendar, Tasks and the Studio workflow builder are not list pages — their roots are `height:100%` / `flex:1; overflow:hidden` layouts, and a 43px title block does not sit *above* that content, it lands *inside* it. Adding one to Email put the title in the message-list column beside the mail, not over the app; the same was reverted for Drive. Do not add `PageHeader` to these apps. If they should carry the house identity, it needs a compact variant sized for an app toolbar row — a design decision, not a conversion.

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

**Stack note:** this design system is Radix UI + **Tailwind v4** (`@import "tailwindcss"` + `@theme{}` in `index.css`, `@tailwindcss/postcss`, no `tailwind.config.js`) — not React Aria. If a visual reference (Dribbble, Figma, another design system) uses a different headless-UI library, match its *look* on top of the existing Radix components rather than importing its source — mixing two headless-UI libraries means two portal/focus-trap/keyboard-nav systems fighting each other. See the design-system-extension work for the reasoning if this comes up again.

**v4 syntax trap — referencing a CSS variable from a utility.** Write `w-(--radix-popover-trigger-width)`, *not* `w-[--radix-popover-trigger-width]`. v4 does not accept a bare custom property inside `[…]`; it emits an invalid declaration that the browser drops, so the utility silently does nothing and you get the element's default width with no error anywhere. This is not hypothetical: all 28 such usages in the app were written the broken way, which left every Radix popover, dropdown, context menu, hover card, menubar and tooltip falling back to the popper wrapper's inline `min-width: max-content` — i.e. as wide as its longest row, overflowing its container. `w-[var(--…)]` also works if you prefer it explicit, but the parenthesised form is canonical and is what the linter asks for.

**`--teal` is the *per-app accent*, not a fixed colour.** `WorkspaceApp` (`shells/WorkspaceApp.tsx`) sets `--teal`, `--teal-l`, `--teal-m` and `--teal-d` on its own wrapper for every app, from `branding.getAppColor(appId)` — which is seeded from the active theme preset's `palette` array in `useDesignSystem.ts` and overridable per tenant. That is why one `PageHeader` renders orange in ClearOS, pink in NexusHR, green in Admin and amber in Studio with no per-app code anywhere.

The practical consequence, and it is easy to get backwards: **a hardcoded hex in a page that happens to equal that app's accent should become `var(--teal)`, not `var(--blue)` or `var(--purple)`.** Matching such a value to the nearest *semantic* token by RGB distance is wrong — it looks like a tidy-up and is actually a recolour that erases the "distinct colour per app" the preset exists to provide, and it stops a SuperAdmin preset switch from reaching that page at all.

Two related traps when retokenising colour by hand or by script:

- **Nearest-RGB cannot match light tints.** `#ecfdf5` (success), `#fef2f2` (error) and `#fffbeb` (warning) are all ~95% white, so distance is dominated by lightness and hue is invisible: all three resolve to `--bg` and every semantic panel turns grey. Match on hue first, then pick the token at the right lightness band (`--green` vs `--green-l`). This shipped once and had to be reverted.
- **Tailwind v4 silently drops `calc()` inside an arbitrary value over a CSS variable.** `py-[calc(var(--ds-btn-py,9px)*0.6)]` emits nothing, the control falls back to its `min-h` floor, and a size scale collapses with no error anywhere. Compute the arithmetic in `useDesignSystem.ts` and reference a plain `py-[var(--ds-btn-py-sm)]`.

**Control size and shape come from the density/shape tokens — never from a number you pick.** One ladder governs every button, input and pill in every app:

| step | token | renders |
|---|---|---|
| xs | `--ds-btn-py-xs` | ~28px — table row actions |
| sm | `--ds-btn-py-sm` | ~36px — the app's most common button |
| default | `--ds-btn-py` | ~40px — page/toolbar actions |
| lg | `--ds-btn-py-lg` | ~48px |

**Height is stated, not derived — `min-height: var(--ctl-h)` (`--ctl-h-xs`/`-sm`/`-lg`).** A button's height used to be the sum of padding + font-size + line-height + border, and every one of those four could break it on its own: a borderless primary rendered 2px under the bordered secondary beside it (72 rules declare `border: none`), and SEAL's `line-height: 1.2` put a whole app 4px under everything else. Unifying padding alone did not fix it and never could. With a floor, only the floor decides. `.btn` also sets `line-height: 1.25` so the content stays *under* its own floor — a floor that the content exceeds is not a floor.

Corners read `--r-sm` / `--r`; **never a raw px radius**. All of these are derived in `useDesignSystem.ts` from the SuperAdmin density and shape settings, so a hardcoded value is not merely inconsistent — it is unreachable by the settings that exist to control it.

Three rules, each learned from a real defect:

- **Never re-declare `.btn-primary` / `.btn-secondary` / `.btn-sm` in an app's own stylesheet.** Eleven app CSS files each carried a private copy with `padding: 11px 26px; min-height: 42px; border-radius: 10px`. That is *the* reason apps looked different from one another, and `min-height` meant no fix to the tokens could ever reach those buttons. An app stylesheet may set **appearance** — background, gradient, border-color, box-shadow — and nothing about the **box**.
- **A size class you use must exist.** `.btn-xs` was used but never defined, so it fell through to `.btn`'s base padding and drew an "extra small" button *taller* than the `.btn-sm` beside it. Grep the CSS before inventing a modifier.
- **Font size changes height too.** Once padding agrees, `13 / 12.5 / 11.5` still renders `38 / 35 / 33`. Stay on the ladder (12 / 13 / 14 / 15); half-pixel sizes are drift, not a design step.

Hand-rolled `<button style={{…}}>` is still the majority of the app (~900 of them). If you touch one, point its vertical padding and radius at these tokens rather than leaving a frozen number behind. Verify with a live measurement, not by reading the CSS — inline styles beat classes, and this codebase has burned several sessions on fixes that were real in the source and invisible on screen.

**Radix overlays are portalled to `document.body`, outside `.app-color-scope`.** Select, DropdownMenu, Popover, ContextMenu, Tooltip, HoverCard and Menubar content is *not* a descendant of the app wrapper, so a variable set only on that wrapper is invisible to every one of them — inside SEAL the page read `--teal: #059669` while each dropdown it opened read the tenant's `#ea580c` and painted orange. `WorkspaceApp` therefore writes its 13 accent variables to `document.documentElement` **as well as** its wrapper, and removes them on cleanup. If you add a new accent variable, add it to that same map or overlays will not see it. Verify with a *portal* element, never with the trigger.

Badges and chips run on two steps: `--badge-py`/`-px`/`-fs`/`-min-h` and the `-sm` suffix for the small count bubble on a nav item or tab. Eight ad-hoc font sizes (9 → 12.5) across 88 rules used to make a status pill, a filter chip and a count badge three different sizes with no rule behind which.

**Soft-tint backgrounds — always use the derived tokens, never hand-roll `color-mix()`.** The live brand color is set platform-wide by a SuperAdmin (or per-tenant) through `/admin/design-system` (`apps/web/src/hooks/useDesignSystem.ts`), which injects a `<style>` tag defining `--teal`/`--teal-l`/`--teal-m` (and `--green-l`/`--red-l`/`--gold-l`/`--blue-l`/`--purple-l`) computed from that one source color — `FeaturedIcon` and `Badge` already read these and so pick up the live theme automatically. When building a new soft-tint card/panel/icon chip by hand, reuse those same tokens directly (`background: var(--teal-l)`, `border: 1px solid var(--teal-m)`) instead of inventing your own `color-mix(in srgb, var(--teal) X%, ...)` percentage — a hand-picked percentage will *look* plausible in isolation but drifts from the canonical tint the rest of the app uses, especially once a tenant switches to a different platform theme/preset. This applies to every app in the platform and to any new app added later, not just one page.

Verify with `npx tsc --noEmit` from `apps/web` after touching any of these files or their call sites.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
