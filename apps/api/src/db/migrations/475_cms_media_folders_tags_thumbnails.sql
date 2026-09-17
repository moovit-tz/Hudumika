-- 475_cms_media_folders_tags_thumbnails.sql
-- §21-22 of the CMS master brief: "Folders + tags (two new columns,
-- cheap); thumbnail/WebP variants generated on upload via sharp, stored
-- alongside the original." All three, exactly as scoped. folder is a
-- single free-text label, not a real tree — a tenant's media library is
-- small enough that one flat level is the real, useful scope here; tags
-- follows the same plain comma-separated-TEXT convention cms_posts.tags
-- already uses, not a new array type. thumbnail_key is nullable: a
-- thumbnail that failed to generate (a corrupt image, an unsupported
-- subtype) never blocks the upload itself — the media row still works,
-- it just has no thumbnail to serve.

ALTER TABLE cms_media ADD COLUMN IF NOT EXISTS folder TEXT;
ALTER TABLE cms_media ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE cms_media ADD COLUMN IF NOT EXISTS thumbnail_key TEXT;
CREATE INDEX IF NOT EXISTS cms_media_folder ON cms_media (tenant_id, folder) WHERE folder IS NOT NULL;
