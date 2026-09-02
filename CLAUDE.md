# Hudumika

Multi-tenant logistics/customs/finance/HR platform. Fastify API in `apps/api`, React SPA in `apps/web`, Postgres via Kysely. Postgres Row-Level Security is genuinely enforced (the app connects as a restricted, non-superuser, non-BYPASSRLS role — `hudumika_app`, migration 241 — and every RLS-enabled table carries `FORCE ROW LEVEL SECURITY`, migration 242) — but it is a second line of defense, not a substitute for correct code: every query must still have an explicit `.where('tenant_id', '=', user.tenant_id)`, and every route/service that touches the database must run inside `withTenant(tenantId, ...)` (or, for the narrow, audited set of genuinely cross-tenant/platform call sites, use the separate `dbPlatform` connection) so the `app.tenant_id` session variable RLS keys off is actually set. A file that queries the bare `db` singleton outside `withTenant()` is a real bug, not a style nit — RLS will reject it outright rather than silently leaking data, but it's still broken.

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

`PageHeader` is defined once. `HRM.tsx` and `SuperAdmin.tsx` grew private `PageHdr` copies; both now **delegate** to the real `PageHeader` rather than re-implementing it — each is a thin adapter that derives the crumbs and splits the last word off the title, so ~40 call sites keep their short `title`/`sub` props and still get the house style. Leave those two as they are; do not add a third, and do not re-implement a title block anywhere else.

**Full-screen app surfaces are excluded, deliberately.** Email, Drive, Calendar, Tasks and the Studio workflow builder are not list pages — their roots are `height:100%` / `flex:1; overflow:hidden` layouts, and a 43px title block does not sit *above* that content, it lands *inside* it. Adding one to Email put the title in the message-list column beside the mail, not over the app; the same was reverted for Drive. Do not add `PageHeader` to these apps. If they should carry the house identity, it needs a compact variant sized for an app toolbar row — a design decision, not a conversion.

## Person & company avatars — pull the real photo, everywhere

**Whenever a user, contact, customer/lead, driver, supplier, or tenant/company is named, tagged, assigned, @-mentioned, or otherwise displayed anywhere in the platform, render their real photo.** Not a preference — a row that shows a name with no avatar, or a hand-rolled colored-initials `<div>`, is wrong and gets migrated, the same way a hand-rolled page title is. This applies to assignee fields, recipient/signer lists, comment and activity-log authors, mention pickers, team/staff directories, "shared with" lists, table row owners, and any account-switcher header — in every app, not just the ones that happen to have it already.

Use `PersonAvatar` for a person and `CompanyAvatar` for a company/tenant logo, both from `apps/web/src/components/PersonAvatar.tsx`:

```tsx
<PersonAvatar userId={task.assigneeId} name={task.assigneeName} size={28} />
<CompanyAvatar name={tenant.name} logoUrl={tenant.logo_url} size={40} shape="square" />
```

`PersonAvatar` fetches the real photo once (cached, and live-updating everywhere it's mounted when someone's picture changes) whenever `userId` + `kind` resolves one, and falls back to deterministic colored initials derived from `name` when it doesn't. That fallback is the *correct* rendering for someone who hasn't set a picture — not a degraded state — so `<PersonAvatar name="..." />` with no id is the right call when there's genuinely no account to look up (an external signer, an unclaimed owner). Both components, and the editable `AvatarPicker` (same folder) for upload/remove UI, sit on `apps/web/src/lib/identity.ts` and the tenant-scoped `GET/PUT/DELETE /v1/identity/:kind/:id/avatar` API (`apps/api/src/routes/identity.routes.ts`), which already covers six subject kinds through the `SUBJECTS` registry at the top of that file — `people` (users), `customers`, `leads`, `contacts`, `drivers`, `suppliers`. Adding a new kind of "who" is a one-line addition to that registry, not a new ad-hoc image column or a parallel avatar system.

