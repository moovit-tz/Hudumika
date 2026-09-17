-- 473_cms_page_templates.sql
-- §11 of the CMS master brief: "Add a template enum column now (cheap)."
-- Real effect, not a placeholder: 'standard' keeps the site header/nav and
-- the usual reading-width column; 'full-width' keeps the header/nav but
-- drops the max-width constraint on the content area; 'landing' drops the
-- header/nav entirely and renders edge-to-edge, for a dedicated marketing
-- page with its own layout. Protected/redirect/system-page types (the
-- brief's other named template ideas) still want the Content Model system
-- (§2) first, so a genuinely new page *type* is data on that layer, not a
-- new column here each time — this migration only ever adds the three
-- template values that change how an existing page renders.

ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS template TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE cms_pages DROP CONSTRAINT IF EXISTS cms_pages_template_check;
ALTER TABLE cms_pages ADD CONSTRAINT cms_pages_template_check
  CHECK (template IN ('standard', 'full-width', 'landing'));
