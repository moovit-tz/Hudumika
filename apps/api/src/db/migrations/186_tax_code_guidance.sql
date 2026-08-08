-- Somewhere to record *why* a treatment was chosen.
--
-- Classifying the backlog is a judgement made once, by someone who went and
-- checked. Right now that reasoning lives nowhere: the next person to meet an
-- unclassified line re-derives it from scratch, or worse, copies whatever the
-- neighbouring line says.
--
-- This is deliberately empty by default and tenant-written. It is NOT seeded
-- with tax law. Which supplies are zero-rated or exempt is jurisdiction-specific
-- and changes; baking one country's rules into a platform that already carries
-- a `jurisdiction` column per tax code would be the same mistake as
-- `sales_invoices.mode DEFAULT 'SEA'` - an assertion nobody made, in a place
-- nobody would think to look for it.
ALTER TABLE tax_codes
  ADD COLUMN IF NOT EXISTS guidance TEXT;

COMMENT ON COLUMN tax_codes.guidance IS
  'Tenant-written note on which of their supplies belong under this treatment, '
  'and why. Shown wherever the code is chosen, so a judgement made once does '
  'not have to be made again from memory.';
