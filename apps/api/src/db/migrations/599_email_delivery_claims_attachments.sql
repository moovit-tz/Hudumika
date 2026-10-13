ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS claim_token UUID;

-- Existing communication history already knows its outbox; repair the reverse link.
UPDATE email_outbox o SET communication_delivery_id = d.id
FROM comm_delivery_log d
WHERE d.outbox_id = o.id AND d.tenant_id = o.tenant_id
  AND o.communication_delivery_id IS NULL;

UPDATE comm_delivery_log d SET
  status = CASE WHEN o.status = 'sent' THEN 'sent' ELSE 'failed' END,
  sent_at = o.sent_at, provider_id = o.message_id,
  error_message = o.last_error, updated_at = now()
FROM email_outbox o
WHERE d.outbox_id = o.id AND d.tenant_id = o.tenant_id
  AND d.status = 'queued' AND o.status IN ('sent', 'failed', 'simulated');
