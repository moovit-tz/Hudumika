-- 478_cms_forms.sql
-- §30-31 of the CMS master brief: Forms + form workflows. A tenant defines
-- a form's own field shape (fields JSONB — [{key,label,type,required,options?}],
-- CmsFormField in @hudumika/types), places it on the public site via a real
-- 'form' block type (a small, additive entry in cms-content.service.ts's
-- own BLOCK_TYPES registry, exactly per the Implementation Map's own note
-- that this needed no new infrastructure beyond §5's existing block
-- registry), and a visitor's submission is validated against that same
-- field config server-side and stored — honeypot-guarded the same way blog
-- comments (§37) already are, never trusting client-side validation alone.

CREATE TABLE IF NOT EXISTS cms_forms (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT        NOT NULL,
  key             TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  fields          JSONB       NOT NULL DEFAULT '[]',
  success_message TEXT,
  notify_email    TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS cms_form_submissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  form_id     UUID        NOT NULL REFERENCES cms_forms(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_form_submissions_form ON cms_form_submissions (tenant_id, form_id, created_at DESC);

ALTER TABLE cms_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_forms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_forms;
CREATE POLICY tenant_isolation_policy ON cms_forms
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE cms_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_form_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_form_submissions;
CREATE POLICY tenant_isolation_policy ON cms_form_submissions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
