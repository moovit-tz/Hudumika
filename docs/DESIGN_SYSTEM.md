# Hudumika design system

## Global controls contract (7 October 2026)

- The `Tabs & Strips` setting chooses the format for shared tabs, semantic
  legacy tab lists and reviewed `data-ds-tabstrip` rows. Page-level variants
  cannot override it. CRM customer profile navigation explicitly carries
  `data-ds-tabs-exempt="crm-customers"` and retains its existing format.
- `--tab-radius` controls tab corners; `--tab-hit-height` resolves the saved
  height with a 44px minimum. No variant subtracts height or forces 999px
  corners. Underline baselines and lifted bottom corners remain square by
  design. Long rows scroll without hiding their labels.
- Buttons use `--r-sm`, cards use `--card-radius`, menus/popovers use `--r`,
  and dialogs use `--r-lg`. Cards use `--card-border-width`; other controls
  use `--border-width`. These rules are
  authoritative over local radius utilities and inline shape values.
- Existing native page/component buttons carry `data-ui-native-button` to
  inherit global shape tokens and focus feedback without changing their handlers,
  submit types, label sizes or semantic colours. New work should use `Button`.
  Radio, switch and checkbox controls and avatar identities keep their own
  component geometry. Menu rows and filters have a 44px minimum target.
- Compact shared buttons (`sm` and `icon`) follow `--ctl-h`, matching inputs
  and selects. Primary actions retain `--action-h`; text sizes do not change.
  Native controls preserve their authored heights instead of receiving a
  universal minimum width/height. Header mode and sidebar toggles use
  `data-ui-chrome-button` to retain their original pill/circle geometry.
- Shared Radix tabs keep their own keyboard handling. Reviewed legacy strips
  support Left/Right/Home/End focus movement; Enter/Space activates the existing
  button. Moving focus alone does not trigger a page action.
- Run `node scripts/audit-ui-controls.mjs` for the complete source inventory
  and `npm run check:design-system` to guard the shared contract.


The live design system is `apps/web/src/components/ui/`, backed by the
runtime tokens written by `useDesignSystem()` and scoped per app by
`WorkspaceApp`.

## Rules for new UI

- Use a primitive from `components/ui` before building markup by hand.
- Use `PageHeader` on ordinary pages. Full-screen workspace surfaces are the
  documented exception.
- Use `Button`, `Input`, `Select`, `Combobox`, `DatePicker`, `Badge`,
  `FeaturedIcon`, `Dialog`, `Switch` / `SwitchRow`, and filter components for
  their named jobs.

### Page title typography

All words in a `PageHeader` use the font selected globally in Hudumika's
design-system settings. `--page-title-font` inherits `--font`; both the plain
text and the accented final word share the same weight and normal style.
The accent keeps `var(--teal)`, so app and tenant branding still applies.
Do not use a separate serif font or italics in a page title.

The shared tokens are `--page-title-font`, `--page-title-weight` (700), and
`--page-title-size` (a responsive 1.25–1.625rem). Create/edit titles use the
same font and weight with their compact responsive size. Ordinary pages
have one semantic `h1`; use `h2` for sections and keep actions in the
`PageHeader` action slot so mobile wrapping follows the shared layout.

