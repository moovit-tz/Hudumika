-- Migration 161: make the migrated SLA workflow byte-identical to the code
-- subscriber it replaces.
--
-- The A/B test against a real shipment matched on 7 of 8 ticket fields; the
-- description differed only in wording I had paraphrased when seeding. For a
-- migration whose whole claim is "this changes nothing functionally", close
-- enough is not the standard — a customer-visible ticket body must be the same
-- text. (160 carries the corrected wording for fresh installs; this fixes rows
-- already seeded.)

UPDATE workflow_studio_apps
SET nodes = REPLACE(
      nodes::text,
      'Shipment {{shipment.refNumber}} exceeded its SLA at stage \"{{shipment.stage}}\" ({{payload.hoursExceeded}} hours over).',
      'Shipment {{shipment.refNumber}} exceeded its SLA deadline at stage \"{{shipment.stage}}\" ({{payload.hoursExceeded}} hours over). Auto-raised by ClearOS.'
    )::jsonb,
    updated_at = NOW()
WHERE name = 'SLA breach raises a support ticket'
  AND nodes::text LIKE '%exceeded its SLA at stage%';
