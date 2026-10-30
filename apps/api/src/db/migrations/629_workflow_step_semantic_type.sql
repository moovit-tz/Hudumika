-- Migration 629: Semantic step type for workflow steps (W04).
--
-- Custom workflow steps previously relied on English-language name regex to
-- determine their cross-app role (invoicing, payment, closed). A renamed or
-- localized step would silently stop triggering its intended hand-off.
--
-- step_type is independently editable from the display name and explicitly
-- tells the automation engine what this step MEANS. NULL means "no special
-- role" (falls through to 'other' in the engine).

ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS step_type TEXT;

COMMENT ON COLUMN workflow_steps.step_type IS
  'Semantic role: invoicing, payment, closed, or NULL (no cross-app hand-off). '
  'Independent of display name so renaming/localizing a step cannot break automation.';
