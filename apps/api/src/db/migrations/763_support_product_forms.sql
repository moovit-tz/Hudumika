-- Per-product ticket forms (support network, follows 761). First applied as
-- 762_support_product_forms.sql, renumbered when another 762 landed alongside it;
-- IF NOT EXISTS makes the re-run under this name a no-op.
--
-- Different product lines need different facts up front: a payment dispute
-- needs a transaction id and amount, a lost-item report a trip date and
-- description. Each product defines its own fields; a ticket stores the
-- answers. Plain JSON on both sides — the field list is short, edited
-- together, and never queried field-by-field across tickets.
--
-- form_fields: [{ "key": "txn_id", "label": "Transaction ID",
--                 "type": "text" | "number" | "date" | "select" | "textarea",
--                 "options": ["…"], "required": true }]
-- custom_fields: { "txn_id": "MP123…", "amount": 25000 }
ALTER TABLE support_products ADD COLUMN IF NOT EXISTS form_fields JSONB NOT NULL DEFAULT '[]';
ALTER TABLE support_tickets  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}';
