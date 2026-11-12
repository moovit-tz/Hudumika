# Design system baseline — 12 November 2026

A measured snapshot of how far `apps/web` actually uses the shared design
system, taken before the staged migration. Every number below comes from a
command you can re-run; the command is given beside it. Counts made with a
line-based search undercount tags that span several lines and are marked
"approx".

The rules these numbers are measured against live in
[`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) and `CLAUDE.md`.

## What exists

| Piece | Where | Size |
| --- | --- | --- |
| Component library | `apps/web/src/components/ui/` | 71 files |
| Global tokens and base styles | `apps/web/src/index.css` | 7,532 lines |
| Shared control contract (unlayered, beats utilities) | `apps/web/src/components/ui/control-contract.css` | — |
| Runtime tenant theming | `apps/web/src/hooks/useDesignSystem.ts` | — |
| Per-app accent | `apps/web/src/shells/WorkspaceApp.tsx` | — |
| Contrast maths | `apps/web/src/lib/color.ts` | — |
| Live catalog | `/admin/design-system?section=components` (`pages/ComponentShowcase.tsx`) | 18 sections |
| Page and component CSS files | `apps/web/src/**/*.css` | 164 files |

There is one library. No second component package exists and none should be
added.

## Guards already in the repo

| Guard | Command | Result on this date |
| --- | --- | --- |
| Contract check | `npm run check:design-system` | passes, 19 checks |
| Slop pre-flight | `npm run check:slop` | 453 of 683 page files clean |
| Control inventory | `node scripts/audit-ui-controls.mjs` | see Buttons below |
| Control rendering (browser) | `node scripts/check-ui-control-rendering.mjs` | not re-run for this report |
| Focus and target size (browser) | `node scripts/check-ui-focus-targets.mjs` | passes, 33 measurements (new) |
| Typecheck | `npx tsc --noEmit` in `apps/web` | 0 errors |

## Adoption, by rule

### Buttons

`node scripts/audit-ui-controls.mjs`, first line of output:

- 3,288 shared `Button` usages.
- 2,380 native `<button>` elements, of which 2,300 carry
  `data-ui-native-button` and so inherit the token-linked contract styling.
- 80 native buttons are untagged and unstyled by the contract.

The tagged native buttons look right but are not the component: they get no
`loading` state, no `iconOnly` tooltip mirroring and no variant API. They are
the largest single migration surface.

### Busy state on save buttons

- 346 hand-written `saving ? 'Saving…' : 'Save'` labels in 253 files (approx;
  `grep -rE "\? '(Saving|Loading|Creating|Sending|Submitting|Deleting|Updating)(…|\.\.\.)'"`).
- 0 uses of a `loading` prop before today, because `Button` had none.

Each of those buttons is natively `disabled` while saving, which drops
keyboard focus to `<body>` for the length of the request.

### Native form controls

- Native `<select>`: 19 occurrences in 7 files (approx).
- Native `type="date"`: 29 occurrences in 18 files (approx).

Both are small and finite. The mapping to `Select` / `Combobox` /
`DatePicker` is in `CLAUDE.md`.

### Page titles

- `<PageHeader`: 563 usages in 498 files, against 683 page files.

The difference is not all debt: the full-screen apps (Email, Drive, Calendar,
Tasks, Studio) are excluded by rule, and sub-pages embedded in a parent do not
carry their own header. A per-file pass is needed to separate the two.

### Avatars

- Raw `<img>` reading `avatar_url` / `logo_url`: 1 occurrence in 1 file
  (approx). Effectively migrated.

### Colour, radius, gradients

From `npm run check:slop`:

- 779 raw colour literals in 101 files (459 of them blue). A further 269 sit
  in deliberate palettes (avatars, charts, categories) and are not counted.
- 589 raw pixel border-radius values in 184 files, using 23 distinct values
  against a token scale of three (`--r-sm`, `--r`, `--r-lg`).
- 18 gradients in 16 files.
- Worst files by raw colour: `pages/calls/MeetingRoom.tsx` (84),
  `pages/sign/SignDocumentStudio.tsx` (54),
  `pages/sign/AiDocumentGeneratorModal.tsx` (43), `pages/sign/SignCompose.tsx`
  (33), `pages/landedcost/print.tsx` (32).

Every one of these is a value the SuperAdmin theme, density and shape
settings cannot reach.

### Inline styles

- `style={{`: 24,286 occurrences in 721 files (approx).

Inline styles are not wrong by themselves — most reference tokens — but this
is why the raw-value counts above are spread so widely. It is context, not a
migration target.

## Accessibility (WCAG 2.2 AA)

### Fixed in the shared layer on this date

| Issue | Evidence | Fix |
| --- | --- | --- |
| Field focus outline was a 38% accent tint, 1.76:1 against the page (needs 3:1, SC 1.4.11) | measured in browser | one outline rule in `control-contract.css` using `--focus-ring-color` |
| Buttons, checkbox, switch, radio each suppressed the outline and drew their own ring, or none | `focus-visible:outline-none` in each primitive | suppression removed; all share the contract rule |
| A pale tenant accent produced a near-invisible ring (`#fde68a` on white: 1.16:1) | `focusRingHex` before/after | `focusRingHex()` in `lib/color.ts` floors the ring to 3:1; that case now 3.11:1 |
| Checkbox and radio are 16px, compact switch 36×20 (SC 2.5.8 needs 24px) | browser hit-test | `data-ui-target` extends the hit area to `--target-min` |
| Dialog and sheet close buttons were under 24px and had no visible focus | browser hit-test | padded to 28px, opted into the shared ring |
| Uncontrolled `Switch` always read "Off" | `props.checked ? 'On' : 'Off'` | label follows Radix `data-state` |
| Unsized `Dialog` could exceed the viewport with no scroll | — | `max-h` plus `overflow-y-auto` |
| `Input` drew a ring from an undefined `--brand` variable | failing contract check | restored to token syntax |

Measured after the fixes (`node scripts/check-ui-focus-targets.mjs`): focus
ring 5.17:1 in light and 12.41:1 in dark on every probed primitive; every
probe has a hit area of at least 24px.

### Still open

- Focus outline removed in page code: 162 occurrences in 90 `.tsx` files and
  146 in `.css` files (approx; `outline-none`, `outline: none`). Some are
  legitimate (a wrapper that delegates focus to a child); each needs a look.
  These are outside the shared primitives, so today's fix does not reach them.
- The 2,380 native buttons take the shared focus ring only where they carry
  `data-ui-native-button` and no page CSS overrides it. Not verified per page.
- No automated contrast check on text colours in page code.
- No keyboard-order or screen-reader pass has been done on any full page.

## Migration plan (Phase 4)

Staged by app, one app per step, each step verified in a browser at desktop
and phone width before the next starts. Within an app, in this order:

1. Save buttons to `<Button loading>` — mechanical, low risk.
2. Native `<select>` and date inputs to the shared pickers.
3. Tagged native buttons to `Button`, where the markup allows.
4. Raw colours and radii to tokens.
5. Page-level `outline: none` review.

### Progress

| App | Step 1 | Steps 2–5 |
| --- | --- | --- |
| Gereji (`pages/gereji/`, 14 files, 16 buttons) | done, browser-verified | not started |
| Every other app — busy labels already on a shared `Button` (81 buttons, 59 files) | done; one page browser-verified | not started |
| Every other app — busy labels on a native `<button>` (about 265) | blocked on step 3 | not started |

The 81 were the two single-line shapes that can be rewritten without
judgement: `disabled={saving}` and `disabled={saving || condition}`. In the
second, the condition stays as `disabled` and only the busy state moves to
`loading`. The rewrite script is not kept in the repo; the shapes are simple
enough to redo by search.

Most of the 81 are `type="submit"`. The browser guard now proves that a
loading submit button blocks both a click and Enter-in-a-field, and that an
idle one still submits exactly once.

### Step 2 — native date inputs and selects (done)

All 27 native date inputs now use `DatePicker`; callers keep their
`"YYYY-MM-DD"` string state through `parseDateOnly` / `toDateOnlyString`.
18 of 19 native selects now use `Select` (static lists, or a list that needs
an explicit "none") or `Combobox` (lists loaded from the API). The one left,
`components/BlockPreview.tsx`, renders a tenant's public website form and
stays native on purpose.

`DatePicker` gained what the native input had and the picker lacked:

- `required` blocks the form's submit while empty, with the browser's own
  message, and hands focus to the trigger.
- `min` disables earlier days.
- `aria-label`, for pickers with no visible label.
- `date={null}` means "controlled and empty", so a form that clears its
  state after saving also clears the picker.

Three defects in the shared picker were fixed at the source: opening the
calendar focused the "previous month" arrow instead of a day (including on a
quick reopen); day buttons hid the focus outline; and the selected day used a
hardcoded Tailwind teal instead of `--primary`.

Verified in a browser: keyboard open/arrow/Enter picks a day, the calendar
stays inside the viewport at 390px, Clear is a 26px target
(`/gereji/insurance`); an empty required picker blocks submit and a filled
one posts its value through `FormData`; `min` disables earlier days. The
Tuma parcel dialog renders its four converted pickers at both widths with no
native select left.

### Step 3 — native buttons (started)

64 native save buttons in 43 files that used the platform `.btn` classes are
now the shared `Button` with `loading`. The mapping is fixed: `btn-primary`
is the default variant, `btn-secondary` / `btn-outline` is `outline`,
`btn-danger` is `destructive`, `btn-sm` is `size="sm"`; any other class and
any inline style pass through unchanged.

Verified on `/cms/components` at 1440px and 390px: the converted "Create
component" button is the same height as the native "Cancel" and "New
component" beside it (36px, 38px on mobile); no horizontal scroll.

About 47 native save buttons remain. They carry page-specific classes
(`login-submit-btn`, `em-text-btn`, `spt-modal-submit`) or are styled inline
with no class at all, so each needs its styling moved to a variant or
dropped — a per-page decision.

Second verification: on `/seal/item-warehouses` (Create Warehouse,
`loading` plus `disabled={!code || !name}`) at 1440px and 390px — natively
disabled while the form is empty, enabled once filled, then Enter, Enter and
a click during a held request sent one POST. Intercepted; no row written.

Gereji verification: on `/gereji/anga/locations` at 1440px and 390px, three
activations of the Create button during a held request (Enter, Enter, click)
sent one POST; the button reported `aria-busy`, showed the spinner and kept
keyboard focus; no horizontal scroll, no page errors. The request was
intercepted, so no row was written.
