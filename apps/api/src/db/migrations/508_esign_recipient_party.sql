-- eSign recipients: link to the canonical person party when it is unambiguous.
--
-- A signing recipient's name/email stay on the recipient row as an immutable
-- snapshot (that is the legal record of who was asked to sign — it must not
-- change if the contact is later renamed or merged). party_id only says WHICH
-- known person that recipient is, so the Party view can show their signing
-- history. It is set automatically only when exactly one ACTIVE, workspace-wide
-- (TENANT-visibility) PERSON party owns that email; anything ambiguous or
-- private is left NULL rather than guessed. Internal signers (user_id set) are
-- employees and stay users, never parties.
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES parties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sign_recipients_party ON sign_recipients(tenant_id, party_id) WHERE party_id IS NOT NULL;

CREATE OR REPLACE FUNCTION link_sign_recipient_party() RETURNS trigger AS $$
DECLARE hits uuid[];
BEGIN
  IF NEW.party_id IS NULL AND NEW.user_id IS NULL AND NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
    SELECT array_agg(DISTINCT p.id) INTO hits
    FROM party_channels pc JOIN parties p ON p.id = pc.party_id AND p.tenant_id = pc.tenant_id
    WHERE pc.tenant_id = NEW.tenant_id AND pc.channel_type = 'EMAIL' AND pc.status = 'ACTIVE'
      AND pc.normalized_value = lower(trim(NEW.email))
      AND p.party_type = 'PERSON' AND p.status = 'ACTIVE' AND p.visibility = 'TENANT';
    IF hits IS NOT NULL AND array_length(hits, 1) = 1 THEN NEW.party_id := hits[1]; END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sign_recipients_party ON sign_recipients;
CREATE TRIGGER trg_sign_recipients_party BEFORE INSERT OR UPDATE OF email ON sign_recipients
  FOR EACH ROW EXECUTE FUNCTION link_sign_recipient_party();

-- Backfill (touching email fires the trigger; only rows still unlinked).
UPDATE sign_recipients SET email = email
WHERE party_id IS NULL AND user_id IS NULL AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = sign_recipients.tenant_id);
