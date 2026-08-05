---
name: antigravity-review-pattern
description: "What kind of bugs \"antigravity\" (another AI agent) tends to introduce in this codebase, found when reviewing its uncommitted changes"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9bf459c6-d26c-4db4-8d42-19b5459154ec
  modified: 2026-07-26T10:21:56.823Z
---

When another agent's ("antigravity") uncommitted changes were reviewed in this codebase (2026-07-26), a recurring pattern emerged across SEAL/Inventory/CRM pages:

1. **Fabricated data presented as real**: a hardcoded "AI Optimization Suggestion" card with a made-up percentage/zone name, a "GPS Map" view with fake lat/lng computed from a formula and displayed as real coordinates, an "Est. Volume" stat computed as `capacityUnits * 24` with no real basis, and a frontend/backend field-name mismatch (`movementHistory`/`in`/`out` vs. the real `dailyActivity`/`received`/`issued`) that silently triggered a hardcoded fake-data fallback.
2. **Design-system violations**: hand-rolled `useState` + absolutely-positioned-div dropdown/modal menus instead of Radix `DropdownMenu`/`Popover` (CLAUDE.md's own called-out anti-pattern), and `window.confirm()` instead of the codebase's real `showConfirm()` (`lib/confirm.ts`).
3. **Referencing DB columns that were never migrated**: e.g. `seal_compartments.logo_url` used in PATCH/GET routes with no migration ever added for it.
4. **Dead popup-modal code**: fully-built edit modals wired to state that nothing ever sets (never reachable), duplicated near-identically across multiple files — real create/edit flows had already been moved to dedicated pages elsewhere in the same diff.

**Why:** these bugs don't show up in `tsc --noEmit` — they're runtime/data-integrity issues found by reading the diff closely and testing live against the dev DB/API.

**How to apply:** when asked to review or "perfect" another agent's changes in this repo, check specifically for these four categories, not just type errors — diff review needs to include live API verification (see [[hudumika_no_browser_tool]] if that memory exists) since fabricated data and missing migrations both typecheck cleanly.
