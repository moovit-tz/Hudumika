# Walkthrough — uniform page gutter and the sidebar guide line

Corrected against the running app on 2026-08-06. Every figure below was
measured live with Playwright at 1680×1000, on both sidebar states, not read
off the stylesheet — inline styles beat classes in this codebase and several
earlier claims were true in the source and invisible on screen.

---

## What the earlier draft got wrong

The draft described work that had either moved on or never reached the screen.
Five specific claims did not hold:

| Claim | Actual |
|---|---|
| "Unified 16px padding … wired `--page-pad-x` (16px)" | `:root` reads **8px**, and the live value comes from `DENSITY_PRESETS`, not `:root` — 6 / 8 / 16 for compact / default / comfortable. This tenant is on comfortable, so it renders 16px; a tenant on default renders 8px. The gutter is a density setting, not a constant. |
| "Tightened page header spacing — `padding: 16px 0 18px; margin: 0 0 20px`" | Those are the values that were *replaced*. The file reads `padding: 8px 0 10px; margin: 0 0 12px`. |
| "`.page-layout` full-width mode takes `max-width: 100%; width: 100%; margin: 0`" | True only under `[data-layout="full"]`. The base rule still caps at `1400px`. The `html[data-expanded="true"]` block that also lifts the cap is **dead** — nothing in the app has ever set `data-expanded`. |
| "Resolved grey margins when the sidebar was collapsed … max-width caps (1400px / 1760px)" | There is no `1760px` anywhere in the app. Collapsed and expanded measured identically both before and after, so there was nothing to resolve. |
| "FinOps groups (Receivables, Payables, Accounts, Reports, Integrations) feature the vertical line" | `FinOpsSidebar.tsx` — the component that was edited — is **imported by nothing**. `FinOpsShell` renders `AppSidebar`. `LeftNav.tsx` is likewise unused. Of the three guide-line rules added, only `.app-sb-children-group` is reachable. |

One claim held exactly as written: `npm run typecheck` passes with 0 errors.

---

## 1. One gutter, on both axes

**The brief was "the same padding from left and top."** Left was already
uniform at 37px. Top was not: pages started 17px, 41px, 53px, 61px, 65px, 73px
or 113px below the card depending only on which app they belonged to.

The gutter is paid in two places, and only one of them was paying it on both
axes:

```
.app-shell-content   --page-pad-y / --page-pad-x   equal on both axes
.page-layout         padding: 0 20px 0             sides only  ← the gap
```

`.page-layout` now reads `padding: 20px 20px 0`, at every breakpoint
(20 / 20 / 16 / 12). Bottom stays 0 — that is trailing space, and nothing has
to line up with it. `.shipdetail-cover-bleed` gained a matching negative
`margin-top` so the cover photo still starts flush against the card edge.

On top of that, three families of page wrapper were each adding a third
helping:

- **Class wrappers** — `.lch-page` 24px, `.seal-page` 36px, `.comply-page`
  36px, `.trk-dashboard` 24px, `.inv-page` up to 36px, `.sa-shell-content`
  24px. The existing rule in `index.css` zeroed their sides but deliberately
  left the top alone as "the page's own rhythm". That reasoning predates the
  brief; `padding-top: 0` is now in the same rule.
- **`.trk-page` was in that rule and matches nothing.** HuduFreight's wrapper
  is `.trk-dashboard`. No element in the app has ever carried class
  `.trk-page` — only `.trk-page-btn` — so every tracking page kept both
  gutters. Corrected.
- **Inline roots** — 40 pages returned `<div style={{ padding: 24 }}>` or
  similar. Inline beats the class rule, so those pages sat at 61px on all four
  sides. All now read `padding: '0 0 24px'`: shell owns the gutter, the page
  keeps its trailing space. This covered 32 tracking/SEAL pages plus
  `CarriersPage`, `Customers`, `Demurrage`, `FinanceLedger`,
  `FinanceTrialBalance`, `Quotations` (×3), `CrmChainPartners`,
  `ComponentShowcase` and `HRM` (×3).

Two app-specific overrides also went:

- `.sa-shell-content .page-header { margin-top: 20px !important }` — an
  admin-only nudge on the *platform* header, which is what put
  `/admin/cms-pages` and `/admin/domains` 20px lower than everything else
  while their left gutters matched. Admin's own legacy title classes keep the
  rule until they are migrated onto `PageHeader`.
- `.page-header`'s mobile steps read `26px 0 22px` / `22px 0 18px` against a
  desktop base of 8px — three times the space on the screen with the least of
  it. Now 6px / 4px, so the header gets tighter on a narrow screen rather than
  looser.

### Measured

29 routes across 9 apps × 2 sidebar states = **58 measurements**, taking the
first element the page itself draws (not the layout card):

