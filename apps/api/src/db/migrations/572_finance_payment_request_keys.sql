ALTER TABLE invoice_payments ADD COLUMN request_key text;
ALTER TABLE bill_payments ADD COLUMN request_key text;
CREATE UNIQUE INDEX invoice_payment_request_unique ON invoice_payments (tenant_id, invoice_id, request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX bill_payment_request_unique ON bill_payments (tenant_id, bill_id, request_key) WHERE request_key IS NOT NULL;
