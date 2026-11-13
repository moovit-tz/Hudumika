-- Lens item numbering fell behind the items themselves.
--
-- LENS-78 and LENS-79 were inserted with explicit refs, bypassing
-- lens_item_ref_seq, which stayed at 77. Every POST /v1/lens/items after that
-- asked the sequence for 78, collided with the unique ref, and was refused
-- as "That already exists" — Lens could not take a new item at all.
--
-- Move the sequence past the highest ref in use. GREATEST keeps this safe to
-- re-run and never moves the sequence backwards.

SELECT setval(
  'lens_item_ref_seq',
  GREATEST(
    (SELECT COALESCE(MAX(substring(ref FROM '^LENS-([0-9]+)$')::int), 0) FROM lens_items),
    (SELECT last_value FROM lens_item_ref_seq)
  ),
  true
);
