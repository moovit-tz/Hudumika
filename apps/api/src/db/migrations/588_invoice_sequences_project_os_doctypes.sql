-- Migration 588: Expand invoice_sequences.doc_type to cover Project OS
-- document types (change requests, payment requests, purchase orders, GRNs)
-- so server-side sequential numbering replaces the browser-generated random
-- 4-digit numbers that were collision-prone.

ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_doc_type_check;
ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_doc_type_check1;
ALTER TABLE invoice_sequences ADD CONSTRAINT invoice_sequences_doc_type_check
  CHECK (doc_type IN ('invoice', 'quotation', 'purchase_order', 'project', 'contract',
                      'change_request', 'payment_request', 'project_po', 'grn'));
