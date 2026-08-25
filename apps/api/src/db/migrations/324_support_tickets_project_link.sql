-- Migration 324: M13 of the standalone Projects app — link support_tickets
-- to a project. Nullable FK on the existing generic support_tickets table
-- (046_multichannel_support.sql), not a new table — a ticket already has
-- everything else (customer/channel/priority/category), it only needed a
-- way to say "this one's about project X".

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_project ON support_tickets(project_id) WHERE project_id IS NOT NULL;
