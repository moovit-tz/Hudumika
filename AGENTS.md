# AGENTS.md — Directive for any AI coding agent working on Hudumika

This file governs **every** AI coding agent that touches this repository — Claude, Antigravity, Kimi, Codex, Cursor, Windsurf, or any other. It is not tool-specific instructions; it is the platform's own engineering conventions, written down so a change made by one agent doesn't fight a change made by another, or by a human.

**Precedence:** [`CLAUDE.md`](CLAUDE.md) (repo root) is the authoritative source for the design-system component mapping and the multi-tenant `tenant_id` rule — read it before touching any UI or any query. This file covers everything CLAUDE.md doesn't: the rest of the stack, process, and the specific traps that have already bitten someone in this codebase. Where the two files overlap, CLAUDE.md wins for UI/tenancy specifics; this file wins for everything else. If you find them contradicting each other, stop and flag it rather than picking one silently — see "Tailwind version" below for a live example of exactly that happening.

## The prime directive: match what's already here, don't add a second way to do it

Before writing any new code, **grep for the pattern you're about to introduce.** This codebase already has one way to fetch data, one way to build a form, one way to gate a route by role, one way to run a migration. If you're about to `npm install` an HTTP client, a component library, a state manager, a CSS framework, or a routing library — stop. It's almost certainly already here under a different name than you expected, or the existing tool already does the job. Search first; the fastest way to create "complications" for the next agent (human or AI) is a codebase with two competing ways to do the same thing.

Concretely, before adding a dependency: check `apps/web/package.json` / `apps/api/package.json`, then `grep -r` for the pattern in `apps/web/src` or `apps/api/src`. This repo already has dead, unused scaffolding from exactly this failure mode (see "Known dead ends" below) — don't add to it.

## Monorepo layout

npm workspaces, not Turborepo/Nx/Lerna. Root `package.json` scripts are the entry point:

```
npm run dev          # concurrently runs apps/api + apps/web
npm run typecheck    # tsc --noEmit on both apps — run this before calling anything done
npm run build         # types → ui → api → web, in that order (dependency order matters)
npm run db:migrate   # apps/api's migration runner
npm run lint          # eslint . --ext .ts,.tsx
```

- `apps/api` — Fastify + Kysely + Postgres backend.
- `apps/web` — React 19 SPA (Vite).
- `packages/types` (`@hudumika/types`) — the **real** shared source of truth for TS interfaces between frontend and backend. Any new DB-backed entity gets its interface here, imported by both apps. This one is actively used everywhere — trust it.
- `packages/ui` (`@hudumika/ui`) and `packages/api-client` (`@hudumika/api-client`) — **do not use these.** See "Known dead ends."

## Backend conventions (`apps/api`)

- **Multi-tenancy is not automatic.** RLS exists on tables but does not protect data by itself — every query needs an explicit `.where('tenant_id', '=', ...)`. This is CLAUDE.md's rule; it is repeated here because it is the single most consequential thing to get wrong. When a new endpoint accepts a foreign id from another domain (a `customer_id`, an `application_id`, etc.), validate that the referenced row belongs to the same tenant before using it — cross-tenant id smuggling through a valid-looking id is the realistic attack shape here, not just a missing `WHERE`.
- **Auth:** `request.user` is populated by the `authenticate` preHandler (`apps/api/src/middleware/auth.ts`) from a verified JWT. The payload type is `JWTPayload` in `@hudumika/types` — it has `sub` (the user id), `tenant_id`, `role`, `email`, `name`. **There is no `.id` field on the real payload** — `request.user.sub` is the user id. A couple of existing call sites reference `request.user.id`; those are latent bugs, not a convention — don't copy them. If you write a script or test harness that signs its own JWT for testing, sign exactly the `JWTPayload` shape (`auth.routes.ts`'s login handler is the canonical example) or you'll get confusing downstream `NOT NULL` failures on `created_by`-type columns that silently expect `sub`.
- **Migrations:** `apps/api/src/db/migrations/`, sequential zero-padded numeric prefix + snake_case description (`097_comply_customer_link.sql`). Never edit a migration that's already been applied in this environment — add a new one. Every new/altered table needs a matching interface registered in the `Database` type in `apps/api/src/db/client.ts` (`Generated<T>` wrapper for DB-defaulted columns) — Kysely's typing is only as good as that file.
- **Routes:** registered in `apps/api/src/index.ts` via `server.register(xRoutes, { prefix: '/v1/<domain>' })`. Match this — new domains get their own prefix, not routes bolted onto an unrelated one.
- **Error shape:** handlers reply with `{ error: string, message?: string }` and a real HTTP status code; the frontend's `apiFetch` reads `err.message || err.error` on any non-OK response and throws. Match that shape so errors surface correctly in the UI instead of showing a generic failure.
- **Entitlements/plan gating:** routes that should be gated by a tenant's subscribed package use `requireEntitlement('<app-id>')` (see `comply-ocr.routes.ts` for the pattern) — check for this decorator before assuming a new route should be open to every tenant.
- **No fabricated integrations.** If a PRD or spec references a government API, a third-party service, or another internal app that doesn't actually exist in this codebase, say so and stop rather than inventing a plausible-looking client for it. (Precedent: a "TrustID" integration was specced in a product doc but confirmed not to exist anywhere in the codebase — it was correctly flagged as out of scope instead of faked. Do the same.)

