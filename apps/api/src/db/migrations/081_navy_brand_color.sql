-- Migration 081: Rebrand accent from orange to "Midnight Navy".
--
-- Replaces the brand accent set in migration 078/080 (#e8461a, orange) with
-- a deep navy (#0b1e3a) across every place a literal hex of the brand color
-- is persisted server-side. The CSS var itself (--teal in index.css) and its
-- HSL/shadcn bridge are updated in code, not here — this migration only
-- covers DB-persisted copies.

UPDATE packages SET color = '#0b1e3a', updated_at = NOW();
