-- 396_fleet_trailers_transporters_borders.sql
-- Closes three real gaps found in a full production-readiness audit of
-- HuduFreight (vehicle/fleet tracking): no trailer entity at all, no
-- subcontracted-transporter entity, and no way for a real dispatched trip
-- (the `trips` table fleetOps.routes.ts actually operates on) to carry a
-- cross-border crossing event — border_crossings existed, but only for the
-- older road_consignments/consignment_trips pair, which the real dispatch
-- workflow has no relationship to at all.

-- ── Transporters (subcontracted haulage providers) ──────────────────────
-- A first-class profile distinct from vehicle_vendors (workshop/maintenance
-- vendors) — "a subcontracted vehicle must be distinguishable from an owned
-- vehicle" only holds if there's something real to point it at.
CREATE TABLE transporters (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name           VARCHAR(200) NOT NULL,
    contact_name   VARCHAR(200),
    phone          VARCHAR(30),
    email          VARCHAR(320),
    contract_ref   VARCHAR(150),
    rate_notes     TEXT,
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_transporters_tenant ON transporters(tenant_id);
ALTER TABLE transporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE transporters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_transporters ON transporters
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE vehicles ADD COLUMN transporter_id UUID REFERENCES transporters(id) ON DELETE SET NULL;
CREATE INDEX idx_vehicles_transporter ON vehicles(transporter_id) WHERE transporter_id IS NOT NULL;

-- A real GPS device has no user session to authenticate with. The manual
-- position-ingestion endpoint used to accept any authenticated tenant
-- user's token for this (any role, meant for anyone) — this per-vehicle
-- secret lets it instead be reached with no user session at all, the way a
-- real tracker actually would, without one leaked device compromising
-- another tenant's fleet or requiring a shared platform-wide key.
ALTER TABLE vehicles ADD COLUMN device_secret VARCHAR(64);

-- ── Trailers ─────────────────────────────────────────────────────────────
CREATE TABLE trailers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    registration_number VARCHAR(50),
    vin                 VARCHAR(50),
    trailer_type        VARCHAR(30) NOT NULL DEFAULT 'FLATBED', -- FLATBED | CONTAINER_CHASSIS | TANKER | REEFER | LOWBED | CURTAIN_SIDE | OTHER
    capacity_kg         NUMERIC(10,1),
    axles               INTEGER,
    ownership           VARCHAR(20) NOT NULL DEFAULT 'OWNED', -- OWNED | LEASED | RENTED | SUBCONTRACTED
    transporter_id      UUID REFERENCES transporters(id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | MAINTENANCE | OUT_OF_SERVICE | DECOMMISSIONED
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trailers_tenant ON trailers(tenant_id);
ALTER TABLE trailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trailers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trailers ON trailers
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Same shape as vehicle_documents, one table per subject rather than a
-- polymorphic documents table — matches how this schema already keeps
-- vehicle_documents separate rather than generic.
CREATE TABLE trailer_documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trailer_id   UUID NOT NULL REFERENCES trailers(id) ON DELETE CASCADE,
    doc_type     VARCHAR(30) NOT NULL DEFAULT 'OTHER', -- REGISTRATION | INSURANCE | INSPECTION | PERMIT | OTHER
    doc_number   VARCHAR(150),
    issued_date  DATE,
    expiry_date  DATE,
    file_url     TEXT,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trailer_documents_tenant ON trailer_documents(tenant_id);
CREATE INDEX idx_trailer_documents_expiry ON trailer_documents(expiry_date) WHERE expiry_date IS NOT NULL;
ALTER TABLE trailer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trailer_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_trailer_documents ON trailer_documents
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- A trip is now really Truck + Trailer + Driver — trailer is optional (a
-- rigid box truck needs none), but when set, the dispatch guard applies the
-- same status/double-booking checks to it as to the vehicle itself.
ALTER TABLE trips ADD COLUMN trailer_id UUID REFERENCES trailers(id) ON DELETE SET NULL;
CREATE INDEX idx_trips_trailer ON trips(trailer_id) WHERE trailer_id IS NOT NULL;

-- ── Cross-border: let a real fleet trip carry border-crossing events ─────
-- border_crossings had no tenant_id of its own — RLS was enforced only via
-- a subquery through consignment_id -> road_consignments.tenant_id (see
-- 240_rls_policy_hardening.sql). That only works while consignment_id is
-- mandatory; making it optional so a crossing can belong to a real fleet
-- trip instead would make such a row's effective tenant NULL under that
-- policy — invisible to everyone, including its own tenant. A real
-- tenant_id column plus a direct policy fixes that instead of leaving the
-- new case silently broken.
ALTER TABLE border_crossings ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE border_crossings bc SET tenant_id = rc.tenant_id
    FROM road_consignments rc WHERE bc.consignment_id = rc.id;
ALTER TABLE border_crossings ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_border_crossings_tenant ON border_crossings(tenant_id);

ALTER TABLE border_crossings ALTER COLUMN consignment_id DROP NOT NULL;
ALTER TABLE border_crossings ADD COLUMN fleet_trip_id UUID REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE border_crossings ADD CONSTRAINT border_crossings_has_a_parent
    CHECK (consignment_id IS NOT NULL OR fleet_trip_id IS NOT NULL);
CREATE INDEX idx_border_crossings_fleet_trip ON border_crossings(fleet_trip_id) WHERE fleet_trip_id IS NOT NULL;

DROP POLICY tenant_isolation_border_crossings ON border_crossings;
CREATE POLICY tenant_isolation_border_crossings ON border_crossings
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
