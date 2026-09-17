-- 471_cms_posts_seo_description.sql
-- §27's own row claimed "seo_description on both Pages and Posts" — a real
-- inaccuracy, found while building this pass: cms_posts never actually had
-- the column at all, only cms_pages did. Closing the gap for real rather
-- than leaving the earlier claim standing uncorrected.

ALTER TABLE cms_posts ADD COLUMN IF NOT EXISTS seo_description TEXT;
