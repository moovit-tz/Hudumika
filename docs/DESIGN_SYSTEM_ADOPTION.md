# Design system adoption plan

**Status:** Working plan, started 14 November 2026
**Normative sources:** [`HUDUMIKA_PRODUCT_DESIGN_PRINCIPLES.md`](HUDUMIKA_PRODUCT_DESIGN_PRINCIPLES.md) (why), [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (contract)
**Gate:** `npm run check:design-system` (part of `npm run typecheck`)

This plan maps the product principles onto the code that enforces them, says
who owns each part, and sets the order in which existing screens move onto the
shared system. It does not replace either source document.

## 1. Principles → contracts

| Principle (§) | Enforced by | Automated check |
| --- | --- | --- |
| Clear before clever; icons (§2, §3 Icons) | `Button` (`ui/button.tsx`) warns in development when an icon-only button has no name; `Tip` (`ui/tooltip.tsx`) names the control it wraps | Gate: "Tip names…", "Icon-only Button warns…"; browser audit: unnamed controls |
| Accessible colour (§3 Colour) | `--primary`/`--primary-foreground` and `--destructive`/`--destructive-foreground` are derived through `enforceContrastFloor()` in `useDesignSystem.ts`; `--{gold,red,green,blue,purple}-foreground` pick the readable text colour | Gate: "Destructive buttons use the theme red floored to AA" |
| Shape and density (§3) | `--r-sm`/`--r`/`--r-lg`, `--ctl-h*`, `--ds-btn-py-*`, `control-contract.css` | Gate (19 original checks); `check:slop` report |
| Motion (§3 Motion) | Global `prefers-reduced-motion` rule in `index.css`; spinners exempt | Gate: "Reduced motion applies platform-wide" |
| Focus and targets (§2 Accessibility) | `--focus-ring-*`, `data-ui-focus`, `data-ui-target` | `scripts/check-ui-focus-targets.mjs` (browser) |
| Responsive (§3 Responsive) | `page-layout`, `responsive-table`, `PageHeader` wrapping | Browser audit at 320/375/768/1440 |
| Trust through truth; reliability states (§2) | `SectionLoading`/`PageLoading`/`Skeleton*`, `.ds-empty-state`, `MetricCard` loading/error/empty, `DataTable` empty vs filtered-empty | Gate: MetricCard and DataTable state checks |
| Localization (§2, §4) | i18next; `document.documentElement.dir` switches to `rtl` for Arabic | — (no automated check yet) |
| Privacy and least access (§2) | Server-side tenant isolation and entitlements; never hidden UI | API tests per feature (e.g. `zentra-policy-enforcement.test.ts`) |

## 2. Platform rules and domain extensions

**Platform-wide (cannot be overridden by an app):** page title, navigation shell,
controls (button, input, select, date, menu, dialog, tabs, switch), focus,
target size, motion, loading/empty/error states, tokens for colour, shape,
density and elevation, avatars, and the reduced-motion and contrast floors.

**Domain extensions (allowed):** domain semantics and layouts built from
shared primitives — e.g. POS's full-viewport till, Email/Drive/Calendar/Tasks
and Studio as full-screen surfaces without `PageHeader`, a calls app's dark
meeting stage, map and chart palettes. An extension may add rules; it may not
weaken tenant isolation, server-side authorization, accessibility, auditability
or truthful status (principles §5).

### Exception process

A local pattern that must remain is recorded in the register below with:
rationale, owner, user impact, and a review date. Without an entry it is
drift and is migrated when the file is next touched.

| Exception | Where | Rationale | Owner | Impact | Review |
| --- | --- | --- | --- | --- | --- |
| Hand-rolled toggle (`.s-tog*`) | `pages/Settings.tsx` | Predates the Radix `Switch`; kept in sync by hand (DESIGN_SYSTEM.md) | Workspace | Visual parity only | 2027-02-14 |
| CRM customer tab format | `CustomerDetailPage.tsx` (`data-ds-tabs-exempt`) | Established customer navigation | CRM | Different tab look on one page | 2027-02-14 |
| No `PageHeader` | Email, Drive, Calendar, Tasks, Studio builder, POS till | Full-screen tools; a title block lands inside the tool | Platform | None | 2027-05-14 |
| Dark meeting stage colours | `pages/calls/MeetingRoom.tsx` | Video stage is intentionally dark in both themes | Bliss | Raw colours (84 in slop report) | 2027-02-14 |
| Switch off-track `#6b7280` | `ui/switch.tsx` | Documented neutral; no token yet | Platform | None | 2027-02-14 |
| Numeric radii and hex colours in chart configs | Chart.js / Recharts dataset options | Drawn on canvas: CSS variables don't resolve there and the typed options need numbers. Recharts tooltip `contentStyle` is DOM and does use tokens | Platform | None | 2027-05-14 |
| Hairline radii (1–3px) | Thumbnails, progress bars, swatches | The smallest shape token (8px) would turn them into pills | Platform | None | 2027-05-14 |
| Raw colours in standalone documents | Print/certificate windows, email templates, Sign document content | CSS variables don't exist in a separate document or a mail client | Product owner of each | None | 2027-05-14 |
| `color:` values that are data | Org-chart node colours, CRM stage colours, category palettes | Saved to the database or used as distinct series; a token would break pickers or merge categories | Product owner of each | None | 2027-05-14 |

## 3. Ownership and review gates

| Area | Owner | Review gate |
| --- | --- | --- |
| `components/ui/*`, tokens in `index.css` / `useDesignSystem.ts` | Platform design system | Any change runs `npm run check:design-system` and `node scripts/check-ui-focus-targets.mjs`; visual check light/dark, 320px and desktop |
| App shells and navigation | Platform | Same as above plus sidebar/header in two apps |
| Product pages | The product team | Definition of done in principles §7; no new raw colour/radius/height (see `check:slop`) |
| Domain components | The product team, composed from `ui/*` | Promote to `ui/` when a second product needs it (principles §8) |

**Versioning and deprecation.** The design system ships with the app (no
separate package version). A breaking change to a primitive keeps the old
prop working for one release, logs a development warning, records the change
and its removal date in `DESIGN_SYSTEM.md`, and migrates call sites before the
old path is removed. Example in place: `Tabs`' legacy `variant` prop is
accepted and ignored.

## 4. Migration sequence

1. **Foundation (done 14 November 2026):**
   - Destructive contrast: theme red floored to AA in light mode; dark mode unchanged.
   - Platform-wide reduced motion.
   - Accessible names:
     - `Tip` names the control it wraps;
     - a bare icon inside `Tip` becomes a focusable named image, not a fake button;
     - clickable `Icon` is keyboard-operable and takes a `label`;
     - `Button size="icon"` warns in development.
   - `FeatureToggleRow` labels its switch.
   - Invisible target extender on shared chrome: breadcrumbs, sidebar and rail toggles, footer links.
   - Gate checks for all of the above, plus `check-icon-button-names.mjs`.
2. **Representative slice per product family (done):** fixed what the browser
   audit found on the main route of each family:
   - Bliss dropdown labels and the "New view/group" targets;
   - NexusHR dashboard links;
   - Ondi row menus;
   - FinOps KPI/flow links;
   - Zentra filter buttons and a hard-coded blue link;
   - catalogue and design-system controls.
3. **Repeatable batches:**
   - **Icon-only buttons without names: done.** 252 → 0 across about 120 files. 211 were labelled by icon meaning (an `x` judged from its click handler: Close / Remove / Clear search); 41 by hand. Labels are generic ("Delete", "Close"); make them specific ("Delete invoice") when a screen is next touched.
   - **Next:** raw colour → token in the highest-count files (`calls/MeetingRoom` is a registered exception), then raw radius → token, one product at a time, each batch reviewable on its own.
   - **Fields labelled only by a neighbouring `<label>`: done for the
     detectable pattern.** 158 `Select` triggers in 92 files and 510
     `Input`/`Textarea` fields in 132 files now carry `aria-label` copied
     from the visible label text. Gated by `scripts/check-field-labels.mjs`.
     Second pass: `Combobox` and `DateRangePicker` now accept `aria-label`;
     168 more pickers and date fields (105 `DatePicker`, 61 `Combobox`, 2
     `DateRangePicker`) labelled from their `<label>`; the gate covers them.
     Still not covered: labels rendered as styled `<span>`/`<div>` text and
     labels containing JSX — screen-by-screen.
   - **Generic icon labels made specific where the row names its item:** 48
     (e.g. `Delete ${todo.title}`, falling back to the verb when empty); 74
     stay generic because no item name is in scope.
   - **Raw radii:** the report counted every `borderRadius: '50%'` as a 5px
     radius (regex backtracking) — fixed; the real count was 238, not 494.
     116 replaced with `--r-sm`/`--r`/`--r-lg`; the rest are registered
     exceptions (hairlines, pills, print, chart configs).
   - **Raw colours:** only 13 could be replaced safely by rule (styling
     contexts, matching hue family, not near a fixed white surface). The other
     ~780 are data values (saved node/stage colours, category palettes), chart
     configs, standalone documents, or the calls stage — see the exception
     register; the remainder needs per-screen review.
   - **RTL:** `scripts/check-ui-zoom-rtl.mjs` (200% zoom at 640px; Arabic at
     375/1440) — 30/30 pass for overflow. A visual check found mixed-language
     ordering bugs it can't measure (a negative balance shown as
     "TSh 9,442,000 -"); fixed with `unicode-bidi: plaintext` on text-level
     elements in RTL and text grouping in `Badge`. Untranslated English
     subtitles align left inside RTL pages (cosmetic, accepted).
   - **Tenant themes:** `apps/web/src/lib/theme-contrast.test.ts` — 149 cases
     over hostile brand colours: filled actions ≥4.5:1, focus ring ≥3:1 on
     light and dark pages, helper text floored.
   - **Late-rendered small targets:** sampling during load found 5 links
     (Seal, Tracking, Petti, Zentra) rendered after data arrives; fixed.
