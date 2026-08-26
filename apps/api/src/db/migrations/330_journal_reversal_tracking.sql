-- Migration 330: M0 of the FinOps corporate-tax/accounting build-out.
--
-- GLService.reverseBySource() used to hard-DELETE journal_lines/
-- journal_entries instead of reversing them — the only place in this
-- codebase that ever did that. Fixed to delegate to the real, already-
-- proven voidEntry() reversal (mirror-image entry + VOIDED status), which
-- needs a way to tell "this entry is itself a reversal" from "this is a
-- normal source-tagged entry" — otherwise a second edit of the same source
-- document would find the first edit's own reversal entry (still tagged
-- with the same source_module/source_id, still not itself voided) and
-- incorrectly reverse it too, cascading into a reversal-of-a-reversal chain
-- on every subsequent edit. A real FK, not text-matching the description.

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reverses_entry_id UUID REFERENCES journal_entries(id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reverses ON journal_entries(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
