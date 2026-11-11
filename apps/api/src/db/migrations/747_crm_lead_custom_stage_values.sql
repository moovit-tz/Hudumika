-- Lead stage settings use tenant-owned crm_lead_stages UUIDs. The original
-- leads.stage CHECK only allowed the legacy fixed list and rejected every
-- configured stage ID sent by the CRM UI.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
