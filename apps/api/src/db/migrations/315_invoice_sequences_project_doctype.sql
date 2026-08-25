-- Migration 315: widen invoice_sequences.doc_type to cover 'project' —
-- getNextDocNumber (lib/doc-numbering.ts) gained a 'project' DocType for
-- the standalone Projects app's ref numbers (PRJ-0001 etc, migration 314),
-- but the table's own CHECK constraint (140_workspace_admin_features.sql)
-- still only allowed invoice/quotation/purchase_order — caught live the
-- first time a project was created after adding the TypeScript-side type.

ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_doc_type_check;
ALTER TABLE invoice_sequences ADD CONSTRAINT invoice_sequences_doc_type_check
  CHECK (doc_type IN ('invoice', 'quotation', 'purchase_order', 'project'));
