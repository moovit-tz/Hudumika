-- Second half of the fix started in 669_resolve_legal_table_name_collision.sql.
--
-- Migration 669 resolved the legal_clients/privacy_incidents collision but
-- missed a second, independent one: 660_legal_extended_domain.sql (now
-- renumbered 681, see that file's own header) is NOT abandoned or foreign
-- work — it is this project's own continuation of the legal_privacy_domain
-- schema (670, ex-657), extending legal_matters/legal_clients/legal_time_entries
-- with court diary, deadlines, disbursements, and invoicing. It independently
-- reuses 5 table names that 656_legal_domain_core.sql/657_legal_domain_billing.sql/
-- 658_legal_domain_compliance.sql (a separate, already-applied LexCore-source
-- port, unrelated to this one — see 669's own header) also created:
-- legal_deadlines, legal_invoices, legal_invoice_lines, tanzania_holidays,
-- privacy_vendors.
--
-- apps/api/src/routes/legal.routes.ts's actual queries confirm which schema
-- is live: its legal_deadlines inserts/updates work against a matter_id FK
-- that must resolve through legal_matters (670's table, not 656's unprefixed
-- matters) — checked directly against both CREATE TABLE statements, not
-- inferred. As with 669, nothing live reads the already-applied LexCore-port
-- versions of these 5 tables (grepped: zero call sites), and all 5 were
-- empty at rename time (verified). Postgres carries existing FK constraints
-- (time_entries.invoice_id, disbursements.invoice_id, trust_transactions.invoice_id
-- all reference legal_invoices) through a table rename automatically — checked
-- via information_schema before writing this, not assumed.
ALTER TABLE IF EXISTS legal_deadlines RENAME TO lexcore_port_legal_deadlines;
ALTER TABLE IF EXISTS legal_invoices RENAME TO lexcore_port_legal_invoices;
ALTER TABLE IF EXISTS legal_invoice_lines RENAME TO lexcore_port_legal_invoice_lines;
ALTER TABLE IF EXISTS tanzania_holidays RENAME TO lexcore_port_tanzania_holidays;
ALTER TABLE IF EXISTS privacy_vendors RENAME TO lexcore_port_privacy_vendors;
