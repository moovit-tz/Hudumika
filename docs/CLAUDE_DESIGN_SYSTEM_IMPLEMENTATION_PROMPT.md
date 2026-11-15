# Claude Code prompt: implement Hudumika's shared design standard

Paste this prompt into Claude Code from the Hudumika repository root.

```text
Work in the Hudumika repository. Implement and progressively adopt the product design standard in:

- docs/HUDUMIKA_PRODUCT_DESIGN_PRINCIPLES.md
- docs/HUDUMIKA_PRODUCT_DESIGN_PRINCIPLES.html
- docs/DESIGN_SYSTEM.md

The Markdown principles are the normative guide; the HTML is its human-readable companion. First read AGENTS.md and CLAUDE.md. CLAUDE.md is authoritative for design-system components and multi-tenant rules. Follow existing code patterns, use apps/web/src/components/ui and the configured design tokens, use apiFetch for client calls, and preserve tenant scoping and app behavior. Do not add a competing UI library or framework.

GOAL
Make the existing Hudumika design system the dependable shared foundation for every current and future Hudumika app. Adapt the principles to Hudumika’s multi-tenant ERP, specialist products, East African operating contexts, and products such as CRM, ClearOS, Freight, Tuma, Seal, NexusHR, Petti, Bliss, Ondi, and Zentra. Do not copy Uber branding, proprietary components, copy, illustrations, or visual identity. Treat references as inspiration, not specifications.

WORK IN PHASES AND REPORT PROGRESS
At the start, record the current git status and identify pre-existing changes. Never revert or stage unrelated work. Keep changes scoped and reviewable. Report progress after each phase with: status, files changed, verification performed, issues found, and what remains.

Phase 1 — Audit
- Inventory design tokens, shared components, app shells, responsive patterns, typography, semantic colors, shape/density, focus/target behavior, localization, and current design-system checks.
- Inspect /admin/components and /admin/design-system implementation and use the actual live component catalog.
- Audit representative apps and surfaces: marketing/auth, CRM, ClearOS, Freight/Tuma/Seal, finance/Petti, NexusHR, Bliss, Ondi, Zentra, and mobile.
- Identify duplicate components, hardcoded visual values, accessibility gaps, inconsistent states, and route-level design drift. Give each issue evidence, scope, severity, and proposed shared fix.
- Do not mass-edit every page before defining a safe migration plan.

Phase 2 — Foundation plan
- Map the principles to actual token/component/API contracts.
- Distinguish platform-wide rules from domain extensions and explain the allowed exception process.
- Define component ownership, contribution/review gates, versioning/deprecation, migration sequence, and useful quality metrics.
- Identify conflicts between the docs and implementation; flag them explicitly and resolve with a small scoped change.

Phase 3 — Implement the system
- Fix the highest-impact shared foundation gaps first: accessible semantic color pairs; type/spacing/shape/density tokens; button/input/menu/dialog/table patterns; feedback and status states; responsive behavior; keyboard/focus; reduced motion; localization and RTL where supported.
- Preserve app-level branding via configured tokens and existing useBranding/useDesignSystem conventions. Tenant accent colors must not override contrast-safe semantic actions.
- Create or improve reusable components only where the audit proves a shared need. Build them from existing Radix/shadcn primitives and existing packages. Do not fork existing primitives.
- Ensure icon-only actions have accessible names and hints. Ensure critical actions retain text labels where meaning is not obvious.
- Ensure mobile does not require page-wide horizontal scrolling to reach primary actions. Use compact tables, card rows, or local scroll only where appropriate.
- Implement truthful loading, empty, partial, stale, offline, permission-denied, validation, success, failure, and retry states. Do not fabricate integrations or success.
- Keep high-consequence interfaces clear about data source, age, exact amounts, time zone, ownership, permissions, and irreversible effects.

Phase 4 — Product adoption
- Apply the shared improvements to a representative slice of each app family first, then migrate repeatable patterns in manageable batches.
- Domain extensions may add domain semantics; they may not weaken tenant isolation, privacy, server-side authorization, accessibility, auditability, or truthful status.
- Avoid broad aesthetic rewrites that move users’ controls or alter workflows without evidence. Preserve product-specific functionality and routes.
- Add exception records with rationale, owner, impact, and review date when a local pattern must remain.

Phase 5 — Verification
- Run npm run typecheck and npm run check:design-system. Run the existing relevant tests; do not introduce a second test framework.
- Run existing UI control, focus/target, and design-system audits. Verify at 320px, 375px, tablet, desktop, light/dark, tenant theme variations, keyboard-only, reduced motion, screen reader labels, and 200% zoom where tooling permits.
- Browser-check representative routes from each product family. Report exact routes, viewports, outcomes, screenshots/artifacts if available, and blockers. Do not claim an unperformed check passed.
- Check cross-tenant data and role restrictions for any backend/API change. Never treat hidden UI as authorization.
- Finish with git diff --check and summarize touched files, passed/failed/skipped checks, known risks, rollout/migration steps, and the next adoption batch.

IMPORTANT
- Continue through implementation; do not stop after an audit or plan.
- Do not claim “100% production ready.” State evidence-based readiness and unresolved limitations.
- Do not overwrite other active work or run broad destructive commands.
- Do not deploy, publish, or modify external services. Leave that as an explicit release step.
```