**Never read `avatar_url`/`logo_url` off a fetched record and draw it yourself with a raw `<img src={record.avatar_url}>` or a hand-rolled initials circle.** Two real failure modes motivated the shared components: a stored picture can be a base64 data URI that only a handful of endpoints return inline (everywhere else you get a served URL instead, precisely so a list of hundreds of people doesn't ship megabytes of embedded images) — and a plain `<img src>` cannot carry the Authorization/session context `PersonAvatar`'s fetch does, so a component reading the raw field directly is one auth-timing coincidence away from a broken image. The other: `GET /:kind/:id/avatar` proxies a stored plain http(s) URL (e.g. a CRM contact's stock-photo pick, a legacy `logo_url`) by fetching it server-side and streaming the bytes back same-origin — it used to `reply.redirect()` to it instead, which is exactly what a bare `<img>` needs but breaks `PersonAvatar`'s authenticated `fetch()`, since a redirect to a third-party host is subject to that host's CORS policy, not the app's. Shipped once with `Contacts.tsx` reading `contact.avatar_url` directly and a preset Unsplash photo silently failing to load; fixed at the API layer so every caller benefits, not just that one screen.

### The presence dot is built into `PersonAvatar` — never hand-roll a status dot

Every `PersonAvatar` for a real account (`kind: 'people'` with a `userId` — the default) already draws a live, three-state status dot on its own: **grey** = offline (no active session), **gold/yellow** = online but not clocked in, **green** = online and clocked in. This is real, API-linked presence (`apps/web/src/lib/presence.ts`, batched/cached the same way avatar photos are — one poll per screen, not one per avatar), backed by `user_presence` (a heartbeat `useAuth.tsx` sends every 60s) plus the live HR clock-in session, not a fabricated local flag. It ships automatically, everywhere `PersonAvatar` renders one — you don't opt into it.

**Never draw your own status-indicator `<span>` next to a `PersonAvatar`.** A hand-rolled dot — even one meant to say the same thing — either duplicates the real one (two dots stacked, one of them lying) or replaces it with something that's hardcoded and never updates. This shipped once: the account-switcher header (`AppHeader.tsx`, both the top-bar trigger and the dropdown's identity block) carried its own `background: var(--green)` dot from before the real presence system existed, so it *always* read "online" regardless of the account's actual state, while the exact same person's `PersonAvatar` two pixels away on the ESS hub card correctly cycled through all three colours. Fixed by deleting the hardcoded dots — `PersonAvatar` already had the real one.

The three surfaces where a signed-in user's own avatar appears — the ESS hub card, the header trigger, and the header's dropdown identity block — read the *same* live state by construction (one shared, cached poll per screen), so they can't drift out of sync with each other; if you ever see them disagree, the bug is a duplicate hand-rolled dot like the one above, not a real desync to "fix" by adding another poll.

A user can turn their own presence off (Profile → Personal Info → Privacy → "Show my online status") — when off, everyone else always sees them as offline; they still see their own real state. Respect that toggle by not building a second, unofficial way to show someone's status that bypasses it.

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

**A button surface's text is `hsl(var(--primary-foreground))`, never a hardcoded `#fff`/`white`.** `--teal` (and the per-app accent it carries) is the tenant's raw brand hex with no contrast guarantee at all — a tenant can pick a light pink, a pale gold, anything. `--primary`/`--primary-foreground` are the *derived* pair: `useDesignSystem.ts` and `WorkspaceApp.tsx` both run the brand colour through `enforceContrastFloor()` (nudges it until AA passes) and `pickForegroundHsl()` (picks dark-navy or near-white, whichever actually wins the contrast check) before writing them — see `apps/web/src/lib/color.ts`. The modern `ui/button.tsx` `Button` already reads this pair via Tailwind's `bg-primary text-primary-foreground`, which is why it always renders correctly regardless of theme or tenant colour. Every hand-rolled button/pill/badge that instead wrote `background: var(--teal); color: #fff;` (or `var(--white)`) skipped that math — it looked fine for the default orange but rendered illegible-or-borderline white-on-pastel text for any tenant whose colour didn't clear the floor, in *both* themes, not just dark. Found and fixed platform-wide (~40 call sites across `index.css` and per-page CSS, plus ~145 inline-style occurrences across 75 `.tsx` files) after a NexusHR dark-mode button was compared against the same pattern elsewhere: the fix in every case was `background: hsl(var(--primary)); color: hsl(var(--primary-foreground));` — background and foreground always change **together**, never just the text, or the pairing math is void. Note `--primary`/`--primary-foreground` are raw `H S% L%` triplets (matching Tailwind's `hsl(var(--x))` convention) — write `hsl(var(--primary))`, not bare `var(--primary)`, in plain CSS or an inline `style`. This floor currently exists only for `--primary` (the button-surface token); `--teal` and the semantic colours (`--red`/`--green`/`--gold`/`--blue`/`--purple`) are still un-floored and meant for tints/accents/text, not as a solid fill with a hardcoded-contrast label on top — `.btn-danger`'s `background: var(--red); color: #fff;` is the same shape of risk and hasn't been given the same treatment yet.

**Elevation lives in `--elev-sm` / `--elev` / `--elev-lg`, never in `--shadow-*`.** `--shadow-*` belongs to Tailwind's own scale, and `@theme` aliases it onto the `--elev-*` values. It used to read `--shadow-sm: var(--shadow-sm)` — a property defined as itself, which CSS treats as invalid at computed-value time — so every `shadow-sm`/`shadow-md`/`shadow-lg` in the `ui/` library rendered a fully transparent shadow and the SuperAdmin elevation setting reached nothing built on Radix. **Never alias an `@theme` key to a variable of the same name.** `.card` reads `--card-shadow`, which defaults to `var(--elev-sm)` — it was a hardcoded `none`, so no card in any app carried a shadow at all.

When checking a shadow, read the **whole** computed `box-shadow`: Tailwind emits four transparent placeholders (`inset-shadow`, `inset-ring`, `ring-offset`, `ring`) *before* the real value, so truncating the string makes a working shadow look empty.

**Radix overlays are portalled to `document.body`, outside `.app-color-scope`.** Select, DropdownMenu, Popover, ContextMenu, Tooltip, HoverCard and Menubar content is *not* a descendant of the app wrapper, so a variable set only on that wrapper is invisible to every one of them — inside SEAL the page read `--teal: #059669` while each dropdown it opened read the tenant's `#ea580c` and painted orange. `WorkspaceApp` therefore writes its 13 accent variables to `document.documentElement` **as well as** its wrapper, and removes them on cleanup. If you add a new accent variable, add it to that same map or overlays will not see it. Verify with a *portal* element, never with the trigger.

Badges and chips run on two steps: `--badge-py`/`-px`/`-fs`/`-min-h` and the `-sm` suffix for the small count bubble on a nav item or tab. Eight ad-hoc font sizes (9 → 12.5) across 88 rules used to make a status pill, a filter chip and a count badge three different sizes with no rule behind which.

**Soft-tint backgrounds — always use the derived tokens, never hand-roll `color-mix()`.** The live brand color is set platform-wide by a SuperAdmin (or per-tenant) through `/admin/design-system` (`apps/web/src/hooks/useDesignSystem.ts`), which injects a `<style>` tag defining `--teal`/`--teal-l`/`--teal-m` (and `--green-l`/`--red-l`/`--gold-l`/`--blue-l`/`--purple-l`) computed from that one source color — `FeaturedIcon` and `Badge` already read these and so pick up the live theme automatically. When building a new soft-tint card/panel/icon chip by hand, reuse those same tokens directly (`background: var(--teal-l)`, `border: 1px solid var(--teal-m)`) instead of inventing your own `color-mix(in srgb, var(--teal) X%, ...)` percentage — a hand-picked percentage will *look* plausible in isolation but drifts from the canonical tint the rest of the app uses, especially once a tenant switches to a different platform theme/preset. This applies to every app in the platform and to any new app added later, not just one page.

**Toolbar layout & horizontal margin alignment.**
- **Search placement:** In table, card, and page headers, primary section tabs / filter triggers belong on the left side of the toolbar header, while the search input sits right-aligned on the right side (`justify-content: space-between` / `margin-left: auto`).
- **Margin consistency:** All page elements — `PageHeader`, `MetricsRow`, tab headers, and data table containers — must follow identical left and right margin boundaries set by `.page-layout` (and `.app-shell-content`). Inner list page wrappers must not apply arbitrary extra horizontal padding (e.g. `padding: 24px 28px`) that indents data tables inwards relative to top metrics cards and headers.

Verify with `npx tsc --noEmit` from `apps/web` after touching any of these files or their call sites.
