-- Transit calculator's editable route reference table (Dar es Salaam →
-- landlocked-neighbour corridors) — the "Route Reference Table" the
-- Aleka Logistics transit rate sheet frames as "editable — update rates as
-- market rates change". Tenant-scoped, not platform reference data, since
-- different clearing agents negotiate different transport rates for the
-- same corridor. No seed here — advanced-calculators.service.ts lazily
-- seeds a tenant's first 8 rows (the real Aleka rate card) the first time
-- that tenant's route list is read empty, so both existing and future
-- tenants get real defaults without a migration-time loop over `tenants`.
CREATE TABLE IF NOT EXISTS transit_route_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  border_post TEXT,
  distance_km NUMERIC(8,1) NOT NULL DEFAULT 0,
  transport_20ft_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  transport_40ft_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  weighbridge_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, destination)
);
CREATE INDEX IF NOT EXISTS idx_transit_route_rates_tenant ON transit_route_rates(tenant_id);
