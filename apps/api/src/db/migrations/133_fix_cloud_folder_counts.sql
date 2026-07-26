-- 133_fix_cloud_folder_counts.sql
-- Corrects existing cloud_files folder rows whose file_count/size were
-- hand-written demo flavor text (e.g. "47 files / 2.3GB") that never
-- matched the handful of rows actually seeded underneath — the same fix
-- 132's sibling change (files.routes.ts seedSampleFiles) applies going
-- forward for brand-new tenants; this is the one-time data correction for
-- tenants that were already seeded before that fix existed.
UPDATE cloud_files f
SET file_count = agg.n,
    size = agg.total_size
FROM (
  SELECT parent_id, COUNT(*) AS n, COALESCE(SUM(size), 0) AS total_size
  FROM cloud_files
  WHERE parent_id IS NOT NULL
  GROUP BY parent_id
) agg
WHERE f.id = agg.parent_id AND f.type = 'folder';

-- Folders with zero real children (e.g. the seeded "Sea Freight"/"Air
-- Freight" subfolders, which never had any rows inserted under them) never
-- match the aggregate above — zero them out explicitly instead of leaving
-- their fabricated counts in place.
UPDATE cloud_files
SET file_count = 0, size = 0
WHERE type = 'folder' AND id NOT IN (
  SELECT DISTINCT parent_id FROM cloud_files WHERE parent_id IS NOT NULL
);