4. **Inline styles:** only when a file is otherwise being changed (≈23,000
   instances; a bulk rewrite would move controls and is out of scope).

## 5. Metrics

Baseline, 14 November 2026 (source scans unless noted):

| Measure | Baseline | Source |
| --- | --- | --- |
| Gate checks | 19 → 23, all passing | `check:design-system` |
| Raw accent colours in pages | 792 across 103 files | `check:slop` |
| Raw px radii in pages | 494 across 168 files | `check:slop` |
| Inline styles | 23,180 | `audit:ui` |
| Native `title=` tooltips | 1,562 | `audit:ui` |
| Native `<select>` | 8 | `audit:ui` |
| Direct `fetch` in pages | 13 | `audit:ui` |
| Icon-only buttons with no accessible name (source) | 252 → **0**, now gated | `check-icon-button-names.mjs` |
| Fields named only by an unassociated `<label>` (source) | 668 → **0**, now gated | `check-field-labels.mjs` |
| Unnamed controls, 13 routes × 4 widths | 41 → **0** (final pass at 320 and 1440) | browser route audit (Chromium accessibility tree) |
| Pointer targets under 24px, same routes | 364 → **11**; the 11 come from content that appears only while loading and did not reproduce once the pages settled | browser route audit |
| Routes with page-wide horizontal scroll at 320–1440px | **0** before and after | browser route audit |
| Shared focus/target matrix | 33/33 pass, light and dark | `scripts/check-ui-focus-targets.mjs` |

