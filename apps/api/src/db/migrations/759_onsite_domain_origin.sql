-- How a domain came into Onsite: bought through Onsite's registrar flow
-- (POST /v1/onsite/domains/request), transferred in (POST /domains/transfer),
-- or connected — an existing domain the customer already owned, added by hand.
-- Nothing recorded this before, so SuperAdmin ▸ Domains could not tell a
-- domain a customer bought through the platform from one they pointed at it.

ALTER TABLE onsite_domains ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'connected';

DO $$ BEGIN
  ALTER TABLE onsite_domains ADD CONSTRAINT onsite_domains_origin_check
    CHECK (origin IN ('connected', 'bought', 'transfer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Back-fill from the evidence that exists: the purchase request's domain
-- event, and the transfer marker the transfer route writes into notes.
UPDATE onsite_domains d SET origin = 'bought'
 WHERE origin = 'connected'
   AND EXISTS (SELECT 1 FROM domain_events e
                WHERE e.tenant_id = d.tenant_id AND e.entity_id = d.id
                  AND e.event_type = 'onsite.domain.requested');

UPDATE onsite_domains SET origin = 'transfer'
 WHERE origin = 'connected' AND notes LIKE '{%"transfer":true%';
