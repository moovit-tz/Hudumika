CREATE TABLE hudufreight_departures (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL,
  departed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, trip_id)
);

CREATE INDEX hudufreight_departures_period_idx
  ON hudufreight_departures (tenant_id, departed_at);

CREATE FUNCTION record_hudufreight_departure() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.hudufreight_departures (tenant_id, trip_id, departed_at)
  VALUES (NEW.tenant_id, NEW.id, NEW.actual_start)
  ON CONFLICT (tenant_id, trip_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Installing the trigger first locks the trip table against concurrent writes
-- until the historical import and the trigger become visible together.
CREATE TRIGGER record_hudufreight_departure
  AFTER INSERT OR UPDATE OF actual_start ON trips
  FOR EACH ROW WHEN (NEW.actual_start IS NOT NULL)
  EXECUTE FUNCTION record_hudufreight_departure();

INSERT INTO hudufreight_departures (tenant_id, trip_id, departed_at, recorded_at)
SELECT tenant_id, id, actual_start, NULL FROM trips WHERE actual_start IS NOT NULL;

ALTER TABLE hudufreight_departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE hudufreight_departures FORCE ROW LEVEL SECURITY;
CREATE POLICY hudufreight_departures_tenant ON hudufreight_departures
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE UPDATE, DELETE ON hudufreight_departures FROM hudumika_app;
GRANT SELECT, INSERT ON hudufreight_departures TO hudumika_app;
