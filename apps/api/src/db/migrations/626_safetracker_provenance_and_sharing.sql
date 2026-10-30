ALTER TABLE tracking_snapshots
 ADD COLUMN source text NOT NULL DEFAULT 'unknown' CHECK (source IN ('unknown','live','manual','mock')),
 ADD COLUMN provider text,
 ADD COLUMN fetched_at timestamptz,
 ADD COLUMN share_expires_at timestamptz,
 ADD COLUMN share_revoked boolean NOT NULL DEFAULT false;
-- Existing shares have unknown provenance; require an explicit new share.
ALTER TABLE tracked_containers ALTER COLUMN condition SET DEFAULT 'UNKNOWN';
ALTER TABLE container_survey_reports ALTER COLUMN grade SET DEFAULT 'UNASSESSED';

CREATE TABLE freight_booking_sequences (
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 year integer NOT NULL, last_number integer NOT NULL,
 PRIMARY KEY(tenant_id,year)
);
ALTER TABLE freight_booking_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_booking_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON freight_booking_sequences USING (tenant_id = current_setting('app.tenant_id',true)::uuid);
CREATE UNIQUE INDEX freight_bookings_number_unique ON freight_bookings(tenant_id,booking_number);
