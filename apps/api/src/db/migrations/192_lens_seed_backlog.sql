-- The board, populated with what is actually outstanding.
--
-- An empty tracker gets abandoned. These are the real open items from the tax
-- and finance work, plus the traps already written into CLAUDE.md and AGENTS.md
-- that have each been hit at least once — recorded here so the next person
-- meets them before hitting them rather than after.
--
-- Every row states its confidence honestly. CONFIRMED means it was run;
-- SUSPECTED means it is a reading of the code. Several of these are SUSPECTED
-- on purpose.

INSERT INTO lens_items (ref, kind, title, body, area_id, status, severity, confidence, evidence, waiting_on, refs, tags, resolution, resolved_at)
VALUES

('LENS-1', 'FEATURE',
 'Fiscalisation adapters for authorities other than TRA',
 'A tenant outside Tanzania can invoice, compute a VAT return and close a period correctly, but cannot submit anything. TRA EFDMS is wired directly into the invoice routes; Kenya eTIMS, Uganda EFRIS, Ghana E-VAT and Rwanda EBM each need an adapter behind a common interface. The tax model travels — the filing pipe does not.',
 'fiscal', 'OPEN', 'HIGH', 'CONFIRMED',
 'tra.service.ts is called directly from invoices.routes.ts POST /:id/submit-to-tra. No other authority has any code path. tax_jurisdictions.fiscalisation names the system per country but nothing reads it.',
 'Product decision on which country ships first',
 '["apps/api/src/services/tra.service.ts","apps/api/src/routes/invoices.routes.ts","migration 187"]',
 '["multi-country","plugin"]', NULL, NULL),

('LENS-2', 'FEATURE',
 'Statutory return forms per authority',
 'The submission export produces the complete working — every figure with its heading, the registration it was computed under, and what was excluded. It is deliberately not a country-specific statutory form: TRA, KRA, URA and GRA agree on almost nothing about layout, and emitting something that looked official without the spec would look filable and be rejected. Form generators belong in the per-country plugins.',
 'fiscal', 'OPEN', 'NORMAL', 'CONFIRMED',
 'GET /v1/finance/vat-return/export returns a generic CSV working. Verified by fetching it: 200, text/csv, correct filename, all sections present.',
 'The actual form specs per authority',
 '["apps/api/src/routes/finance.routes.ts"]',
 '["multi-country","plugin"]', NULL, NULL),

('LENS-3', 'FEATURE',
 'Component editor UI for multi-part tax codes',
 'tax_code_components, the arithmetic and the Ghana templates all exist and seed automatically when a workspace switches to Ghana. There is no screen for adding or editing a component by hand, so a custom stack today means inserting rows.',
 'finops', 'OPEN', 'NORMAL', 'CONFIRMED',
 'check-tax-components.ts passes: Ghana 2026 = 20.000%, pre-2026 = 21.900% by compounding. No UI references tax_code_components.',
 NULL,
 '["apps/api/src/services/tax-component.service.ts","migration 188"]',
 '["tax","ui"]', NULL, NULL),

('LENS-4', 'DEBT',
 'Invoices still carry freight-specific columns',
 'sales_invoices holds shipment_ref, bl_number, origin and destination. Harmless today and used by the freight apps, but it couples the finance core to one industry. The mode DEFAULT ''SEA'' part — which silently asserted sea freight on every invoice that did not say — is already fixed.',
 'finops', 'OPEN', 'LOW', 'CONFIRMED',
 'Columns present on sales_invoices. mode default dropped in migration 183 and verified: column_default is null.',
 NULL,
 '["migration 183"]',
 '["multi-industry"]', NULL, NULL),

('LENS-5', 'RISK',
 'Test VAT registrations are still in the database',
 'Six tenants carry registration_number = TEST-VRN-NOT-REAL so the VAT-registered path could be exercised before go-live. They are marked in their notes and the note renders in the UI, but they must be cleared before anything is filed or fiscalised.',
 'finops', 'OPEN', 'HIGH', 'CONFIRMED',
 'select count(*) from tax_registrations where registration_number = ''TEST-VRN-NOT-REAL'' returned 6. Clear with: PROBE=1 npx tsx apps/api/src/scripts/seed-test-vat-registration.ts --clear',
 'Go-live checklist',
 '["apps/api/src/scripts/seed-test-vat-registration.ts"]',
 '["go-live","tax"]', NULL, NULL),

