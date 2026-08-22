-- Sign M6: real Bitcoin anchoring per completed envelope, reusing the exact
-- OpenTimestamps mechanism declaration-ledger-anchor.job.ts/seal-anchor
-- already use (opentimestamps.service.ts — confirmed working live against
-- the real public calendar servers and a real Bitcoin-confirmed historical
-- proof). Per-envelope, not a tenant-wide ledger checkpoint like
-- declaration_ledger_anchors — same column shape, different anchor unit.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS ots_proof BYTEA;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS ots_proof_upgraded BYTEA;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS anchor_hash TEXT;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS anchor_status TEXT; -- 'pending' | 'confirmed' | NULL (not yet anchored)
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS anchor_block_height INTEGER;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS anchor_block_time TIMESTAMPTZ;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS anchor_checked_at TIMESTAMPTZ;