```
route                            L    T          route                     L    T
/clearos                         37   37         /tracking/vehicles        37   37
/clearos/declarations            37   37         /tracking/drivers         37   37
/clearos/customs-tools/history   37   37   ←SI   /tracking/shipments       37   37
/clearos/penalty                 37   37         /tracking/fuel            37   37
/finance/invoices                37   37         /tracking/devices         37   37
/finance/vendors                 37   37         /tracking/maintenance     37   37
/finance/reports                 37   37         /crm/leads                37   37
/finance/accounts/ledger         37   37         /crm/customers            37   37
/finance/products                37   37         /crm/chain-partners       37   37
/finance/quotations              37   37         /nexushr/employees        37   37
/seal/equipment                  37   37         /inventory/items          37   37
/seal/guarantees                 37   37         /complyos/applications    37   37
/seal/activities                 37   37         /studio/workflows         37   37
/seal/ex-warehouse               37   37         /admin/cms-pages          16   16  *
                                                 /admin/domains            16   16  *
```

27 of 29 at exactly 37 / 37, identical expanded and collapsed. 37px = 16
(shell, at this tenant's density) + 1 (card border) + 20 (card).

Before: left 37 everywhere but top 17 / 41 / 53 / 61 / 65 / 73 / 113 depending
on the app, and `/tracking/fuel`, `/tracking/devices`, `/tracking/maintenance`
and `/nexushr/employees` at 61–69px on *all four* sides.

\* Admin's `.sa-shell-banner` sits outside `.page-layout`, so it starts at the
shell's own 16px. The page card below it still starts at 37. Consistent
between the two admin pages; a structural choice in `SuperAdminShell`, not a
padding break. `/nexushr/employees` likewise draws a back link above its
title — content at 37, header below it.

The right edge is not tabulated because it is content-dependent: a page whose
widest bordered block is a card inside a gapped grid measures 57–61px, and
that is the grid, not the gutter.

**A narrow `.page-header` is not a defect.** About 20 pages wrap the header in
a hand-rolled `display:flex; justify-content:space-between` row, so the header
element shrinks to its own text — `/tracking/shipments` measures 212px wide.
Measuring the *element* makes this look like a 1191px right-gutter break. It
is not: `space-between` already puts the action control at the page's right
edge, and the row and the body below it both end at 37px. Verified before
changing anything.

`/tracking/vehicles` was the one real case — its actions row went through
`PageHeader`'s own `actions` slot, and `.trk-header` was deleted.

## 2. The sidebar guide line

Three rules drew this line, with three different colours and two redundant
dark-mode overrides:

```css
.app-sb-children-group  border-left: 1.5px solid rgba(0,0,0,0.12)   + dark override
.fnav-group-items       border-left: 1.5px solid var(--border, rgba(0,0,0,0.12))  + dark override
.lnav-sub-group         border-left: 1.5px solid var(--border)      (no override)
```

Neither `--border` nor `--border2` is right in both themes — `--border` is too
faint on a dark sidebar, `--border2` too heavy on a light one — which is why
each rule had improvised. There is now one token, `--nav-guide`, defined at the
three places the palette is already defined: `:root`, `[data-theme="dark"]`,
and `[data-semi-dark="true"] .app-sidebar`. All three rules reference it and
both per-rule overrides are gone.

Semi-dark is the case that motivated putting it on `.app-sidebar` rather than
only on `<html>`: the sidebar stays dark while the page is light, so the line
must take the dark value without the page taking it too.

Measured on `/clearos/customs-tools/history`:

```
[light]      border = 1.5px solid rgba(0, 0, 0, 0.12)      root=light  sidebar=light
[dark]       border = 1.5px solid rgba(255, 255, 255, 0.14) root=dark   sidebar=dark
[semi-dark]  border = 1.5px solid rgba(255, 255, 255, 0.14) root=light  sidebar=dark
```

**Scope, accurately.** The line renders where a nav *item* has `children`.
Only `ClearOSShell` defines any — Landed Cost and Compliance — so it appears
in exactly two places in the whole platform. Every other shell, FinOps
included, groups its nav with titled `SidebarSection`s, which have no such
container and no line. Extending it to section groups would change the look of
every app's sidebar and would mean restyling `.app-sb-item` inside it; that is
a design decision, not a bug fix, and has not been done.

## Still open

- `FinOpsSidebar.tsx` and `LeftNav.tsx` are imported by nothing. `.fnav-*` and
  `.lnav-sub-group` in `index.css` are styling them. Deleting all of it is
  probably right but is a separate call.
- The `html[data-expanded="true"]` block in `index.css` (and its two siblings
  in `AppSidebar.css` / `ComplyOSSidebar.css`) is dead — no code sets that
  attribute. It contradicts the live `[data-layout="full"]` rules and will
  mislead the next reader.
- `HRM.tsx` and `SuperAdmin.tsx` still carry private `PageHeader` copies.
  `HRM`'s delegates to the shared one; `SuperAdmin`'s does not.
- `.page-layout`'s base `max-width: 1400px` only lifts under
  `[data-layout="full"]`. Full-width is the default, so this is inert today,
  but a tenant switching to boxed re-centres the card and both side gutters
  grow together.

## Verification

- `npm run typecheck` — `tsc --noEmit` on `apps/api` and `apps/web`, plus the
  Studio trigger check: 0 errors, 17/17 triggers matched.
- Live measurement, 29 routes × 2 sidebar states, via Playwright with a signed
  JWT against the dev server on :5173.
- Guide line read from computed style in light, dark and semi-dark, plus a
  screenshot of the rendered ClearOS sidebar.
