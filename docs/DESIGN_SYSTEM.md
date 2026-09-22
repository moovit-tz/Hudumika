# Hudumika design system

The live design system is `apps/web/src/components/ui/`, backed by the
runtime tokens written by `useDesignSystem()` and scoped per app by
`WorkspaceApp`.

## Rules for new UI

- Use a primitive from `components/ui` before building markup by hand.
- Use `PageHeader` on ordinary pages. Full-screen workspace surfaces are the
  documented exception.
- Use `Button`, `Input`, `Select`, `Combobox`, `DatePicker`, `Badge`,
  `FeaturedIcon`, `Dialog`, and filter components for their named jobs.
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
