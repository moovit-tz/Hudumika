# ComplyOS design-system refresh

29 October 2026. Reviewed against `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, the shared UI source and the live `/admin/components` catalog. Repository baseline: `1d78f725`.

## Coverage

All **26 routed ComplyOS workspace screens** were checked at **1440px, 768px and 390px**: 78 route/viewport combinations.

| Area | Screens covered |
| --- | --- |
| Overview and records | Dashboard, applications, obligations, vault, calendar |
| Create and guided flows | New application, new obligation, obligation scan, new certificate, new reminder, legal engagement, licence application |
| Research and directories | BRELA search, search history, company directory, agencies, licence catalogue, legal marketplace |
| Automation | Renewal workflows, licence automation, TRA portal preview |
| Renewal Finance | Overview/register, cycle costs, add cost line, request budget, link Finance record |

The existing dashboard work was preserved. Its layout participates in the shared ComplyOS styling; the dashboard source was not rewritten. The public CMS marketing/sales page is outside this workspace route inventory.

## Changes

- Migrated legacy native action controls to shared `Button`, text fields to `Input`/`Textarea`, and record containers to `Card`. Native file inputs remain native for browser file selection.
- Replaced custom status/agency badges and alerts with shared `Badge` and `Banner`, using semantic variants. Domain status mapping is centralized in `lib/complyPresentation.ts`.
- Migrated record tables to the shared table primitives. Rows become labelled cards on narrow screens, retaining every field and action. Keyboard activation opens clickable table rows. Desktop frozen-column styling is disabled when a table becomes mobile cards.
- Consolidated overview metrics onto the existing `MetricsRow`/`MetricCard` component, including Renewal Finance. No trend values or chart series were invented.
- Replaced custom overlays in applications, certificate details, renewal workflows, catalogue details and legal engagements with shared `Sheet` primitives. Agency and legal profile sheets now fit phone viewports too. Shared sheets supply focus management and Escape closing.
- Updated the common full-page wizard: shared header actions, responsive numbered progress, grouped field labels, consistent navigation controls and shared busy feedback. All steps remain visible.
- Standardized page alignment, cards, control geometry, borders and elevation using the platform's shape/density tokens. Removed duplicate nested page chrome on finance pages through the standard page wrapper.
- Removed fixed colours from automation/TRA screen surfaces and logs, replacing them with live brand/semantic/surface tokens. The existing portal and upload handlers remain attached.
- Moved legal search onto `SearchToolbar` alongside its filters. Added missing calendar navigation labels and made the portal pop-out action a keyboard-accessible shared button.
- Added normal page headings to unavailable licence/firm states. Preserved the footer routing through `PageLayout`.

## Verification

- **Web TypeScript check passed:** `npx tsc --noEmit -p apps/web/tsconfig.json`.
- **Design-system contract check passed:** 19 checks.
- **Encoding check passed.**
- **78 browser route/viewport checks passed:** one page heading, shared footer, no document-width overflow, no browser JavaScript errors and no failed ComplyOS API responses in the final run. Populated disposable records were used for applications, obligations, permits and renewals.
- Six mobile detail sheets opened within the viewport and closed with Escape: applications, vault, legal profiles, agencies, renewal workflows and licence catalogue. Opening animations were allowed to settle before measuring the sheets.
- Wizard Back/Next preserved an entered certification value.
- Dark-theme finance cards rendered dark surfaces and light text; overriding the shared card radius to zero produced a computed `0px` radius. The live component catalog was checked.
- A final mobile follow-up checked the table-card polish. Disposable test tenants were removed after verification; no real authority submission, payment or external message was sent.

Evidence: `COMPLYOS_DESIGN_SYSTEM_BROWSER_2026-10-29.json`, `COMPLYOS_DESIGN_SYSTEM_MOBILE_FINISH_2026-10-29.json` and `comply-design-*.png` screenshots in this directory. Local command logs are in `.tmp/comply-design-delivery-*.log`.

## Scope and limits

This is a frontend design-system pass. Backend integrations, legal content, jurisdiction coverage, regulatory accuracy and production operations are not certified by these UI checks. The existing API handlers were not changed.

The pre-existing/concurrent changes to `index.css`, `LockScreen.tsx` and the dashboard source were left with their owners. Shared ComplyOS CSS was updated in place, preserving the existing dashboard additions. No dependency was installed and no deployment was performed.
