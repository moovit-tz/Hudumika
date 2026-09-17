-- 482_cms_workflow_releases_site_id.sql
-- Migration 477 added multisite `site_id` to cms_pages/cms_posts/cms_media/
-- cms_content_entries/cms_nav_items, but not to the three tables it created
-- in that same migration — cms_workflow_states, cms_workflow_transitions,
-- and cms_releases. cms-enterprise.service.ts's workflow-state/transition and
-- release CRUD was written assuming `site_id` exists on all three (reads,
-- writes, and filters it throughout), so every one of those endpoints has
-- been raising a real "column does not exist" 500 since 477 shipped —
-- reproduced live: GET /v1/cms/workflows/states, GET /v1/cms/workflows/
-- transitions, and GET /v1/cms/releases all 500 today, breaking the Workflow
-- and Releases pages entirely and a Dashboard widget that loads workflow
-- states. Closing the same schema/code drift 477 itself was meant to avoid
-- for the five tables it did remember, using the exact same additive,
-- nullable, default-site-backfilled pattern.

ALTER TABLE cms_workflow_states ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;
ALTER TABLE cms_workflow_transitions ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;
ALTER TABLE cms_releases ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES cms_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cms_workflow_states_site ON cms_workflow_states (tenant_id, site_id);
CREATE INDEX IF NOT EXISTS cms_workflow_transitions_site ON cms_workflow_transitions (tenant_id, site_id);
CREATE INDEX IF NOT EXISTS cms_releases_site ON cms_releases (tenant_id, site_id);

UPDATE cms_workflow_states w SET site_id = s.id
FROM cms_sites s
WHERE w.site_id IS NULL AND s.tenant_id = w.tenant_id AND s.is_default = true;

UPDATE cms_workflow_transitions t SET site_id = s.id
FROM cms_sites s
WHERE t.site_id IS NULL AND s.tenant_id = t.tenant_id AND s.is_default = true;

UPDATE cms_releases r SET site_id = s.id
FROM cms_sites s
WHERE r.site_id IS NULL AND s.tenant_id = r.tenant_id AND s.is_default = true;
