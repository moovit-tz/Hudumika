-- Migration 164: byte parity for the duty-expense label.
--
-- The code subscriber builds:
--   Customs duty — declaration <tancisRef ?? declarationId>[ (bill <billNumber>)]
--
-- The seeded workflow used {{declaration.tancisRef}} alone: no bill number, and
-- a literal "null" in the label whenever a declaration has no TANCIS reference.
-- The resolver now supplies declaration.ref (the fallback already applied) and
-- declaration.billSuffix (empty string when there is no bill), because the
-- template syntax has no conditionals — deliberately, since adding them turns
-- it into a language to maintain.

UPDATE workflow_studio_apps
SET nodes = jsonb_set(
      nodes,
      '{2,config,input,label}',
      '"Customs duty — declaration {{declaration.ref}}{{declaration.billSuffix}}"'::jsonb
    ),
    updated_at = NOW()
WHERE name = 'Released declaration books the customs duty'
  AND nodes::text LIKE '%declaration {{declaration.tancisRef}}%';
