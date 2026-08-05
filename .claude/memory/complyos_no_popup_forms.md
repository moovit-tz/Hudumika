---
name: complyos-no-popup-forms
description: "ComplyOS forms (and by extension, new multi-step forms elsewhere) must not be rendered as modal/popup overlays, even when they're multi-step wizards — use a dedicated page/route instead"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 834ea664-2d89-42c7-af7d-6bfaaf7570ea
---

Forms like "New Application" must not be popups — even when they're already converted to multi-step wizards. A multi-step wizard wrapped in a `position:fixed; inset:0` overlay dialog is still a popup; the fix isn't just "add steps," it's "stop using the overlay presentation."

**Why:** The user corrected this after I built `ComplyWizardModal.tsx` — a step-indicator + Back/Next/Cancel shell — but kept rendering it inside a centered `position:fixed` dark-backdrop overlay (same as the single-screen popups it replaced). The step indicator alone didn't satisfy the request; the modal chrome itself was the problem.

**How to apply:** Multi-step forms should be dedicated pages/routes, not overlays — matching the codebase's own existing precedent for this exact pattern: `apps/web/src/pages/onboarding/OnboardingWizard.tsx` (mounted at `/signup`) and `apps/web/src/pages/trade-wizard/TradeWizard.tsx` are both full-page wizards, not modals. When building or fixing a multi-step form anywhere in Hudumika (not just ComplyOS — this is a general lesson about this codebase's convention), give it its own route under the app's shell, trigger it via `navigate()` from a button instead of `setShowX(true)`, and use a back button / `navigate(-1)` instead of an overlay's close button. Reserve actual modal dialogs for single-field confirmations or genuinely short one-step actions, not anything with a step indicator.
