-- Feature grants for plans that do not exist.
--
-- package_features held rows for three package codes — finance, operations,
-- professional — that have no matching row in `packages`. They are left over
-- from an earlier naming of the plans (the live set is starter, growth, scale,
-- enterprise), and nothing references them: no tenant is on one, the plan
-- picker cannot show one, and no code path reads one.
--
-- Harmless today, but a trap tomorrow: create a package with code 'finance'
-- and it would silently inherit whatever this stale set happens to grant. A
-- grant is meaningless without a plan to attach it to, so the orphans go.
--
-- Scoped to exactly the orphans — any code present in `packages` is untouched,
-- so this cannot remove a live grant even if the plan set changes later.

DELETE FROM package_features pf
WHERE NOT EXISTS (
  SELECT 1 FROM packages p WHERE p.code = pf.package_code
);
