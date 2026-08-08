-- Lens ↔ the tools the work actually happens in.
--
-- An internal record that nobody updates is worse than none, because it looks
-- authoritative and is stale. The way it stays current is by being connected to
-- where the work already is: the commit, the PR, the Slack thread, the Jira or
-- Linear ticket, the failing build.
--
-- Two halves, deliberately separate:
--
--   lens_integrations  the connection to a provider — credentials and config.
--   lens_links         one item ↔ one thing in that provider.
--
-- A link can exist without an integration. Pasting a GitHub URL onto an item is
-- useful on its own and needs no credentials; the integration is only required
-- to *do* something (open an issue, post to a channel, read a build status).
-- Keeping them apart means the useful half works immediately.

CREATE TABLE IF NOT EXISTS lens_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      VARCHAR(24) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'disconnected',

  -- Non-secret settings: repo, project key, channel, org slug.
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- The token. Kept in its own column rather than inside `config` so it is
  -- obvious what must never be returned to a client, and so a careless
  -- `select config` cannot leak it. Stored as given: this platform has no
  -- key-management service, and pretending a base64 wrapper is encryption
  -- would be worse than storing it plainly and saying so.
  credential    TEXT,

  -- Shared secret for verifying inbound webhooks from this provider.
  webhook_secret TEXT,

  last_sync_at  TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lens_integrations DROP CONSTRAINT IF EXISTS lens_integrations_provider_valid;
ALTER TABLE lens_integrations ADD CONSTRAINT lens_integrations_provider_valid
  CHECK (provider IN ('github', 'slack', 'jira', 'linear', 'circleci'));

ALTER TABLE lens_integrations DROP CONSTRAINT IF EXISTS lens_integrations_status_valid;
ALTER TABLE lens_integrations ADD CONSTRAINT lens_integrations_status_valid
  CHECK (status IN ('disconnected', 'connected', 'error'));

-- One connection per provider. Lens is platform-scoped, so there is exactly one
-- GitHub, one Slack, and so on — not one per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS lens_integrations_provider_uq
  ON lens_integrations (provider);

COMMENT ON COLUMN lens_integrations.credential IS
  'Provider token, stored as given — this platform has no KMS and a base64 '
  'wrapper would be theatre. Never returned by the API; endpoints report only '
  'whether one is present.';


CREATE TABLE IF NOT EXISTS lens_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES lens_items(id) ON DELETE CASCADE,

  provider    VARCHAR(24) NOT NULL,
  -- 'issue', 'pull_request', 'commit', 'build', 'message', 'branch'
  kind        VARCHAR(24) NOT NULL,

  -- What the provider calls it: 'owner/repo#42', 'PROJ-1234', 'ENG-88', a SHA.
  external_id VARCHAR(200) NOT NULL,
  url         TEXT,
  title       TEXT,

  -- The provider's own status, mirrored on the way in. Never authoritative for
  -- the Lens item: a merged PR does not close an item, because "the code
  -- changed" and "the problem is settled" are different claims. It is shown
  -- beside the item and left to a human.
  external_status VARCHAR(48),
  synced_at   TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lens_links DROP CONSTRAINT IF EXISTS lens_links_provider_valid;
ALTER TABLE lens_links ADD CONSTRAINT lens_links_provider_valid
  CHECK (provider IN ('github', 'slack', 'jira', 'linear', 'circleci'));

CREATE UNIQUE INDEX IF NOT EXISTS lens_links_unique
  ON lens_links (item_id, provider, external_id);
CREATE INDEX IF NOT EXISTS lens_links_item_idx ON lens_links (item_id);
CREATE INDEX IF NOT EXISTS lens_links_lookup_idx ON lens_links (provider, external_id);

COMMENT ON COLUMN lens_links.external_status IS
  'The provider''s status, mirrored inward for display. Never closes a Lens '
  'item on its own — a merged PR means the code changed, not that the problem '
  'is settled.';


-- Board columns, so the Jira-style view is configuration rather than a
-- hardcoded list. Status stays the source of truth; a column is a lens on it.
CREATE TABLE IF NOT EXISTS lens_columns (
  id         VARCHAR(24) PRIMARY KEY,
  name       VARCHAR(48) NOT NULL,
  status     VARCHAR(16) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 100,
  -- A soft cap, shown but never enforced: work-in-progress limits are a prompt
  -- to a person, not a rule for a database.
  wip_limit  SMALLINT
);

INSERT INTO lens_columns (id, name, status, sort_order, wip_limit) VALUES
  ('open',        'Open',        'OPEN',        10, NULL),
  ('in_progress', 'In progress', 'IN_PROGRESS', 20, 5),
  ('blocked',     'Blocked',     'BLOCKED',     30, NULL),
  ('done',        'Done',        'DONE',        40, NULL)
ON CONFLICT (id) DO NOTHING;
