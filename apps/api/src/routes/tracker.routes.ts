import { sql } from 'kysely';
import { parseTrackerPage, trackerPage } from '../services/tracker-pagination.js';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateContainerNumber } from '@hudumika/types';
import { requireTrackerAccess, validateTrackerReferences, containerWriteSchema, lifecycleStages } from '../services/tracker-integrity.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant, dbPlatform } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

function trackingDigest(body: any) {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(['tracking_type','tracking_number','carrier','origin_name','origin_code','dest_name','dest_code','current_location','status','status_code','eta','progress_pct','events','source','provider'].map(k => [k, body[k] ?? null])))).digest('hex');
}
const eventSchema = z.object({ timestamp: z.string().max(100), location: z.string().max(500), description: z.string().max(4000), status_code: z.string().max(100).optional() });
const snapshotSchema = z.object({
 tracking_type: z.enum(['AWB','BL']), tracking_number: z.string().trim().min(1).max(100), source: z.enum(['live','manual']), provider: z.enum(['ship24','shipsgo']).nullable().optional(), proof: z.string().max(4000).optional(), shipment_id: z.string().uuid().nullable().optional(),
 carrier: z.string().max(200).nullable().optional(), origin_name: z.string().max(300).nullable().optional(), origin_code: z.string().max(20).nullable().optional(), dest_name: z.string().max(300).nullable().optional(), dest_code: z.string().max(20).nullable().optional(), current_location: z.string().max(500).nullable().optional(), status: z.string().max(100).nullable().optional(), status_code: z.string().max(100).nullable().optional(), eta: z.string().refine(v => Number.isFinite(Date.parse(v)), 'Invalid tracking date').nullable().optional(), eta_initial: z.string().refine(v => Number.isFinite(Date.parse(v)), 'Invalid tracking date').nullable().optional(),
 events: z.array(eventSchema).max(500).optional(), progress_pct: z.number().min(0).max(100).optional(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackingEvent {
  timestamp: string;
  location: string;
  description: string;
  status_code?: string;
}

export interface Container {
  number: string;
  size: string;    // '20GP', '40HC', '20OT', etc.
  status?: string;
  seal?: string;
}

export interface PortCall {
  port_name: string;
  port_code: string;
  country_code: string;
  is_transshipment: boolean;
  events: {
    code: string;           // EMSH | GTIN | LOAD | DEPA | ARRV | DISC | GTOT | EMRT
    label: string;
    est?: string | null;    // ISO datetime
    act?: string | null;    // ISO datetime, set when actually occurred
  }[];
}

export interface TrackingResult {
  tracking_number: string;
  tracking_type: 'AWB' | 'BL';
  carrier: string;
  origin_name: string;
  origin_code: string;
  dest_name: string;
  dest_code: string;
  current_location: string;
  status: string;
  status_code: string;
  eta: string | null;
  eta_initial: string | null;   // original ETA — diff = delay
  progress_pct: number;
  events: TrackingEvent[];
  // Rich ocean freight fields (ShipsGo)
  vessel_name?: string;
  vessel_imo?: string;
  voyage_number?: string;
  service_name?: string;
  containers?: Container[];
  port_calls?: PortCall[];
  co2_emission?: number;        // kg CO₂
  transit_days?: number;
  source: 'live' | 'mock';
  provider?: 'ship24' | 'shipsgo';
}

// ── Event code labels ─────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  EMSH: 'Empty at Shipper',
  GTIN: 'Gate In',
  LOAD: 'Loaded on Vessel',
  DEPA: 'Vessel Departed',
  ARRV: 'Vessel Arrived',
  DISC: 'Discharged',
  GTOT: 'Gate Out',
  EMRT: 'Empty Return',
};

export async function trackViaShipsGo(number: string, apiKey: string): Promise<TrackingResult | null> {
  const BASE = 'https://api.shipsgo.com/v2';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };

  try {
    // Step 1: register the BL (idempotent — same BL returns same shipment)
    const createRes = await fetch(`${BASE}/ocean/shipments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reference: number, booking_number: number }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!createRes.ok) return null;
    const created = await createRes.json() as any;
    const shipmentId: string = created?.id ?? created?.data?.id;
    if (!shipmentId) return null;

    // Step 2: fetch full tracking detail
    const detailRes = await fetch(`${BASE}/ocean/shipments/${shipmentId}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!detailRes.ok) return null;
    const d = await detailRes.json() as any;
    if (!d || (!d.status && !d.movements?.length && !d.containers?.length)) return null;

    // ── Map ShipsGo response ──────────────────────────────────────────────
    const originPort  = d.port_of_loading ?? {};
    const destPort    = d.port_of_discharge ?? {};
    const vessel      = d.vessel ?? {};

    // Build port calls from movements array
    // ShipsGo groups by port; we re-group
    const movementsByPort = new Map<string, PortCall>();
    for (const mv of (d.movements ?? [])) {
      const code = mv.location?.code ?? mv.port_code ?? 'UNK';
      if (!movementsByPort.has(code)) {
        movementsByPort.set(code, {
          port_name: mv.location?.name ?? code,
          port_code: code,
          country_code: mv.location?.country_code ?? '',
          is_transshipment: mv.is_transshipment ?? false,
          events: [],
        });
      }
      const evCode: string = mv.event_code ?? mv.status_code ?? '';
      movementsByPort.get(code)!.events.push({
        code: evCode,
        label: EVENT_LABELS[evCode] ?? evCode,
        est: mv.estimated_timestamp ?? mv.est ?? null,
        act: mv.actual_timestamp   ?? mv.act ?? null,
      });
    }
    const port_calls = Array.from(movementsByPort.values());

    // Containers
    const containers: Container[] = (d.containers ?? []).map((c: any) => ({
      number: c.container_number ?? c.number,
      size:   c.iso_code ?? c.size ?? '—',
      status: c.status,
      seal:   c.seal_number ?? undefined,
    }));

    // Flat events (actual ones, descending)
    const events: TrackingEvent[] = port_calls
      .flatMap(pc => pc.events
        .filter(e => e.act && Number.isFinite(Date.parse(e.act)))
        .map(e => ({
          timestamp: e.act!,
          location: `${pc.port_name} (${pc.country_code})`,
          description: e.label,
          status_code: e.code === 'DEPA' ? 'DEPARTED'
            : e.code === 'ARRV' ? 'ARRIVED'
            : e.code === 'DISC' ? 'DISCHARGED'
            : e.code === 'GTOT' ? 'GATE_OUT'
            : e.code === 'EMRT' ? 'EMPTY_RETURNED'
            : 'IN_TRANSIT',
        }))
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Current location: last port with an actual event
    const lastActualPort = [...port_calls].reverse().find(pc => pc.events.some(e => e.act));
    const currentLocation = lastActualPort?.port_name ?? originPort.name ?? 'Unknown';

    // Progress
    const totalEvts = port_calls.reduce((s, pc) => s + pc.events.length, 0);
    const doneEvts  = port_calls.reduce((s, pc) => s + pc.events.filter(e => e.act && Number.isFinite(Date.parse(e.act))).length, 0);
    const progress_pct = totalEvts > 0 ? Math.round((doneEvts / totalEvts) * 100) : 0;

    // Status
    const lastEvt = events[0];
    const isDelivered = d.status === 'Delivered';

    return {
      tracking_number: number,
      tracking_type: 'BL',
      carrier: d.carrier?.name ?? d.shipping_line ?? 'Unknown',
      origin_name: originPort.name ?? 'Origin',
      origin_code: originPort.code ?? '',
      dest_name:   destPort.name ?? 'Destination',
      dest_code:   destPort.code ?? '',
      current_location: currentLocation,
      status:      isDelivered ? 'Delivered' : (lastEvt?.description ?? d.status ?? 'Unknown'),
      status_code: isDelivered ? 'DELIVERED' : lastEvt?.status_code ?? 'UNKNOWN',
      eta:         d.date_of_discharge ?? null,
      eta_initial: d.date_of_discharge_initial ?? d.date_of_discharge ?? null,
      progress_pct,
      events,
      vessel_name: vessel.name,
      vessel_imo:  vessel.imo,
      voyage_number: d.voyage_number ?? d.voyage,
      service_name:  d.service_name ?? d.service_code,
      containers,
      port_calls,
      co2_emission:  d.co2_emission,
      transit_days:  d.transit_time,
      source: 'live',
      provider: 'shipsgo',
    };
  } catch {
    return null;
  }
}

// ── Ship24 integration ────────────────────────────────────────────────────────

export async function trackViaShip24(number: string, apiKey: string): Promise<TrackingResult | null> {
  try {
    const res = await fetch('https://api.ship24.com/public/v1/trackers/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${apiKey}` },
      body: JSON.stringify({ trackingNumber: number }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const tracker = data?.data?.trackings?.[0];
    if (!tracker) return null;

    const shipment = tracker.shipment ?? {};
    const delivery = shipment.delivery ?? {};
    const isDelivered = !!delivery.actualDeliveryDate;

    const events: TrackingEvent[] = (tracker.events ?? []).filter((e: any) => e.occurrenceDatetime && Number.isFinite(Date.parse(e.occurrenceDatetime))).map((e: any) => ({
      timestamp:   e.occurrenceDatetime,
      location:    [e.location?.name, e.location?.countryCode].filter(Boolean).join(', '),
      description: e.status ?? '',
      status_code: e.statusCode,
    }));

    events.sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp));
    const latest = events[0];
    if (!latest && !delivery.actualDeliveryDate && !delivery.estimatedDeliveryDate) return null;
    return {
      tracking_number: number,
      tracking_type:   /^\d{3}-?\d{8}$/.test(number) ? 'AWB' : 'BL',
      carrier:    tracker.tracker?.courierCode ?? 'Unknown',
      origin_name: shipment.originAddress?.addressLocality ?? 'Origin',
      origin_code: shipment.originAddress?.countryCode ?? '',
      dest_name:   shipment.destinationAddress?.addressLocality ?? 'Destination',
      dest_code:   shipment.destinationAddress?.countryCode ?? '',
      current_location: latest?.location ?? 'Unknown',
      status:      isDelivered ? 'Delivered' : (latest?.description ?? 'Unknown'),
      status_code: isDelivered ? 'DELIVERED' : latest?.status_code ?? 'UNKNOWN',
      eta:         delivery.estimatedDeliveryDate ?? null,
      eta_initial: delivery.estimatedDeliveryDate ?? null,
      progress_pct: isDelivered ? 100 : 0,
      events,
      source: 'live',
      provider: 'ship24',
    };
  } catch {
    return null;
  }
}

// ── Auth-required routes ──────────────────────────────────────────────────────

export async function trackerRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('cargotracker'));
  // Production-readiness audit HUD-0024/0031: GET /snapshots lists every
  // tracked AWB/BL in the tenant with no customer_id scoping (unlike
  // shipments.routes.ts's correct model) and no role check — a CUSTOMER
  // would see every other customer's shipment-tracking data, not just
  // their own.
  fastify.addHook('preHandler', requireTrackerAccess);
  fastify.addHook('preHandler', async req => { const params = req.params as any; if (params?.id) z.string().uuid().parse(params.id); if(params?.shipmentId) z.string().uuid().parse(params.shipmentId); });
  fastify.addHook('preHandler', async (req) => {
    if (req.body && typeof req.body === 'object') await withTenant((req as any).user.tenant_id, trx => validateTrackerReferences(trx, (req as any).user.tenant_id, req.body));
  });

  // POST /v1/tracker/track
  fastify.post('/track', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { number, type } = z.object({ number: z.string().trim().min(1).max(100), type: z.enum(['AWB', 'BL']).optional() }).parse(req.body);
    if (!number?.trim()) return reply.code(400).send({ error: 'Tracking number is required' });

    const normalized = number.trim().toUpperCase().replace(/\s/g, '');
    const resolvedType: 'AWB' | 'BL' = type ?? (/^\d{3}-?\d{8}$/.test(normalized) ? 'AWB' : 'BL');

    let shipsgoKey: string | null = null;
    let ship24Key:  string | null = null;
    try {
      const setting = await withTenant(user.tenant_id, trx => trx
        .selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst());
      if (setting) {
        const s = typeof setting.settings === 'string' ? JSON.parse(setting.settings) : setting.settings;
        shipsgoKey = s?.['int-shipsgo']?.shipsgo_api_key ?? null;
        ship24Key  = s?.['int-shipsgo']?.ship24_api_key  ?? null;
      }
    } catch { return reply.code(503).send({ error: 'Tracking configuration could not be loaded' }); }

    let result: TrackingResult | null = null;

    // ShipsGo handles BL/container tracking best
    if (shipsgoKey && resolvedType === 'BL') {
      result = await trackViaShipsGo(normalized, shipsgoKey);
    }
    // Ship24 handles AWB and BL fallback
    if (!result && ship24Key) {
      result = await trackViaShip24(normalized, ship24Key);
    }
    // Provider failure must not become an operational tracking result.
    if (!result) {
      return reply.code(503).send({ error: shipsgoKey || ship24Key ? 'Tracking provider unavailable or shipment not found. No tracking result was saved.' : 'Configure a tracking provider before tracking shipments.' });
    }

    const expires = Date.now() + 15 * 60000;
    const signature = createHmac('sha256', env.JWT_SECRET).update(`tracking-result:${user.tenant_id}:${expires}:${trackingDigest(result)}`).digest('hex');
    return { ...result, proof: `${expires}.${signature}` };
  });

  function verifyLiveProof(body: any, tenantId: string) {
    if (body.source !== 'live') return;
    try {
      const [expires, signature] = z.string().regex(/^\d+\.[0-9a-f]{64}$/).parse(body.proof).split('.');
      if (!/^\d+$/.test(expires) || !/^[0-9a-f]{64}$/.test(signature) || Number(expires) < Date.now() || Number(expires) > Date.now() + 15 * 60000) throw new Error();
      const expected = createHmac('sha256', env.JWT_SECRET).update(`tracking-result:${tenantId}:${expires}:${trackingDigest(body)}`).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature,'hex'))) throw new Error();
      return new Date(Number(expires) - 15 * 60000);
    } catch { throw Object.assign(new Error('Live tracking data must match a recent provider result'), { statusCode: 400 }); }
  }

  // POST /v1/tracker/snapshots
  fastify.post('/snapshots', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const body = snapshotSchema.parse(req.body);
    const fetchedAt = verifyLiveProof(body, user.tenant_id);
    return withTenant(user.tenant_id, async (trx) => {
      const snap = await trx.insertInto('tracking_snapshots').values({
        tenant_id:        user.tenant_id,
        shipment_id:      body.shipment_id ?? null,
        tracking_type:    body.tracking_type,
        tracking_number:  body.tracking_number,
        carrier:          body.carrier ?? null,
        origin_name:      body.origin_name ?? null,
        origin_code:      body.origin_code ?? null,
        dest_name:        body.dest_name ?? null,
        dest_code:        body.dest_code ?? null,
        current_location: body.current_location ?? null,
        status:           body.status ?? null,
        status_code:      body.status_code ?? null,
        eta:              body.eta ? new Date(body.eta) : null,
        eta_initial:      body.eta_initial || body.eta ? new Date((body.eta_initial || body.eta)!) : null,
        progress_pct:     body.progress_pct ?? 0,
        events:           JSON.stringify(body.events ?? []),
        source: body.source, provider: body.provider ?? null, fetched_at: fetchedAt ?? null,
        share_expires_at: new Date(Date.now() + 7 * 86400000),
        created_by:       user.sub,
      }).returningAll().executeTakeFirst();
      return reply.code(201).send(snap);
    });
  });

  // GET /v1/tracker/snapshots
  fastify.get('/snapshots', async req => {
    return withTenant(req.user.tenant_id, trx => trackerPage(trx,req.user.tenant_id,
      trx.selectFrom('tracking_snapshots').selectAll().where('tenant_id','=',req.user.tenant_id),
      'tracking_snapshots','created_at','desc',parseTrackerPage(req.query)));
  });

  // GET /v1/tracker/snapshots/by-shipment/:shipmentId
  fastify.get('/snapshots/by-shipment/:shipmentId', async (req: FastifyRequest) => {
    const user = (req as any).user;
    const { shipmentId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('tracking_snapshots').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('shipment_id', '=', shipmentId)
        .orderBy('created_at', 'desc').limit(5).execute()
    );
  });

  // PATCH /v1/tracker/snapshots/:id — edit a tracked BL/AWB entry
  fastify.patch('/snapshots/:id', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const body = snapshotSchema.partial().parse(req.body);
    const fetchedAt = verifyLiveProof(body, user.tenant_id);
    const patch: Record<string, any> = { updated_at: new Date(), source: body.source ?? 'manual', provider: body.provider ?? null };
    for (const key of ['tracking_number', 'tracking_type', 'carrier', 'shipment_id', 'origin_name','origin_code','dest_name','dest_code','status', 'status_code', 'current_location', 'eta', 'progress_pct', 'source', 'provider'] as const) {
      if (key in body) patch[key] = body[key] ?? null;
    }
    if ('eta' in body) patch.eta = body.eta ? new Date(body.eta) : null;
    if ('events' in body) patch.events = JSON.stringify(z.array(eventSchema).max(500).parse(body.events));
    if ('source' in body) patch.source = z.enum(['live', 'manual']).parse(body.source);
    if (body.source === 'live') patch.fetched_at = fetchedAt;
    if ('progress_pct' in body) z.number().min(0).max(100).parse(body.progress_pct);
    if (patch.tracking_number) patch.tracking_number = String(patch.tracking_number).trim().toUpperCase().replace(/\s/g, '');
    const updated = await withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('tracking_snapshots').select(['id','source','fetched_at']).where('tenant_id','=',user.tenant_id).where('id','=',id).forUpdate().executeTakeFirst();
      if (!existing) return undefined;
      if (fetchedAt && existing.fetched_at && fetchedAt < new Date(existing.fetched_at)) throw Object.assign(new Error('A newer provider result is already saved'), { statusCode: 409 });
      if (body.source === 'live' && existing.source !== 'live') patch.eta_initial = body.eta_initial || body.eta ? new Date((body.eta_initial || body.eta)!) : null;
      return trx.updateTable('tracking_snapshots').set(patch).where('id','=',id).where('tenant_id','=',user.tenant_id).returningAll().executeTakeFirst();
    });
    if (!updated) return reply.code(404).send({ error: 'Snapshot not found' });
    return updated;
  });

  // PATCH /v1/tracker/snapshots/:id/link
  fastify.patch('/snapshots/:id/link', async (req: FastifyRequest) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const { shipment_id } = z.object({shipment_id:z.string().uuid().nullable()}).parse(req.body);
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('tracking_snapshots')
        .set({ shipment_id: shipment_id ?? null, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst()
    );
  });

  fastify.post('/snapshots/:id/share', async (req, reply) => {
    const { revoke } = z.object({ revoke: z.boolean().default(false) }).parse(req.body ?? {});
    const row = await withTenant(req.user.tenant_id, async trx => {
      const row = await trx.updateTable('tracking_snapshots')
        .set({ share_revoked: revoke, share_token: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''), share_expires_at: new Date(Date.now() + 7 * 86400000) })
        .where('tenant_id', '=', req.user.tenant_id).where('id', '=', z.string().uuid().parse((req.params as any).id)).returning(['share_token','share_expires_at','share_revoked']).executeTakeFirst();
      if (row) await trx.insertInto('platform_activity_log').values({ tenant_id: req.user.tenant_id, actor_user_id: req.user.sub, actor_name: req.user.name, action: revoke ? 'safetracker.share_revoked' : 'safetracker.share_rotated', category: 'system', target_type: 'tracking_snapshot', target_id: (req.params as any).id, target_name: null, metadata: JSON.stringify({ expires_at: row.share_expires_at }) }).execute();
      return row;
    });
    if (!row) return reply.code(404).send({ error: 'Snapshot not found' });
    return row;
  });

  // DELETE /v1/tracker/snapshots/:id
  fastify.delete('/snapshots/:id', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('tracking_snapshots')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Container Intelligence, Carrier Color & Lifecycle API ─────────────────

  // GET /v1/tracker/containers/:number
  fastify.get('/containers/:number', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { number } = req.params as any;
    const contNum = String(number).trim().toUpperCase().replace(/\s/g, '');

    // Fetch the main container row (with customer join)
    const row = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('tracked_containers as tc')
        .leftJoin('customers as c', 'c.id', 'tc.customer_id')
        .select([
          'tc.id', 'tc.container_number', 'tc.iso_code', 'tc.size_type',
          'tc.ownership', 'tc.condition', 'tc.carrier_name', 'tc.carrier_code',
          'tc.color_hex', 'tc.lifecycle_stage', 'tc.shipment_id', 'tc.customer_id',
          'tc.dimensions', 'tc.compliance', 'tc.current_depot', 'tc.notes', 'tc.cargo_breakdown', 'tc.classification',
          'tc.created_at', 'tc.updated_at',
          'c.name as customer_name', 'c.email as customer_email',
        ])
        .where('tc.tenant_id', '=', user.tenant_id)
        .where('tc.container_number', '=', contNum)
        .executeTakeFirst()
    );
    if (!row) return reply.code(404).send({ error: 'Container not found' });

    // If no DB record exists, skip sub-table queries
    const containerId = row?.id;
    const [surveys, repairs, history] = containerId
      ? await Promise.all([
          withTenant(user.tenant_id, (trx) =>
            trx.selectFrom('container_survey_reports')
              .selectAll()
              .where('tenant_id', '=', user.tenant_id)
              .where('container_id', '=', containerId)
              .orderBy('survey_date', 'desc')
              .limit(5)
              .execute()
          ).catch(() => [] as any[]),
          withTenant(user.tenant_id, (trx) =>
            trx.selectFrom('container_repairs')
              .selectAll()
              .where('tenant_id', '=', user.tenant_id)
              .where('container_id', '=', containerId)
              .orderBy('repair_date', 'desc')
              .execute()
          ).catch(() => [] as any[]),
          withTenant(user.tenant_id, (trx) =>
            trx.selectFrom('container_stage_history as csh')
              .leftJoin('users as u', 'u.id', 'csh.recorded_by')
              .select([
                'csh.id', 'csh.stage', 'csh.location', 'csh.notes', 'csh.recorded_at',
                'u.name as actor_name', 'u.email as actor_email',
              ])
              .where('csh.tenant_id', '=', user.tenant_id)
              .where('csh.container_id', '=', containerId)
              .orderBy('csh.recorded_at', 'desc')
              .limit(50)
              .execute()
          ).catch(() => [] as any[]),
        ])
      : [[] as any[], [] as any[], [] as any[]];

    const result = {
      ...row, db_id: row.id, carrier: row.carrier_name,
      cargo_breakdown: Array.isArray(row.cargo_breakdown) ? row.cargo_breakdown : [],
      ...row.dimensions,
      status: row.lifecycle_stage,
      voyage: {},
      location_info: row.current_depot,
      cargo_worthy: {
        grade: surveys[0]?.grade ?? null,
        last_survey_date: surveys[0]?.survey_date ?? null,
        surveyor_name: surveys[0]?.surveyor_name ?? null,
        survey_notes: surveys[0]?.surveyor_notes ?? null,
        inspection_photos: surveys[0]?.photos ?? [],
        repair_history: repairs,
      },
      survey_report: {
        grade: surveys[0]?.grade ?? '', rating_label: surveys[0]?.rating_label ?? '',
        last_survey_date: surveys[0]?.survey_date ?? '', surveyor_notes: surveys[0]?.surveyor_notes ?? '',
        photos: surveys[0]?.photos ?? [],
        repairs: repairs.map(r => ({ id: r.id, title: r.description, date: r.repair_date, completed: r.resolved, type: r.repair_type })),
      },
      stage_history: history.map(h => ({ stage: h.stage, label: h.stage.replace(/_/g, ' '), timestamp: h.recorded_at, location: h.location, actor: h.actor_name, notes: h.notes })),
    };

    return reply.send(result);
  });

  // POST /v1/tracker/containers — Record or update container specifications (upsert)
  fastify.post('/containers', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const body = containerWriteSchema.parse(req.body);
    if (!body?.container_number) {
      return reply.code(400).send({ error: 'Container number is required' });
    }

    const contNum = String(body.container_number).trim().toUpperCase().replace(/\s/g, '');


    const row = await withTenant(user.tenant_id, async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${`container:${user.tenant_id}:${contNum}`},0))`.execute(trx);
      // Check for existing record
      const existing = await trx.selectFrom('tracked_containers')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('container_number', '=', contNum)
        .forUpdate().executeTakeFirst();

      if (body.lifecycle_stage && body.lifecycle_stage !== (existing?.lifecycle_stage ?? 'AVAILABLE_AT_DEPOT')) throw Object.assign(new Error('Use a movement evidence record to change lifecycle stage'), { statusCode: 409 });

      const payload: any = {
        tenant_id: user.tenant_id,
        container_number: contNum,
        iso_code: body.iso_code ?? existing?.iso_code ?? '',
        size_type: body.size_type ?? existing?.size_type ?? '',
        ownership: body.ownership ?? existing?.ownership ?? '',
        condition: body.condition ?? existing?.condition ?? 'UNKNOWN',
        carrier_name: body.carrier ?? body.carrier_name ?? existing?.carrier_name ?? null,
        carrier_code: body.carrier_code ?? existing?.carrier_code ?? null,
        color_hex: body.color_hex ?? existing?.color_hex ?? null,
        lifecycle_stage: existing?.lifecycle_stage ?? 'AVAILABLE_AT_DEPOT',
        shipment_id: 'shipment_id' in body ? body.shipment_id : existing?.shipment_id ?? null,
        customer_id: 'customer_id' in body ? body.customer_id : existing?.customer_id ?? null,
        dimensions: { ...(existing?.dimensions ?? {}), ...(body.dimensions ?? {}), ...Object.fromEntries(['tare_weight_kg','max_gross_weight_kg','payload_capacity_kg','cubic_capacity_cbm','floor_type','manufacture_year','manufacturer','design_validity_years'].filter(k => k in body).map(k => [k, (body as any)[k]])) },
        compliance: body.compliance ?? existing?.compliance ?? {},
        current_depot: body.current_depot ?? existing?.current_depot ?? {},
        cargo_breakdown: JSON.stringify(body.cargo_breakdown ?? existing?.cargo_breakdown ?? []),
        classification: body.classification ?? existing?.classification ?? {},
        notes: 'notes' in body ? body.notes : existing?.notes ?? null,
        updated_at: new Date(),
        updated_by: user.sub,
      };

      if (existing) {
        return trx.updateTable('tracked_containers')
          .set(payload)
          .where('id', '=', existing.id).where('tenant_id', '=', user.tenant_id)
          .returningAll()
          .executeTakeFirst();
      } else {
        return trx.insertInto('tracked_containers')
          .values(payload)
          .returningAll()
          .executeTakeFirst();
      }
    });

    return reply.code(201).send(row);
  });

  // PATCH /v1/tracker/containers/:number — Update fields on an existing container
  fastify.patch('/containers/:number', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { number } = req.params as any;
    const body = containerWriteSchema.partial().parse(req.body);
    const contNum = String(number).trim().toUpperCase().replace(/\s/g, '');

    const row = await withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('tracked_containers')
        .select('id')
        .where('tenant_id', '=', user.tenant_id)
        .where('container_number', '=', contNum)
        .executeTakeFirst();

      if (!existing) return null;

      const patch: any = { updated_at: new Date(), updated_by: user.sub };
      if (body.lifecycle_stage !== undefined) throw Object.assign(new Error('Use the lifecycle transition action'), { statusCode: 400 });
      if (body.carrier !== undefined) patch.carrier_name = body.carrier;
      const weights = Object.fromEntries(['tare_weight_kg','max_gross_weight_kg','payload_capacity_kg','cubic_capacity_cbm','floor_type','manufacture_year','manufacturer','design_validity_years'].filter(k => k in body).map(k => [k,(body as any)[k]]));
      if (Object.keys(weights).length) {
        const specs = await trx.selectFrom('tracked_containers').select('dimensions').where('id','=',existing.id).where('tenant_id','=',user.tenant_id).executeTakeFirstOrThrow();
        patch.dimensions = { ...specs.dimensions, ...(body.dimensions ?? {}), ...weights };
      }
      const allowed = ['iso_code', 'size_type', 'ownership', 'condition', 'carrier_name', 'carrier_code',
        'color_hex', 'shipment_id', 'customer_id', 'dimensions', 'compliance',
        'current_depot', 'cargo_breakdown', 'classification', 'notes'];
      for (const k of allowed) {
        if (k === 'dimensions' && patch.dimensions) continue;
        if (k === 'carrier_name' && body.carrier !== undefined) continue;
        if ((body as any)[k] !== undefined) patch[k] = k === 'cargo_breakdown' ? JSON.stringify((body as any)[k]) : (body as any)[k];
      }

      return trx.updateTable('tracked_containers')
        .set(patch)
        .where('id', '=', existing.id).where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();
    });

    if (!row) return reply.code(404).send({ error: 'Container not found' });
    return reply.send(row);
  });

  // PATCH /v1/tracker/containers/:number/stage — Advance lifecycle stage
  fastify.patch('/containers/:number/stage', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { number } = req.params as any;
    const { stage, notes, location } = z.object({ stage: z.enum(lifecycleStages), notes: z.string().trim().min(1).max(4000), location: z.string().trim().min(1).max(300) }).parse(req.body);
    const contNum = String(number).trim().toUpperCase().replace(/\s/g, '');
    const result = await withTenant(user.tenant_id, async (trx) => {
      const tc = await trx.selectFrom('tracked_containers').select(['id', 'lifecycle_stage'])
        .where('tenant_id', '=', user.tenant_id).where('container_number', '=', contNum).forUpdate().executeTakeFirst();
      if (!tc) throw Object.assign(new Error('Container not found'), { statusCode: 404 });
      if (tc.lifecycle_stage === stage) return { container_number: contNum, lifecycle_stage: stage };
      const previous = lifecycleStages.indexOf(tc.lifecycle_stage as any);
      if (lifecycleStages.indexOf(stage) !== previous + 1) throw Object.assign(new Error('Only the next lifecycle stage may be recorded'), { statusCode: 409 });
      await trx.updateTable('tracked_containers').set({ lifecycle_stage: stage, updated_at: new Date(), updated_by: user.sub })
        .where('id', '=', tc.id).where('tenant_id', '=', user.tenant_id).execute();
      await trx.insertInto('container_stage_history')
        .values({
          tenant_id: user.tenant_id,
          container_id: tc.id,
          stage,
          location: location || 'Container Depot',
          notes: notes || `Container lifecycle transitioned to ${stage}`,
          recorded_by: user.sub,
        })
        .execute();

      return { container_number: contNum, lifecycle_stage: stage };
    });

    return reply.send(result);
  });

  // PATCH /v1/tracker/containers/:number/link — Link to shipment and/or customer
  fastify.patch('/containers/:number/link', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { number } = req.params as any;
    const { shipment_id, customer_id } = req.body as any;
    const contNum = String(number).trim().toUpperCase().replace(/\s/g, '');

    const row = await withTenant(user.tenant_id, async (trx) => {
      const tc = await trx.selectFrom('tracked_containers')
        .select('id')
        .where('tenant_id', '=', user.tenant_id)
        .where('container_number', '=', contNum)
        .executeTakeFirst();

      if (!tc) return null;

      const patch: any = { updated_at: new Date(), updated_by: user.sub };
      if (shipment_id !== undefined) patch.shipment_id = shipment_id || null;
      if (customer_id !== undefined) patch.customer_id = customer_id || null;

      return trx.updateTable('tracked_containers')
        .set(patch)
        .where('id', '=', tc.id).where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();
    });

    if (!row) return reply.code(404).send({ error: 'Container not found' });
    return reply.send(row);
  });

  fastify.post('/containers/:number/surveys', async (req, reply) => {
    const body = z.object({ grade: z.string().trim().min(1).max(100), rating_label: z.string().max(200).nullable().optional(), survey_date: z.string().date(), surveyor_name: z.string().trim().min(1).max(200), surveyor_notes: z.string().trim().min(1).max(10000), photos: z.array(z.string().url().refine(v => /^https?:/.test(v))).max(30).default([]) }).parse(req.body);
    return withTenant(req.user.tenant_id, async trx => {
      const tc = await trx.selectFrom('tracked_containers').select('id').where('tenant_id','=',req.user.tenant_id).where('container_number','=',(req.params as any).number).executeTakeFirst();
      if (!tc) return reply.code(404).send({ error: 'Container not found' });
      const row = await trx.insertInto('container_survey_reports').values({ ...body, survey_date: new Date(body.survey_date), photos: JSON.stringify(body.photos) as any, tenant_id: req.user.tenant_id, container_id: tc.id }).returningAll().executeTakeFirstOrThrow();
      return reply.code(201).send(row);
    });
  });
  fastify.post('/containers/:number/repairs', async (req, reply) => {
    const body = z.object({ description: z.string().trim().min(1).max(4000), repair_type: z.enum(['cosmetic','paint','scratch','weld','seal','floor']), repair_date: z.string().datetime().optional() }).parse(req.body);
    return withTenant(req.user.tenant_id, async trx => {
      const tc = await trx.selectFrom('tracked_containers').select('id').where('tenant_id','=',req.user.tenant_id).where('container_number','=',(req.params as any).number).executeTakeFirst();
      if (!tc) return reply.code(404).send({ error: 'Container not found' });
      const row = await trx.insertInto('container_repairs').values({ ...body, repair_date: body.repair_date ? new Date(body.repair_date) : new Date(), tenant_id: req.user.tenant_id, container_id: tc.id }).returningAll().executeTakeFirstOrThrow();
      return reply.code(201).send(row);
    });
  });
  fastify.patch('/containers/:number/repairs/:id', async (req, reply) => {
    const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
    return withTenant(req.user.tenant_id, async trx => {
      const tc = await trx.selectFrom('tracked_containers').select('id').where('tenant_id','=',req.user.tenant_id).where('container_number','=',(req.params as any).number).executeTakeFirst();
      if (!tc) return reply.code(404).send({ error: 'Container not found' });
      const row = await trx.updateTable('container_repairs').set({ resolved, resolved_at: resolved ? new Date() : null }).where('tenant_id','=',req.user.tenant_id).where('container_id','=',tc.id).where('id','=',(req.params as any).id).returningAll().executeTakeFirst();
      if (!row) return reply.code(404).send({ error: 'Repair not found' });
      return row;
    });
  });

  // GET /v1/tracker/containers — List containers for this tenant
  fastify.get('/containers', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;

    const page = parseTrackerPage(req.query);
    const rows = await withTenant(user.tenant_id, (trx) =>
      trackerPage(trx,user.tenant_id,trx.selectFrom('tracked_containers')
        .leftJoin('customers as c', 'c.id', 'tracked_containers.customer_id')
        .select([
          'tracked_containers.id', 'tracked_containers.container_number', 'tracked_containers.iso_code', 'tracked_containers.size_type',
          'tracked_containers.carrier_name', 'tracked_containers.carrier_code', 'tracked_containers.color_hex',
          'tracked_containers.lifecycle_stage', 'tracked_containers.shipment_id', 'tracked_containers.customer_id',
          'tracked_containers.updated_at', 'c.name as customer_name',
        ])
        .where('tracked_containers.tenant_id', '=', user.tenant_id)
        ,'tracked_containers','updated_at','desc',page)
    );

    return reply.send(rows);
  });
}

// ── Public shared snapshot (no auth) ─────────────────────────────────────────

export async function trackerPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/shared/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply) => {
    const { token } = z.object({token:z.string().regex(/^[0-9a-f]{64}$/)}).parse(req.params);
    reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer');
    // Public, unauthenticated — no tenant is knowable, access control is the
    // unguessable token alone, same reasoning as landed-cost-share.routes.ts.
    const snap = await dbPlatform.selectFrom('tracking_snapshots').selectAll()
      .where('share_token', '=', token).executeTakeFirst();
    if (!snap || snap.share_revoked || !snap.share_expires_at || new Date(snap.share_expires_at).getTime() <= Date.now()) return reply.code(404).send({ error: 'Snapshot not found or expired' });
    return { tracking_type:snap.tracking_type, tracking_number:snap.tracking_number, carrier:snap.carrier, origin_name:snap.origin_name, origin_code:snap.origin_code, dest_name:snap.dest_name, dest_code:snap.dest_code, current_location:snap.current_location, status:snap.status, status_code:snap.status_code, eta:snap.eta, progress_pct:snap.progress_pct, events:snap.events, source:snap.source, provider:snap.provider, fetched_at:snap.fetched_at, created_at:snap.created_at, share_expires_at:snap.share_expires_at };
  });
}