Audited routes: sign-in, CRM, ClearOS, Tracking, Tuma, Seal, FinOps, Petti,
NexusHR, Bliss, Ondi, Zentra, and the component catalogue, signed in as the
platform SuperAdmin so every family renders. Not covered by any automated
check yet: 200% zoom, screen-reader task completion, tenant-theme variations
beyond the default, and RTL (Arabic) layout.

Track these per release; a number that rises needs a reason in the review.

## 6. Conflicts found between the documents and the code

| Conflict | Resolution |
| --- | --- |
| `DESIGN_SYSTEM.md` says the semantic colours have no contrast floor and `.btn-danger` uses `#fff` | Out of date: `--{gold,red,green,blue,purple}-foreground` exist and `.btn-danger` uses `--red-foreground`. Passage corrected. |
| The shared `Button`'s `destructive` variant used a fixed `#ef4444` with near-white text (3.59:1, below AA) and ignored the theme red | Fixed: derived from the theme red, floored to AA (`#d61c44`, 4.88:1). Dark mode (9.56:1) unchanged. |
| Principles require respecting reduced motion everywhere; only spinners and dialogs did | Fixed: global rule; spinners keep turning slowly. |
| Principles require names for icon-only actions; `Tip` named only native buttons | Fixed: `Tip` names links and component controls too; `Button` warns in development. |
| `DESIGN_SYSTEM.md` says almost nothing calls `Button`/`Input` | Out of date: 3,824 imports from `components/ui`. Passage corrected. |
