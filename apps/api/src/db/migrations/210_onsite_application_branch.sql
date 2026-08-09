-- An application that cannot say which branch it deploys is not deployable.
--
-- onsite_applications records repo_provider/repo_owner/repo_name/repo_url but
-- no branch, so every deployment had to be told one by hand and two deploys of
-- "the same application" could come from different code with nothing in the
-- record to show it. ONSITE.md §18 lists Branch among an application's fields
-- for exactly this reason, and §20 wants branch-to-environment mapping built on
-- top of it.
--
-- 'main' as the default is the current behaviour written down rather than a new
-- choice: the deploy route already fell back to 'main' when the request omitted
-- a branch.

ALTER TABLE onsite_applications
  ADD COLUMN IF NOT EXISTS default_branch TEXT NOT NULL DEFAULT 'main';

COMMENT ON COLUMN onsite_applications.default_branch IS
  'Branch deployed when a deploy request does not name one. Per-environment branch mapping (ONSITE.md §20) layers on top of this.';
