-- Migration 441: nested contact labels.
--
-- A label may now have a parent label, turning the flat label list into a
-- tree — "Clients ▸ VIP", "Partners ▸ Freight forwarders". Additive:
-- parent_id NULL means a top-level label, which is what every existing row
-- already is.
--
-- Modelled as one self-referential FK on the existing contact_labels table
-- rather than a separate "label_groups" table, so a group is just a label
-- that happens to have children: it can still be assigned to a contact
-- directly, still shows up in the picker, and the existing
-- contact_label_mappings / bulk-label / merge / getDuplicates code paths
-- need no changes at all. Filtering "show me everyone under Clients" walks
-- the tree in the client from this one column.
--
-- ON DELETE SET NULL — deleting a parent promotes its children to
-- top-level. The alternative (ON DELETE CASCADE) would delete a whole
-- subtree of labels in one click and, through contact_label_mappings' own
-- ON DELETE CASCADE, silently strip every one of those labels off every
-- contact that carried it. Promotion is the recoverable choice.
--
-- The existing UNIQUE (tenant_id, name) is deliberately kept: a label name
-- stays unique per workspace regardless of where it sits in the tree. The
-- hierarchy is for organisation, not for namespacing two different "VIP"s.
--
-- Cycle prevention (a label cannot be its own ancestor) is enforced in
-- contacts.service.ts on create/update, walking the ancestor chain. A CHECK
-- constraint can only catch the trivial one-hop self-reference — which this
-- one does, as a cheap backstop.

ALTER TABLE contact_labels
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES contact_labels(id) ON DELETE SET NULL;

ALTER TABLE contact_labels DROP CONSTRAINT IF EXISTS contact_labels_parent_not_self;
ALTER TABLE contact_labels
  ADD CONSTRAINT contact_labels_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS idx_contact_labels_parent
  ON contact_labels(parent_id) WHERE parent_id IS NOT NULL;
