-- Sign app RLS retrofit — same category of gap as 245_onsite_rls.sql.
--
-- 267_sign_app.sql shipped all six sign_* tables with no RLS at all,
-- documented as a deliberate choice ("tenant isolation is enforced
-- explicitly via tenant_id WHERE clauses on every query"). The application
-- layer (sign.routes.ts) has in fact scoped every authenticated query by
-- tenant_id throughout, so this isn't evidence of a leak — but per
-- CLAUDE.md's standing rule, explicit WHERE clauses are the first line of
-- defense, not a substitute for the second one every other tenant-scoped
-- table in this schema carries. This brings Sign to the same standard.
--
-- sign_fields, sign_events and sign_verifications don't carry their own
-- tenant_id today (only envelope_id/recipient_id) — sign_recipients
-- already established the "denormalize tenant_id even though a parent FK
-- exists" pattern inside 267 itself, so these three get a real column too,
-- backfilled from their parent envelope, rather than a subquery-based
-- policy shape used nowhere else in this schema.

ALTER TABLE sign_fields ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE sign_fields f SET tenant_id = e.tenant_id FROM sign_envelopes e WHERE f.envelope_id = e.id AND f.tenant_id IS NULL;
ALTER TABLE sign_fields ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS sign_fields_tenant_idx ON sign_fields(tenant_id);

ALTER TABLE sign_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE sign_events ev SET tenant_id = e.tenant_id FROM sign_envelopes e WHERE ev.envelope_id = e.id AND ev.tenant_id IS NULL;
ALTER TABLE sign_events ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS sign_events_tenant_idx ON sign_events(tenant_id);

-- sign_verifications.envelope_id was NOT NULL with no fallback for a
-- "code not found" lookup — GET /public/verify/:code plugged in a
-- well-known zero-UUID for that case, which violates the FK to
-- sign_envelopes and has been silently failing (swallowed by a .catch())
-- ever since, so not-found lookups were never actually being logged
-- despite the route's own "log every lookup regardless of result" intent.
-- Made nullable so the fix in sign.routes.ts can pass real NULL instead.
ALTER TABLE sign_verifications ALTER COLUMN envelope_id DROP NOT NULL;
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE sign_verifications v SET tenant_id = e.tenant_id FROM sign_envelopes e WHERE v.envelope_id = e.id AND v.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS sign_verifications_tenant_idx ON sign_verifications(tenant_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sign_envelopes', 'sign_recipients', 'sign_fields',
    'sign_events', 'sign_templates', 'sign_verifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