This follows the cohesive product-font and heading-token approach described
in [Atlassian typography](https://atlassian.design/foundations/typography),
with the compact heading hierarchy of the supplied
[Dreams Core analytics reference](https://dreamscore.dreamstechnologies.com/tailwind/ai-analytics.html).

### Icon shape

App icons and non-circular `FeaturedIcon` badges use the shared mathematical
superellipse from `lib/squircle.ts` (Lamé exponent `4.19`, with a `33%`
rounded fallback). This is the global Hudumika icon shape. Do not recreate it with a fixed pixel
`border-radius`: use `LauncherAppSvg` for an application identity and
`FeaturedIcon` for a semantic icon surface. `shape="square"` remains a legacy
alias for the squircle. Use `shape="circle"` only when the meaning is genuinely
circular, such as a status mark or avatar treatment.
- Do not hardcode a brand colour, radius, control height, shadow, or soft tint.
  Use the tokens below so tenant, app, density, shape, and theme settings work.
- Multi-step work belongs on a dedicated route. A genuinely small multi-step
  dialog must use `DialogContent size` or `steady`, `DialogHeader`,
  `DialogBody`, and `DialogFooter`.

## Sidebar submenus

Admin (`/workspace`) is the reference for app sidebar submenus. App shells
declare groups using `SidebarNavItem.children` and render them through
`AppSidebar`; `AppSidebar.css` owns their indentation, dashed guide, row
height, typography, active treatment, and chevrons for every app.
Do not override `.app-sb-children-group`, `.app-sb-item--child`, or
`.app-sb-item--parent-hdr` in an app stylesheet. Active and inactive child
rows keep the same height and font size, so navigation does not shift.

Parent rows toggle their submenu without navigating. The group containing
the current route opens by default; an explicit toggle must close it on
the first click. Keep each app's branding on the shared sidebar tokens.

## Global tabs contract

The selection in `/admin/design-system?section=tabs` is authoritative for
every app and page. Use `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent`
from `components/ui/tabs.tsx`; do not add a page-specific visual variant or
`data-variant`. The legacy `variant` prop is intentionally ignored while old
call sites are removed, so it cannot override the platform setting.

Older genuine tab strips may temporarily use `role="tablist"`, direct child
`role="tab"`, and `aria-selected`; the global compatibility rules in
`ds-tabs.css` give those controls the same selected variant. This bridge is
not permission to create new hand-built tabs. Wizard steps, radio-card
choices, view buttons, and ordinary navigation links are not tabs and must
keep their appropriate component semantics.

## Toggle / Switch

The platform toggle is a **labeled pill** — a dark-navy/primary track with an embedded "On" / "Off" text label and a sliding white circle thumb. Every boolean preference, feature flag, and settings control must use this component; a hand-rolled checkbox, a bare `<input type="checkbox">`, or a custom toggle div is wrong and gets migrated.

### The one canonical component

```tsx
import { Switch } from '@/components/ui/switch'

// Controlled — the standard case
<Switch checked={enabled} onCheckedChange={setEnabled} />
```

Source: `apps/web/src/components/ui/switch.tsx` (Radix `@radix-ui/react-switch` under the hood).

### Dimensions (platform default)

| Part | Value |
| --- | --- |
| Track | 56 × 22 px (70 % of the original 80 × 32 px reference) |
| Track corners | `border-radius: 11px` (fully round) |
| Border | 2 px transparent (keeps the visual weight without a visible stroke) |
| Thumb | 17 × 17 px white circle |
| Thumb gap (each end) | 3 px |
| Thumb travel — unchecked | `translateX(3px)` |
| Thumb travel — checked | `translateX(32px)` (inner 52 px − 17 px thumb − 3 px gap) |
| Label font | 8 px bold, uppercase, white |
| Label position | Right-aligned "Off" when unchecked; left-aligned "On" when checked |
| Label pill | `rgba(0,0,0,.25)` when Off; `rgba(255,255,255,.15)` when On |

### Color

| State | Track background |
| --- | --- |
| Unchecked | `#6b7280` (neutral-500) |
| Checked | `hsl(var(--primary))` — the tenant's contrast-safe accent |

Never use a hardcoded hex for the checked track. `hsl(var(--primary))` is the only token whose foreground contrast has been verified; `var(--teal)` and raw brand colors have no such guarantee.

### Props

| Prop | Default | Notes |
| --- | --- | --- |
| `checked` | — | **Required** — always use controlled mode. Uncontrolled `defaultChecked` only works if you never need the "On"/"Off" label to be accurate. |
| `onCheckedChange` | — | Radix callback with the new boolean. |
| `labeled` | `true` | The canonical labeled style. Pass `false` only in very dense surfaces (a narrow table column, a compact toolbar icon row) where 56 px is prohibitive. |
| `size` | `"sm"` | Only meaningful when `labeled={false}`. `"lg"` gives a slightly larger unlabeled pill. |
| `disabled` | `false` | Dims and blocks pointer events. |

### Wrapping in a settings row

For a preference row with a title and helper text, use `SwitchRow` (`ui/list-item-row.tsx`):

```tsx
import { SwitchRow } from '@/components/ui/list-item-row'

<SwitchRow
  title="Show online status"
  description="Other users can see when you are active."
  checked={showPresence}
  onCheckedChange={setShowPresence}
/>
```

For a feature kill-switch row with an icon (e.g. SuperAdmin app toggles), use `FeatureToggleRow` from the same file.

### Hand-rolled CSS toggle (Settings.tsx only)

`apps/web/src/pages/Settings.tsx` uses a plain `<button>` toggle with `.s-tog*` classes in `Settings.css` because that page predates the Radix primitive and its local `Toggle` component cannot take a dependency on Radix without restructuring the file. Those classes are kept in sync with `switch.tsx` by hand. **Do not add a third implementation.** All new surfaces use `Switch` directly.

### What not to do

- Do not hand-roll a `<div>` or `<button>` toggle anywhere except the existing `Settings.tsx` path above.
- Do not use `<input type="checkbox">` as a toggle control (use it only for multi-select lists).
- Do not hardcode the track color as a hex or `var(--teal)`.
- Do not add an external "On" / "Off" text span next to the Switch — the label is embedded inside the track.
- Do not add a separate status dot or indicator next to a `Switch` — the track color is the sole state signal.

## Token contract

| Purpose | Tokens |
| --- | --- |
| App accent | `--teal`, `--teal-l`, `--teal-m`, `--teal-fill` |
| Accessible filled action | `hsl(var(--primary))`, `hsl(var(--primary-foreground))` |
| Shape | `--radius`, `--r-sm`, `--r`, `--r-lg`, `--badge-radius` |
| Control density | `--ctl-h-xs`, `--ctl-h-sm`, `--ctl-h`, `--ctl-h-lg`; `--ds-btn-py-*`; `--ds-input-py` |
| Data density | `--ds-cell-py`, `--ds-cell-px`, `--ds-th-py`, `--ds-th-fs`, `--badge-*` |
| Detail layout | `--detail-sidebar-w`, `--detail-gap` |
| Elevation | `--elev-sm`, `--elev`, `--elev-lg` |
| Tabs | `data-tabs` on the root; `--tab-radius`, `--tab-height`, `--tab-size` |
| Spacing | `--space-xs` through `--space-xl`, `--content-gap`, `--page-pad-x` |

`--teal` is an accent for text, borders, and tints. It is not a guaranteed
contrast-safe filled surface. Use the `--primary` pair for a labelled filled
action.

## Accessibility baseline

- Use real buttons for actions; never nest an interactive control inside a
  button or fake one with `role="button"`.
- Prefer Radix-backed primitives for menus, selects, dialogs, popovers, and
  keyboard dismissal/focus management.
- Associate labels, descriptions, and validation messages with controls using
  `FormField` / `FormControl` where React Hook Form is used.
- Do not use native `<select>` or date controls for new work; use `Select`,
  `Combobox`, `DatePicker`, or `DateRangePicker` as appropriate.

## HeaderPill — announcement & event ticker

A self-contained, rotating ticker bar for surfacing time-sensitive items: announcements, calendar events, workflow alerts, or any stream where the user should notice one thing at a time without being interrupted. It is the platform's canonical "something new to tell you" surface.

**Source:** `apps/web/src/components/HeaderPill.tsx` + `HeaderPill.css` (self-imported — no extra CSS import needed).

### Anatomy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [🔍]  [ NEW ]  Starting now: Home marketing   02/09/2026, 09:00   1/2 ⏸ ‹ › × │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Part | Class | Role |
| --- | --- | --- |
| Container | `.app-header-pill` | Pill-shaped row, `height: 40px`, `border-radius: 999px`, border + `--bg` background |
| Search button | `.app-header-pill-search` | Optional — collapses the ticker back to the search input |
| Item button | `.app-header-pill-body` | Clickable region; animated on each swap (`pill-enter` keyframe) |
| Badge | `.app-header-pill-badge` | Keyword pill in `--teal-l` / `--teal`: NEW · MAINTENANCE · RELEASE · etc. |
| Title | `.app-header-pill-title` | 12.5px bold, max 45% of body, ellipsis |
| Subtitle | `.app-header-pill-sub` | 12px `--ink3`, hidden ≤1100px |
| Controls | `.app-header-pill-controls` | Counter + pause/play + prev/next + dismiss |
| Counter | `.app-header-pill-count` | `font-variant-numeric: tabular-nums` — never shifts width |
| Icon buttons | `.app-header-pill-icon` | 28×28px round, `--ink3` idle, `--ink` on hover |

### Usage

```tsx
import { HeaderPill, type PillItem } from '@/components/HeaderPill'

const items: PillItem[] = [
  {
    id: 'evt-1',
    title: 'Starting now: Board review',
    message: '14 Mar 2026, 09:00',
    badge: 'NEW',           // or 'MAINTENANCE', 'RELEASE', 'ALERT', …
    kind: 'announcement',   // 'announcement' | 'notification'
  },
]

<HeaderPill
  items={items}
  onOpen={item => navigate(item.link ?? '/')}
  onDismiss={item => markRead(item.id)}
  onExpandSearch={() => setSearchOpen(true)}   // optional; omit if no search
/>
```

### `PillItem` fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Stable key — React uses it to restart the enter animation on swap |
| `title` | `string` | Main bold text |
| `message` | `string?` | Secondary line (date, location, note) |
| `badge` | `string?` | Keyword in the badge pill. Falls back to `"NEW"` |
| `link` | `string?` | Route or URL `onOpen` can navigate to |
| `app` | `string?` | App id — optional context for the handler |
| `kind` | `'announcement' \| 'notification'` | Informational only |
| `created_at` | `string?` | ISO timestamp — informational only |

### Behavior

- **Rotation** — items cycle every 5 s (constant `ROTATE_MS`). Paused when: the user hovers, keyboard-focuses, presses the pause button, or when `prefers-reduced-motion` is set.
- **Reduced motion** — JS stops the rotation entirely (a slower carousel is still a carousel). The enter animation is also cancelled via CSS `@media (prefers-reduced-motion: reduce)`.
- **Tab hidden** — rotation stops while the browser tab is hidden.
- **Single item** — counter and prev/next/pause controls are hidden when `items.length === 1`.
- **No items** — component returns `null`; the slot reverts to the search box.
- **Accessibility** — `aria-live` is intentionally off on the rotating region (announcing every 5 s over user work is hostile). The bell icon with its unread count is the accessible summary surface.

### Where it is used

- **App header** (`AppHeader.tsx`) — center slot, desktop only (`.desktop-search`), rotates through unread announcements and notifications.

### Adding it to a new surface

Import `HeaderPill` and pass an `items` array. The component and its CSS are self-contained — no additional stylesheet import is needed. For a page-level banner (full-width, no search button), override the container width:

```css
.my-page-ticker .app-header-pill {
  max-width: none;
  border-radius: var(--r);   /* rectangular card shape instead of pill */
}
```

### Pill anti-patterns

- Do not hand-roll a rotating ticker with `setInterval` + `useState` — `HeaderPill` already handles pause-on-hover, reduced motion, tab visibility, keyboard accessibility, and WCAG 2.2.2 (pause control for moving content).
- Do not show more than one `HeaderPill` per page at the same time.
- Do not hardcode the badge color — it reads `--teal-l` / `--teal` and updates with the active app's accent automatically.

## Migration rule

Legacy `.btn`, `.input-field`, and page-local CSS remain in the product. Do
not add new usages. When touching an existing surface, migrate the control to
the live primitive or at minimum replace fixed shape/density/elevation values
with the token contract above. This keeps the migration incremental without
introducing a competing component system.

## Detail-page layout

Record-detail pages (PO detail, Bill detail, Invoice detail) share a
two-column grid: main content on the left, a sticky sidebar (Totals,
Timeline, Notes) on the right. Use these utility classes from `index.css`:

```html
<div class="detail-layout">
  <div class="detail-main">
    <!-- info-field card, metrics row, line-items table -->
  </div>
  <div class="detail-sidebar">
    <div class="sidebar-card">
      <div class="sidebar-card-title">Totals</div>
      <div class="sidebar-card-body">
        <div class="sidebar-total-row is-primary">…</div>
      </div>
    </div>
  </div>
</div>
```

Related classes: `.detail-fields` + `.detail-field-label` / `-value` / `-sub`
for the horizontal info bar (SUPPLIER, SOURCE, SHIP TO), `.detail-timeline`
for the vertical dot-line history, `.sidebar-total-row` (with `.is-primary` /
`.is-balance` modifiers) for the summary panel. At ≤960px the sidebar stacks
below the main content.

## Settings / preferences table

Configuration pages (Printer Settings, Tax Rates, Payment Methods) use
`.settings-table` — a simple `<table>` that reads the same `--ds-cell-*` /
`--ds-th-*` tokens as `DataTable`. Use `.settings-name` / `.settings-desc`
inside a `<td>` for name + subtitle rows.

## Empty state

Every list or table page that can be empty uses `.ds-empty-state`:

```html
<div class="ds-empty-state">
  <div class="ds-empty-state-icon"><Icon name="package" size={24} /></div>
  <h3>No products yet</h3>
  <p>Add your first product to start tracking inventory.</p>
  <Button>Add product</Button>
</div>
```

Do not hand-roll `<div>No data</div>` or a bespoke empty illustration.

## Date preset pills

Invoice, Bill and PO list pages share a `.date-preset-bar` with
`.date-preset-pill` buttons ("All | Today | 7 days | 30 days | This month").
The active pill uses `hsl(var(--primary))` / `hsl(var(--primary-foreground))`
via `.is-active`. These sit inside or alongside `SearchToolbar`.

## Stock activity / ledger table

Dense read-only logs (Stock Activity, GL journal entries) use `.ledger-table`
with sticky headers, alternating row backgrounds, and `.ledger-qty-in` /
`.ledger-qty-out` color classes for signed quantities.

## Loading states

Never hand-roll a `<div>Loading…</div>` or a bespoke `border-top-color:
transparent` spin. `apps/web/src/components/ui/spinner.tsx` and
`skeleton.tsx` already cover every shape this app needs:

| Situation | Use |
| --- | --- |
| A panel/card/tab/popover's content while it loads | `SectionLoading` |
| A whole page's first load | `PageLoading` |
| Inside a solid-fill button (primary, danger, …) | `ButtonSpinner` |
| A list/table/cards/detail view whose final shape you already know | `SkeletonTable` / `SkeletonCardsGrid` / `SkeletonDetail` / `SkeletonPage` |

Skeletons are for content whose shape is known; use `SectionLoading` /
`PageLoading` for everything else. Never a full-screen spinner for a partial
update — spin only the region that's actually reloading.

## Motion

Hudumika has no animation framework beyond CSS transitions — that's
deliberate, keep it that way; do not add Framer Motion, GSAP, or a spring
library for a web dashboard's motion needs. Decide *whether* to animate
before *how*:

1. **Frequency gate first.** Something the user triggers dozens of times a
   session (tab switch, row hover, focus) → no motion or the browser/Radix
   default only. Occasional (a dialog opening, a toast, a panel expanding)
   → a short, standard transition. Rare, first-time moments only → anything
   fancier. When unsure, the correct fix is usually to delete the
   animation, not add one.
2. **Name the purpose in one word** — feedback, spatial continuity, state
   change, or preventing a jarring cut — or don't build it. Data the user
   is reading (a table re-sorting, numbers updating) never moves for style.
3. **Keep it under ~200ms, ease-out.** `transition: all var(--dur, 150ms)
   var(--ease, ease)` (already the `.input-field` convention) is the
   default; do not invent a new duration/easing pair per component.
4. **Respect `prefers-reduced-motion`.** Any transition longer than a
   button-hover fade should have a reduced-motion fallback.

### Global modal motion

All Radix dialogs inherit one motion pattern from `ui/dialog.tsx` and the
`.ds-dialog-*` rules in `index.css`: the backdrop fades independently while
the content enters from above with a restrained scale-up, then uses the
shorter inverse motion when closing. Keep modal animation centralized there;
individual dialog call sites must not add `animate-*`, `zoom-*`, or `slide-*`
classes. The global pattern stays under 200ms and collapses to 1ms when the
viewer prefers reduced motion. Radix remains responsible for focus trapping,
Escape/outside-click behavior, and waiting for the exit animation before
unmounting.

## Mechanical slop pre-flight

`node scripts/check-slop-preflight.mjs` (or `npm run check:slop`) scans
every page under `apps/web/src/pages` for the four checkable symptoms of a
screen that was assembled from defaults rather than designed against this
system:

1. **Accent hues** — raw hex/rgb color literals outside `var(--teal)` /
   `var(--primary)` / the semantic tokens. `--teal` (plus its tenant/app
   theme variants) is the *only* locked accent — a hardcoded blue or purple
   CTA next to it is exactly the "AI-default styling" tell.
2. **Corner radii** — raw px `border-radius` values instead of `--r-sm` /
   `--r` / `--r-lg`. One stated scale, never violated (pill/circle shapes —
   999, 50%, etc. — are exempt; they're not part of this scale's debate).
3. **Gradients** — `linear-gradient()` / `radial-gradient()` usage. Not an
   automatic fail — a gradient the brand actually asked for is fine — but
   every one should have a reason you could state out loud.
4. **Duplicate CTA phrasing** — the same file using more than one literal
   label ("Save" / "Save changes" / "Update") for what reads as the same
   action. One label per intent, everywhere it appears.

It is a **report, not a gate** — it is not wired into `npm run typecheck`,
because the honest baseline the day it was written (470 pages scanned) was
large and pre-existing: 1,627 raw accent-color instances across 167 files
(712 of them blue — the single most common off-accent hue in the app), 1,842
raw radius instances across 266 files spanning 26 distinct raw px values
against a 3-token scale, 44 gradients across 24 files, and only 3 files with
a real duplicate-CTA-phrasing hit once the other two were checked by hand
and turned out to be legitimate ("Apply" on a popover vs. "Save" on a form;
a read-only "Close" vs. a form's "Cancel" are different intents, not drift).
The tool is regex-based, not a real parser — it also deliberately does not
flag values that look like a declared palette array (`const AVATAR_COLORS =
[...]`, a chart's category-color series) as accent violations, since those
are legitimate multi-hue surfaces this system already relies on. Its output
is a triage worklist, not an auto-fail: read the surrounding code before
changing a flagged value.

Run it, fix what's clearly real (an off-brand hex where `var(--teal)` was
obviously meant, a radius that should just be `--r-sm`), and leave what
turns out to be a legitimate palette or a genuinely distinct intent — same
discipline as the duplicate-CTA check above already had to apply to itself.

## Card outlines

All shared and legacy card containers use `--card-border` and `--card-radius`.
Card Border Width in Shape settings controls `--card-border-width` (1px default),
Border Default controls the theme-aware colour, and Large Radius controls corners.
Input/button border width is independent; local card overrides cannot make card
perimeters heavier or change their colour/radius.

## Page titles (full detail)

The title uses **one selected product font**, with colour providing emphasis:

- `titlePlain` — the leading word(s), using the shared `--page-title-font` token, which inherits the font selected in the Hudumika design system through `--font`.
- `titleEm` — the **final** word only, in the same font, weight and normal style, coloured `var(--teal)`. Do not introduce a serif or italic font for emphasis.
- Size and weight use `--page-title-size` and `--page-title-weight` (700 by default); change these centrally, never in individual pages.
- The trailing `.` is added by the component in the plain face and ink colour — never type it into `titleEm`.
- `crumbs` renders uppercase, letter-spaced, `·`-separated.

Because the accent word reads `var(--teal)`, the title automatically takes each app's own colour and the tenant's brand — orange in ClearOS, green in Admin, whatever a SuperAdmin sets. **Never hardcode that colour or the title font.** All words inherit the same globally selected font.

Splitting the title: put the noun the page is *about* in `titleEm`, the qualifier in `titlePlain` — "Customs *declarations*", "Component *showcase*", "Clearance *operations*", "Employment *records*". One word in `titleEm`, not a phrase.

Sizing, spacing and the 768/480 breakpoints live in `.page-header*` in `index.css`. Do not set a page's own `<h1>`, `fontSize`, or margin above the header — if something looks wrong, fix the CSS so every app gets the fix.

`PageHeader` is defined once. `HRM.tsx` and `SuperAdmin.tsx` grew private `PageHdr` copies; both now **delegate** to the real `PageHeader` rather than re-implementing it — each is a thin adapter that derives the crumbs and splits the last word off the title, so ~40 call sites keep their short `title`/`sub` props and still get the house style. Leave those two as they are; do not add a third, and do not re-implement a title block anywhere else.

**Full-screen app surfaces are excluded, deliberately.** Email, Drive, Calendar, Tasks and the Studio workflow builder are not list pages — their roots are `height:100%` / `flex:1; overflow:hidden` layouts, and a 43px title block does not sit *above* that content, it lands *inside* it. Adding one to Email put the title in the message-list column beside the mail, not over the app; the same was reverted for Drive. Do not add `PageHeader` to these apps. If they should carry the house identity, it needs a compact variant sized for an app toolbar row — a design decision, not a conversion.

## Avatars (full detail)

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

## Component mapping — token rules and traps (full detail)

All popover/dropdown/select/menu content renders inside Radix Popper portals; `index.css` has a global rule pinning their font to `var(--font)`, and `PopoverContent`/`SelectContent`/`DropdownMenuContent`/etc. all share one visual bar: `rounded-xl`, soft layered shadow, `backdrop-blur-md`, `ring-1 ring-black/5 dark:ring-white/10`. Match that bar if you ever add a new primitive rather than inventing a new shadow/radius style.

`Button` / `Input` / `Textarea` (`ui/button.tsx` etc.) exist and are polished to the same `rounded-lg` bar, but almost nothing in the app calls them yet — most pages still hand-roll `<button style={{...}}>` or use the legacy `.btn`/`.btn-primary` CSS classes. Prefer the `ui/` versions in new code; don't feel obligated to retrofit old call sites on sight.

**Stack note:** this design system is Radix UI + **Tailwind v4** (`@import "tailwindcss"` + `@theme{}` in `index.css`, `@tailwindcss/postcss`, no `tailwind.config.js`) — not React Aria. If a visual reference (Dribbble, Figma, another design system) uses a different headless-UI library, match its *look* on top of the existing Radix components rather than importing its source — mixing two headless-UI libraries means two portal/focus-trap/keyboard-nav systems fighting each other.

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

**Soft-tint backgrounds — always use the derived tokens, never hand-roll `color-mix()`.** The live brand color is set platform-wide by a SuperAdmin (or per-tenant) through `/admin/design-system` (`apps/web/src/hooks/useDesignSystem.ts`), which injects a `<style>` tag defining `--teal`/`--teal-l`/`--teal-m` (and `--green-l`/`--red-l`/`--gold-l`/`--blue-l`/`--purple-l`) computed from that one source color — `FeaturedIcon` and `Badge` already read these and so pick up the live theme automatically. When building a new soft-tint card/panel/icon chip by hand, reuse those same tokens directly (`background: var(--teal-l)`, `border: 1px solid var(--teal-m)`) instead of inventing your own `color-mix(in srgb, var(--teal) X%, ...)` percentage — a hand-picked percentage will *look* plausible in isolation but drifts from the canonical tint the rest of the app uses, especially once a tenant switches to a different platform theme/preset.

**Toolbar layout & horizontal margin alignment.**
- **Search placement:** In table, card, and page headers, primary section tabs / filter triggers belong on the left side of the toolbar header, while the search input sits right-aligned on the right side (`justify-content: space-between` / `margin-left: auto`).
- **Margin consistency:** All page elements — `PageHeader`, `MetricsRow`, tab headers, and data table containers — must follow identical left and right margin boundaries set by `.page-layout` (and `.app-shell-content`). Inner list page wrappers must not apply arbitrary extra horizontal padding (e.g. `padding: 24px 28px`) that indents data tables inwards relative to top metrics cards and headers.


## Register and till patterns — 23 October 2026

FinOps registers use `SearchToolbar layout="register"`: search first, structured filters beside it, and optional `dateFilter` presets (All, Today, 7 days, 30 days, This month) plus accessible From/To pickers. This opt-in pattern supersedes the older filters-left/search-right arrangement for registers; other pages retain their default. Controls wrap into full-width rows on phones. Use `PaginationBar` for result ranges, page size and page navigation, including zero results. `DataTable` supports keyboard sorting, numeric `sortValue`, multi-line record cells and row action menus. Keep identifiers and secondary contact details beneath the record name, and right-align monetary values.

POS is a full-viewport tool: its own till toolbar replaces the back-office header/sidebar. Back office and F1 enter the till; Back office exits it. Category rail becomes a horizontal strip on mobile; catalogue and sale are separate mobile panes. Maintain the configured Hudumika typography and semantic branding tokens. Printer preferences are per browser, tenant and account, with 58mm/80mm/A4, auto print, customer visibility and footer. Browser printing does not claim direct printer discovery or cash-drawer integration.