('LENS-6', 'QUESTION',
 'Unclassified tax treatments on historical lines',
 'Invoice lines and products written before tax codes existed carry a rate but no treatment. Zero-rated, exempt, reverse-charge and out-of-scope are indistinguishable once all you have is a percentage, so nothing was guessed. The grouped classify screen reduces it to a handful of decisions, but they are business judgements.',
 'finops', 'BLOCKED', 'NORMAL', 'CONFIRMED',
 'GET /v1/tax-codes/usage reports the counts live. Backlog groups to 3 (line_group, rate) pairs for invoice lines and about 10 for products.',
 'The business, and possibly its accountant',
 '["/finance/tax-codes/classify"]',
 '["tax","data"]', NULL, NULL),

('LENS-7', 'DECISION',
 'Absence is never a value',
 'Recurring design rule, applied throughout the tax work and worth keeping deliberate. A missing tax treatment is *unknown*, not zero-rated. A missing VAT registration is *unrecorded*, not unregistered. A missing exchange rate excludes the document from a return rather than being treated as 1. Each of these was a real defect before it was a rule.',
 'db', 'DONE', 'NORMAL', 'CONFIRMED',
 'Implemented in vat-return.service.ts (unclassified reported separately, fxSkipped counted), tax-registration.service.ts (three states incl. unknown) and splitInputTax (no code = not recoverable).',
 NULL,
 '["migration 180","migration 187"]',
 '["principle"]', 'Adopted as a standing rule and implemented in the tax, registration and return code. Recorded here so it is a decision with a reason rather than a habit.', now()),

('LENS-8', 'BUG',
 'A reply returned from inside withTenant still commits the transaction',
 'Returning reply.status(400) from a handler inside withTenant() returns normally, so the transaction commits. Any validation placed after a write therefore persists the partial state. Observed twice: a rejected tax code left an orphan invoice header, and on PATCH the line-delete runs first so a rejection would have wiped an invoice''s lines. Fixed in invoices, bills and purchase orders by resolving before any write — but the pattern exists elsewhere in the codebase and has not been swept.',
 'db', 'OPEN', 'HIGH', 'CONFIRMED',
 'Reproduced live: POST with a bogus tax code left the invoice row behind (7 invoices before, 8 after). After the fix: 7 before, 7 after, and PATCH rejection left both lines intact and the header unrenamed.',
 NULL,
 '["apps/api/src/routes/invoices.routes.ts","apps/api/src/routes/bills.routes.ts"]',
 '["trap","transactions"]', NULL, NULL),

('LENS-9', 'RISK',
 'Deleting a document leaves its journal entry behind',
 'Fixed for invoices and bills — posted documents now refuse deletion and offer a void that reverses the journal. Other modules that post to the GL have not been checked for the same hole. One orphan entry from before the fix was found and voided by migration 182.',
 'finops', 'OPEN', 'NORMAL', 'SUSPECTED',
 'Confirmed for AR and AP. NOT checked for EXPENSE, PAYROLL or MANUAL source modules — that is why this is SUSPECTED rather than CONFIRMED.',
 NULL,
 '["migration 182","apps/api/src/services/vat-period.service.ts"]',
 '["ledger","integrity"]', NULL, NULL),

('LENS-10', 'DEBT',
 'Concurrent agents can sweep each other''s staged changes into a commit',
 'Two sessions working the same checkout: a broad git add by one picked up work staged by the other and committed it under an unrelated message. Nothing was lost, but the rationale for the swept work was — it had to be reattached as a git note. Worth a convention before it happens with something less recoverable.',
 'db', 'OPEN', 'LOW', 'CONFIRMED',
 'Commit eca4d83 contains migration 189, tax-code.service.ts and the currency fixes under the message "feat: add tax registration service, jurisdictional compliance pages...". Rationale attached via git notes.',
 NULL,
 '["eca4d83"]',
 '["process"]', NULL, NULL),

('LENS-11', 'DECISION',
 'Lens is platform-scoped, not tenant-scoped',
 'Every other table in this schema carries tenant_id and CLAUDE.md requires an explicit filter on it. The lens_* tables deliberately do not: a bug in FinOps is a fact about the software, not about one customer''s workspace. Access is by role. Do not "fix" these tables by adding tenant_id.',
 'db', 'DONE', 'NORMAL', 'CONFIRMED',
 'lens_items, lens_areas and lens_events have no tenant_id. Routes are gated by requireRole(SUPER_ADMIN), matching superadmin.routes.ts.',
 NULL,
 '["migration 191"]',
 '["principle","lens"]', 'Built this way from the start; the reasoning is in migration 191''s header so nobody has to rediscover it.', now())

ON CONFLICT (ref) DO NOTHING;

-- Keep the generated refs ahead of the seeded ones.
SELECT setval('lens_item_ref_seq', GREATEST(
  (SELECT COALESCE(MAX(NULLIF(regexp_replace(ref, '\D', '', 'g'), '')::int), 0) FROM lens_items), 1));
