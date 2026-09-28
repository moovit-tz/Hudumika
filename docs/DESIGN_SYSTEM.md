# Hudumika design system

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
| Data density | `--ds-cell-py`, `--badge-*` |
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
