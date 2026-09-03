-- Widens lens_links' provider check to admit 'hudumika_issue' — a Lens item
-- linked back to a platform-support ticket (SuperAdmin → Reported Issues →
-- "Send to Lens"). This is not a third-party integration like the other five
-- providers (github/slack/jira/linear/circleci): both sides of the link live
-- in this same database, so it needs no lens_integrations row, no credentials,
-- no webhook — just a same-backend insert. It still belongs in lens_links,
-- not a parallel table, because the board's existing link-badge rendering
-- already handles "provider + external_id + optional url" generically and
-- there is nothing else this pair needs.
ALTER TABLE lens_links DROP CONSTRAINT IF EXISTS lens_links_provider_valid;
ALTER TABLE lens_links ADD CONSTRAINT lens_links_provider_valid
  CHECK (provider IN ('github', 'slack', 'jira', 'linear', 'circleci', 'hudumika_issue'));
