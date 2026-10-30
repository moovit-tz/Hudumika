-- Migration 630: Subscriber delivery tracking for first-party domain-event
-- handlers (I02).
--
-- Studio already has a durable outbox (studio_event_outbox, migration 592).
-- First-party in-process subscribers (finance.subscribers.ts etc.) run
-- fire-and-forget off dispatchDomainEvent — if the process crashes after
-- the domain_events row commits but before the handler finishes, the
-- subscriber silently never runs.
--
-- This adds a lightweight delivery-tracking flag to domain_events so a
-- recovery sweep can replay undelivered events on startup.

ALTER TABLE domain_events
  ADD COLUMN IF NOT EXISTS subscribers_dispatched BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN domain_events.subscribers_dispatched IS
  'Set TRUE after all in-process (first-party) subscribers have been called '
  'for this event. A FALSE row older than a few seconds is eligible for '
  'recovery replay on server startup.';

CREATE INDEX IF NOT EXISTS idx_domain_events_undelivered
  ON domain_events (created_at)
  WHERE subscribers_dispatched = FALSE;