## Frontend conventions (`apps/web`)

- **Stack, precisely:** React 19, React Router v6, Vite. **Tailwind is v4** (`@import "tailwindcss"` + `@theme{}` in `index.css`, `@tailwindcss/postcss`, no `tailwind.config.js`) — CLAUDE.md's design-system section currently states "Tailwind v3 (not Tailwind v4)," which is stale/incorrect against the installed package; treat the actual `package.json` + `index.css` as ground truth on this one point until that line is corrected, and don't let a v3 assumption (e.g. reaching for a `tailwind.config.js`) shape anything you write.
- **UI components:** `apps/web/src/components/ui/` is the real, live design system (shadcn/Radix, teal-branded) — this is what CLAUDE.md's mapping table refers to. Check `/admin/components` (the live catalog) before hand-rolling anything. `@hudumika/ui` (the workspace package) is a near-dead separate component set — do not import from it for new work.
- **API calls:** every page/hook calls the plain `apiFetch(path, options)` helper from `apps/web/src/lib/api.ts` — it attaches the `Authorization: Bearer <token>` header from `localStorage['hudumika_token']`, sets JSON content-type unless the body is `FormData`, and throws `Error(err.message ?? err.error ?? generic)` on non-OK responses. Use it, don't call `fetch`/`axios` directly and don't wire up `@hudumika/api-client` (the OpenAPI-generated client) — it exists in the workspace but nothing actually imports it; it's not the convention despite looking like the "proper" typed option.
- **Adding a new page — the full checklist**, in the order things actually get wired (skipping a step here is the most common source of "why is this blank/footerless/unreachable"):
  1. Build the page under `apps/web/src/pages/`, composed from `components/ui/` per CLAUDE.md's mapping table.
  2. Register its route inside the relevant app's shell (`apps/web/src/shells/*Shell.tsx`), **wrapped in `<Route element={<PageLayout />}>`** unless the page is a genuinely full-bleed tool (a live map, a calendar grid, an inbox-style master/detail view) that needs the entire viewport — those are the one documented exception, and even then check whether the page's CSS already has a prepared `[data-app] .app-shell-content .page-layout { min-height:100%; ... }` override before assuming exclusion is right. `PageLayout` is the one shared footer ("Copyrights © … / <AppName> powered by Hudumika / Terms · Privacy · Support") — every non-exempt route needs it, not just the ones you're immediately focused on. Grep the target shell for `<Route element={<PageLayout />}>` and add your route inside that group, not next to it.
  3. Add a sidebar entry in that shell's `NAV` array if the page should be user-navigable.
  4. If the page needs its own app-level branding (a logo, a color), read it from `useBranding()` (`getAppLogo`/`getAppName`/`getAppColor`/`getAppSlogan`, keyed by the app's id) rather than hardcoding an asset — this is how a SuperAdmin's branding settings (`/admin/branding`) actually reach the page, including public/unauthenticated ones (`GET /v1/platform/branding` is unauthenticated by design).
  5. Multi-step forms are **dedicated pages/routes**, triggered by `navigate()`, never a `position:fixed` modal overlay — even a form with a step indicator is still a popup if it's wrapped in overlay chrome. Reserve actual modal dialogs for single-field confirmations. (`ComplyWizardPage.tsx` is the reference full-page wizard shell; `apps/web/src/pages/onboarding/OnboardingWizard.tsx` and `trade-wizard/TradeWizard.tsx` are the original precedent.)
- **i18n:** `useLocale()` / `apps/web/src/locales/<lang>/common.ts` — new user-facing strings in a page that already uses `t(...)` should follow suit rather than hardcoding English inline, but don't retrofit unrelated pages on sight.

## Verification — what "done" actually means here

- There is **no automated test suite** in this repo (`vitest`/`playwright` are installed but no `*.test.ts(x)` files exist anywhere). Don't claim "tests pass" — there aren't any to run. Don't silently add a test framework of your own choosing either (see "match what's already here").
- The real verification loop, used throughout this repo's history: `npm run typecheck` (or `npx tsc --noEmit` inside the specific app) after every change that touches `.ts`/`.tsx`, plus an actual browser check for anything UI-visible — this repo's sessions consistently catch real bugs (blank pages, crashed components, invisible footers) that `tsc` alone does not, because `tsc` only proves the types line up, not that the page renders. If Playwright is available, prefer it over asking the user to eyeball something you could have checked yourself.
- If you change a shared dependency version (see the `react-leaflet` gotcha below), the dev server's Vite dep cache can serve stale pre-bundled code — a full dev-server restart (not just an HMR reload) is sometimes required to actually observe your fix.

## Documentation & referencing

- Comments explain **why**, not what — a hidden constraint, a version incompatibility, a workaround for a specific bug. If the code is self-explanatory, no comment. This repo already has a lot of exactly this style of comment (see `Tracking.css`'s full-bleed-map explanation, or `middleware/auth.ts`'s `apiKeyScopes` doc) — match it, don't add narrative/what-comments.
- Don't invent URLs, API endpoints, or package names. If you're not certain an endpoint/package/integration exists, grep for it or say you couldn't confirm it — do not guess plausibly and move on.
- When you discover a real discrepancy between this file, CLAUDE.md, or the actual code (like the Tailwind version note above), **say so explicitly** in your output rather than quietly conforming to whichever one you personally trust more. These files drift from the code over time; flagging drift is more useful than silently resolving it.

## Known dead ends (don't build on these, and don't be surprised they exist)

- `@hudumika/ui` (`packages/ui`) — a second component library, almost unused (2 import sites total). The real one is `apps/web/src/components/ui/`.
- `@hudumika/api-client` (`packages/api-client`) — an OpenAPI-generated typed fetch client. Zero import sites. The real convention is `apiFetch` in `apps/web/src/lib/api.ts`.
- `apps/web/src/components/TopBar.tsx` — dead code, not imported anywhere; the live top bar is `AppHeader.tsx`.

## Version-sensitive traps already hit once

- `react-leaflet` must stay on a version whose peer dependency covers the installed React major (currently React 19 → `react-leaflet@5.x`). `react-leaflet@4.x` peer-depends on React 18 only; running it against React 19 under `<React.StrictMode>` throws `"Map container is already initialized"` on mount and blanks the entire page with no error boundary to catch it — this already happened once across every map-bearing Tracking page. If you touch any map component and see a blank page, check this first before assuming your own code is wrong.
- `apps/web/src/lib/api.ts` hardcodes `BASE_URL = 'http://localhost:3001'` — there is no env-driven API base URL yet. Don't assume one exists; don't invent a second, parallel way of pointing at the API in new code.
- `shipment_listeners.user_id` in Postgres is a `UUID` column. When tagging listeners via `POST /v1/shipments/:id/listeners`, any `id` string passed must either be a valid UUID (e.g. `22e01c0a-688a-42ac-a6f6-785c48e60bf6`) or be sanitized to `null` on insertion. Adding arbitrary string prefixes/suffixes (like `cust-...-main`) to listener IDs breaks Postgres with `invalid input syntax for type uuid`. The route handler in `shipments.routes.ts` enforces a regex UUID check (`isUuid(p.id) ? p.id : null`) to ensure `user_id` is never populated with a non-UUID string.
- `LandedCostPage.tsx` Landed Cost Breakdown UI must remain formatted per the 4-card structure (`CIF VALUE`, `DUTIES & TAXES`, `PORT, ICD & CLEARANCE`, and `GRAND TOTAL — LANDED COST` banner card with 2x2 grid stats) matching Image 1 design guidance. Avoid replacing it with a single flat table.
- `LandedCostPage.tsx` PDF Export (`printReport` and `printMultiReport`) uses the signature ClearOS report sheet (`ClearOS` brand mark header, `Space Grotesk` fonts, multi-tenant company block, numbered section headers, dark `#161A1E` summary hero card, notes & assumptions grid, legal box, signature block, and single-page dynamic fit script `fitPageToContent`). Always preserve this format when editing PDF export templates.
- `Workflow Studio` (`/studio` / `WorkflowStudioPage.tsx` & `workflow-studio.routes.ts`) is the Google Workspace Studio style visual workflow builder app. Interlinked across platform entities (`shipment.created`, `landed_cost.computed`, `penalty.high_risk`, `invoice.created`, `compliance.checked`, `crm.lead_created`). Tables `workflow_studio_apps` and `workflow_studio_runs` store app node graphs and execution logs.
