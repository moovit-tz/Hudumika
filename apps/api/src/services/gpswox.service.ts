import { withTenant } from '../db/client.js';
import { checkGeofenceTransitions } from '../routes/tracking.routes.js';

export interface GpswoxCreds {
  base_url: string;
  email: string;
  password: string;
}

interface GpswoxDeviceRaw {
  id: number | string;
  imei: string;
  name?: string;
  lat?: number | string;
  lng?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  speed?: number | string;
  course?: number | string;
  last_update?: string;
  updated_at?: string;
  sensors?: { type: string; value: string }[];
}

export interface GpswoxSyncResult {
  ok: boolean;
  reason?: 'not_configured' | 'login_failed' | 'fetch_failed';
  matched: number;
  unmatched: string[];
  offline_alerts_created: number;
  synced_at: string;
}

const OFFLINE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export class GpswoxService {
  /**
   * Tenant-scoped GPSWOX credentials, read fresh on every call — no caching,
   * no encryption, same convention as email.ts's tenant_settings lookup.
   * GPSWOX is typically self-hosted per deployment, so base_url isn't a constant.
   */
  async getCreds(tenantId: string): Promise<GpswoxCreds | null> {
    const row = await withTenant(tenantId, trx => trx.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!row) return null;
    const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    const c = settings?.['int-gpswox'];
    if (!c?.base_url || !c?.email || !c?.password) return null;
    return { base_url: String(c.base_url).replace(/\/+$/, ''), email: c.email, password: c.password };
  }

  /**
   * POST /login (email + password) -> user_api_hash. GPSWOX auth is a
   * query-string hash, not a bearer header. Re-logging in per sync run is
   * simpler/safer than tracking hash expiry — one extra request per
   * multi-minute poll cycle is cheap.
   */
  async login(creds: GpswoxCreds): Promise<string | null> {
    try {
      const res = await fetch(`${creds.base_url}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data = await res.json() as any;
      return data?.user_api_hash ?? null;
    } catch {
      return null;
    }
  }

  /**
   * GET /get_devices_latest — devices changed since `since` (or all devices,
   * if omitted), each with its current position/status. Purpose-built for
   * cheap periodic polling (vs. /get_devices, which is the full paginated list).
   */
  async getDevicesLatest(creds: GpswoxCreds, hash: string, since?: string): Promise<GpswoxDeviceRaw[] | null> {
    try {
      const params = new URLSearchParams({ user_api_hash: hash });
      if (since) params.set('since', since);
      const res = await fetch(`${creds.base_url}/api/get_devices_latest?${params.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = await res.json() as any;
      const devices = data?.devices ?? data?.data ?? [];
      return Array.isArray(devices) ? devices : null;
    } catch {
      return null;
    }
  }

  /** POST /v1/tracking/gpswox/test — verify credentials without touching any data. */
  async testConnection(tenantId: string): Promise<{ success: boolean; error?: string }> {
    const creds = await this.getCreds(tenantId);
    if (!creds) return { success: false, error: 'GPSWOX credentials are not configured' };
    const hash = await this.login(creds);
    if (!hash) return { success: false, error: 'Login failed — check base URL, email, and password' };
    return { success: true };
  }

  /** Persists the outcome of a sync run into tenant_settings, so /status has something to read without a new table. */
  private async recordSyncResult(tenantId: string, patch: Partial<GpswoxSyncResult>): Promise<void> {
    const { sql } = await import('kysely');
    const value = JSON.stringify({ gpswox_status: { ...patch, synced_at: new Date().toISOString() } });
    await withTenant(tenantId, trx =>
      sql`UPDATE tenant_settings SET settings = settings || ${value}::jsonb, updated_at = NOW() WHERE tenant_id = ${tenantId}`.execute(trx));
  }

  /**
   * Fetches the latest devices from GPSWOX and inserts their positions into
   * our own vehicle_positions table, matched to `vehicles.device_id` by IMEI
   * (the identifier printed on the physical tracker, which is what ops enter
   * when registering a vehicle — GPSWOX's internal numeric `id` is not
   * something a human would type in). Runs the same geofence-transition
   * check used by the manual /positions/ingest path.
   */
  async syncPositions(tenantId: string, onPosition?: (vehicleId: string, lat: number, lng: number) => void): Promise<GpswoxSyncResult> {
    const creds = await this.getCreds(tenantId);
    if (!creds) {
      return { ok: false, reason: 'not_configured', matched: 0, unmatched: [], offline_alerts_created: 0, synced_at: new Date().toISOString() };
    }

    const hash = await this.login(creds);
    if (!hash) {
      const result: GpswoxSyncResult = { ok: false, reason: 'login_failed', matched: 0, unmatched: [], offline_alerts_created: 0, synced_at: new Date().toISOString() };
      await this.recordSyncResult(tenantId, result);
      return result;
    }

    const devices = await this.getDevicesLatest(creds, hash);
    if (!devices) {
      const result: GpswoxSyncResult = { ok: false, reason: 'fetch_failed', matched: 0, unmatched: [], offline_alerts_created: 0, synced_at: new Date().toISOString() };
      await this.recordSyncResult(tenantId, result);
      return result;
    }

    let matched = 0;
    const unmatched: string[] = [];
    let offlineAlertsCreated = 0;
    const seenVehicleIds = new Set<string>();

    await withTenant(tenantId, async (trx) => {
      const vehicles = await trx.selectFrom('vehicles')
        .select(['id', 'device_id'])
        .where('tenant_id', '=', tenantId)
        .where('device_id', 'is not', null)
        .execute();
      const vehicleByDeviceId = new Map(vehicles.map(v => [v.device_id, v.id]));

      for (const device of devices) {
        const vehicleId = vehicleByDeviceId.get(device.imei);
        if (!vehicleId) {
          unmatched.push(device.imei ?? String(device.id));
          continue;
        }
        seenVehicleIds.add(vehicleId);

        const lat = Number(device.lat ?? device.latitude);
        const lng = Number(device.lng ?? device.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        let ignition: 'ON' | 'OFF' | null = null;
        let batteryPct: number | null = null;
        for (const s of device.sensors ?? []) {
          if (s.type === 'ignition') ignition = (s.value === '1' || s.value.toLowerCase() === 'on') ? 'ON' : 'OFF';
          if (s.type === 'battery') batteryPct = Number.isFinite(Number(s.value)) ? Number(s.value) : null;
        }

        await trx.insertInto('vehicle_positions').values({
          tenant_id: tenantId,
          vehicle_id: vehicleId,
          latitude: lat,
          longitude: lng,
          speed: device.speed != null ? Number(device.speed) : null,
          heading: device.course != null ? Number(device.course) : null,
          battery_pct: batteryPct,
          ignition,
          recorded_at: (device.last_update || device.updated_at) ? new Date(device.last_update || device.updated_at!) : new Date(),
        } as any).execute();

        await checkGeofenceTransitions(trx, tenantId, vehicleId, lat, lng);
        onPosition?.(vehicleId, lat, lng);
        matched++;
      }

      // Vehicles with a device_id configured that GPSWOX didn't report this
      // cycle and whose last known position is stale get a DEVICE_OFFLINE
      // alert, deduped against any already-unacknowledged one.
      for (const v of vehicles) {
        if (seenVehicleIds.has(v.id)) continue;
        const lastPos = await trx.selectFrom('vehicle_positions')
          .select('recorded_at')
          .where('vehicle_id', '=', v.id).where('tenant_id', '=', tenantId)
          .orderBy('recorded_at', 'desc').limit(1).executeTakeFirst();
        const ageMs = lastPos ? Date.now() - new Date(lastPos.recorded_at).getTime() : Infinity;
        if (ageMs < OFFLINE_THRESHOLD_MS) continue;

        const existingAlert = await trx.selectFrom('fleet_alerts').select('id')
          .where('vehicle_id', '=', v.id).where('tenant_id', '=', tenantId)
          .where('alert_type', '=', 'DEVICE_OFFLINE').where('acknowledged', '=', false)
          .executeTakeFirst();
        if (existingAlert) continue;

        await trx.insertInto('fleet_alerts').values({
          tenant_id: tenantId, vehicle_id: v.id,
          alert_type: 'DEVICE_OFFLINE', severity: 'WARNING',
          message: 'Vehicle device not reporting via GPSWOX', acknowledged: false,
        } as any).execute();
        offlineAlertsCreated++;
      }
    });

    const result: GpswoxSyncResult = { ok: true, matched, unmatched, offline_alerts_created: offlineAlertsCreated, synced_at: new Date().toISOString() };
    await this.recordSyncResult(tenantId, result);
    return result;
  }

  /** GET /v1/tracking/gpswox/status — last sync outcome, read back from tenant_settings. */
  async getStatus(tenantId: string): Promise<{ configured: boolean; last_sync: any | null }> {
    const creds = await this.getCreds(tenantId);
    const row = await withTenant(tenantId, trx => trx.selectFrom('tenant_settings').select('settings')
      .where('tenant_id', '=', tenantId).executeTakeFirst());
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { configured: !!creds, last_sync: settings?.gpswox_status ?? null };
  }
}

export const gpswoxService = new GpswoxService();
