import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant, dbPlatform } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

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

// ── Mock data (demo / no-api-key mode) ───────────────────────────────────────

export function buildMockResult(number: string, type: 'AWB' | 'BL'): TrackingResult {
  const now = Date.now();
  const day = 86_400_000;

  const awbRoutes = [
    {
      carrier: 'Kenya Airways Cargo',
      origin_name: 'Nairobi', origin_code: 'NBO',
      dest_name: 'Amsterdam', dest_code: 'AMS',
      stops: ['Nairobi NBO', 'Dubai DXB', 'Amsterdam AMS'],
    },
    {
      carrier: 'Ethiopian Airlines Cargo',
      origin_name: 'Addis Ababa', origin_code: 'ADD',
      dest_name: 'London', dest_code: 'LHR',
      stops: ['Addis Ababa ADD', 'Cairo CAI', 'London LHR'],
    },
    {
      carrier: 'Qatar Airways Cargo',
      origin_name: 'Dar es Salaam', origin_code: 'DAR',
      dest_name: 'Frankfurt', dest_code: 'FRA',
      stops: ['Dar es Salaam DAR', 'Doha DOH', 'Frankfurt FRA'],
    },
  ];

  const blRoutes = [
    {
      carrier: 'COSCO Shipping',
      vessel: 'COSCO EUROPE', voyage: '052E',
      service: 'AEX', imo: '9301469',
      origin_name: 'Dar es Salaam', origin_code: 'TZDAR',
      dest_name: 'Rotterdam', dest_code: 'NLRTM',
      containers: [
        { number: 'COSU6234187', size: '40HC' },
        { number: 'COSU4891023', size: '20GP' },
      ] as Container[],
      port_calls: [
        {
          port_name: 'Dar es Salaam', port_code: 'TZDAR', country_code: 'TZ', is_transshipment: false,
          events: [
            { code: 'GTIN', label: 'Gate In',          act: new Date(now - 10 * day).toISOString(), est: null },
            { code: 'LOAD', label: 'Loaded on Vessel', act: new Date(now -  9 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  act: new Date(now -  8 * day).toISOString(), est: null },
          ],
        },
        {
          port_name: 'Mombasa', port_code: 'KEMBA', country_code: 'KE', is_transshipment: true,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',   act: new Date(now -  6 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  act: new Date(now -  5 * day).toISOString(), est: null },
          ],
        },
        {
          port_name: 'Port Said', port_code: 'EGPSD', country_code: 'EG', is_transshipment: true,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',  act:  new Date(now -  2 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  est: new Date(now +  1 * day).toISOString(), act: null },
          ],
        },
        {
          port_name: 'Rotterdam', port_code: 'NLRTM', country_code: 'NL', is_transshipment: false,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',   est: new Date(now +  8 * day).toISOString(), act: null },
            { code: 'DISC', label: 'Discharged',        est: new Date(now +  9 * day).toISOString(), act: null },
            { code: 'GTOT', label: 'Gate Out',          est: new Date(now + 10 * day).toISOString(), act: null },
          ],
        },
      ] as PortCall[],
    },
    {
      carrier: 'MSC',
      vessel: 'MSC ILONA', voyage: '413E',
      service: 'SHOGUN', imo: '9702065',
      origin_name: 'Mombasa', origin_code: 'KEMBA',
      dest_name: 'Hamburg', dest_code: 'DEHAM',
      containers: [{ number: 'MSCU4872319', size: '40HC' }] as Container[],
      port_calls: [
        {
          port_name: 'Mombasa', port_code: 'KEMBA', country_code: 'KE', is_transshipment: false,
          events: [
            { code: 'GTIN', label: 'Gate In',          act: new Date(now - 8 * day).toISOString(), est: null },
            { code: 'LOAD', label: 'Loaded on Vessel', act: new Date(now - 7 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  act: new Date(now - 6 * day).toISOString(), est: null },
          ],
        },
        {
          port_name: 'Djibouti', port_code: 'DJJIB', country_code: 'DJ', is_transshipment: true,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',  act:  new Date(now - 3 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  est: new Date(now + 2 * day).toISOString(), act: null },
          ],
        },
        {
          port_name: 'Hamburg', port_code: 'DEHAM', country_code: 'DE', is_transshipment: false,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',   est: new Date(now + 10 * day).toISOString(), act: null },
            { code: 'DISC', label: 'Discharged',        est: new Date(now + 11 * day).toISOString(), act: null },
          ],
        },
      ] as PortCall[],
    },
    {
      carrier: 'CMA CGM',
      vessel: 'CMA CGM TROCADERO', voyage: '0JXPE1MA',
      service: 'AFRICA 4', imo: '9839237',
      origin_name: 'Durban', origin_code: 'ZADUR',
      dest_name: 'Antwerp', dest_code: 'BEANR',
      containers: [
        { number: 'CMAU3214895', size: '40HC' },
        { number: 'CMAU9876543', size: '40HC' },
        { number: 'CMAU1234567', size: '20GP' },
      ] as Container[],
      port_calls: [
        {
          port_name: 'Durban', port_code: 'ZADUR', country_code: 'ZA', is_transshipment: false,
          events: [
            { code: 'GTIN', label: 'Gate In',          act: new Date(now - 12 * day).toISOString(), est: null },
            { code: 'LOAD', label: 'Loaded on Vessel', act: new Date(now - 11 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  act: new Date(now - 10 * day).toISOString(), est: null },
          ],
        },
        {
          port_name: 'Cape Town', port_code: 'ZACPT', country_code: 'ZA', is_transshipment: true,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',  act:  new Date(now - 7 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  act: new Date(now - 6 * day).toISOString(), est: null },
          ],
        },
        {
          port_name: 'Las Palmas', port_code: 'ESLPA', country_code: 'ES', is_transshipment: true,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',  act:  new Date(now - 1 * day).toISOString(), est: null },
            { code: 'DEPA', label: 'Vessel Departed',  est: new Date(now + 2 * day).toISOString(), act: null },
          ],
        },
        {
          port_name: 'Antwerp', port_code: 'BEANR', country_code: 'BE', is_transshipment: false,
          events: [
            { code: 'ARRV', label: 'Vessel Arrived',   est: new Date(now + 9 * day).toISOString(), act: null },
            { code: 'DISC', label: 'Discharged',        est: new Date(now + 10 * day).toISOString(), act: null },
            { code: 'GTOT', label: 'Gate Out',          est: new Date(now + 12 * day).toISOString(), act: null },
          ],
        },
      ] as PortCall[],
    },
  ];

  if (type === 'AWB') {
    const routes = awbRoutes;
    const hash = number.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const route = routes[hash % routes.length];
    const events: TrackingEvent[] = [
      { timestamp: new Date(now - 10 * day).toISOString(), location: route.stops[0], description: 'Shipment received and processed', status_code: 'PICKED_UP' },
      { timestamp: new Date(now -  9 * day).toISOString(), location: route.stops[0], description: 'Departed origin airport', status_code: 'DEPARTED' },
      { timestamp: new Date(now -  6 * day).toISOString(), location: route.stops[1], description: 'Arrived at transit hub', status_code: 'TRANSIT' },
      { timestamp: new Date(now -  5 * day).toISOString(), location: route.stops[1], description: 'Cleared customs at transit', status_code: 'CUSTOMS_CLEARED' },
      { timestamp: new Date(now -  2 * day).toISOString(), location: route.stops[1], description: 'In transit to final destination', status_code: 'IN_TRANSIT' },
    ];
    return {
      tracking_number: number, tracking_type: 'AWB',
      carrier: route.carrier,
      origin_name: route.origin_name, origin_code: route.origin_code,
      dest_name: route.dest_name, dest_code: route.dest_code,
      current_location: route.stops[route.stops.length - 2] ?? route.stops[1],
      status: 'In Transit', status_code: 'IN_TRANSIT',
      eta: new Date(now + 8 * day).toISOString(), eta_initial: new Date(now + 8 * day).toISOString(),
      progress_pct: 65, events,
      source: 'mock',
    };
  }

  // BL route — hash across full number so different BLs pick different mock routes
  const routes = blRoutes;
  const hash = number.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const route = routes[hash % routes.length];

  // Build flat events from port_calls for the timeline
  const events: TrackingEvent[] = route.port_calls.flatMap(pc =>
    pc.events
      .filter(e => e.act)
      .map(e => ({
        timestamp: e.act!,
        location: `${pc.port_name} (${pc.country_code})`,
        description: e.label,
        status_code: e.code === 'DEPA' ? 'DEPARTED' : e.code === 'ARRV' ? 'ARRIVED' : e.code === 'DISC' ? 'DELIVERED' : 'IN_TRANSIT',
      }))
  ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Find current location (last actual event)
  const latestPortCall = [...route.port_calls].reverse().find(pc => pc.events.some(e => e.act));
  const currentLocation = latestPortCall?.port_name ?? route.origin_name;

  // Progress: ratio of completed port events to total
  const totalEvents = route.port_calls.reduce((s, pc) => s + pc.events.length, 0);
  const doneEvents  = route.port_calls.reduce((s, pc) => s + pc.events.filter(e => e.act).length, 0);
  const progress_pct = Math.round((doneEvents / totalEvents) * 100);

  return {
    tracking_number: number, tracking_type: 'BL',
    carrier: route.carrier,
    origin_name: route.origin_name, origin_code: route.origin_code,
    dest_name: route.dest_name, dest_code: route.dest_code,
    current_location: currentLocation,
    status: 'In Transit', status_code: 'IN_TRANSIT',
    eta: new Date(now + 8 * day).toISOString(),
    eta_initial: new Date(now + 6 * day).toISOString(), // slightly earlier = shows delay
    progress_pct,
    events,
    vessel_name: route.vessel,
    vessel_imo: route.imo,
    voyage_number: route.voyage,
    service_name: route.service,
    containers: route.containers,
    port_calls: route.port_calls,
    co2_emission: Math.round(route.containers.length * 1840 + Math.random() * 200),
    transit_days: 18,
    source: 'mock',
  };
}

// ── ShipsGo integration ───────────────────────────────────────────────────────

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
        .filter(e => e.act)
        .map(e => ({
          timestamp: e.act!,
          location: `${pc.port_name} (${pc.country_code})`,
          description: e.label,
          status_code: e.code === 'DEPA' ? 'DEPARTED'
            : e.code === 'ARRV' ? 'ARRIVED'
            : e.code === 'DISC' ? 'DELIVERED'
            : 'IN_TRANSIT',
        }))
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Current location: last port with an actual event
    const lastActualPort = [...port_calls].reverse().find(pc => pc.events.some(e => e.act));
    const currentLocation = lastActualPort?.port_name ?? originPort.name ?? 'Unknown';

    // Progress
    const totalEvts = port_calls.reduce((s, pc) => s + pc.events.length, 0);
    const doneEvts  = port_calls.reduce((s, pc) => s + pc.events.filter(e => e.act).length, 0);
    const progress_pct = totalEvts > 0 ? Math.round((doneEvts / totalEvts) * 100) : 0;

    // Status
    const lastEvt = events[0];
    const isDelivered = d.status === 'Delivered' || port_calls[port_calls.length - 1]?.events.some(e => e.code === 'GTOT' && e.act);

    return {
      tracking_number: number,
      tracking_type: 'BL',
      carrier: d.carrier?.name ?? d.shipping_line ?? 'Unknown',
      origin_name: originPort.name ?? 'Origin',
      origin_code: originPort.code ?? '',
      dest_name:   destPort.name ?? 'Destination',
      dest_code:   destPort.code ?? '',
      current_location: currentLocation,
      status:      isDelivered ? 'Delivered' : (lastEvt?.description ?? 'In Transit'),
      status_code: isDelivered ? 'DELIVERED' : 'IN_TRANSIT',
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

    const events: TrackingEvent[] = (tracker.events ?? []).map((e: any) => ({
      timestamp:   e.occurrenceDatetime ?? new Date().toISOString(),
      location:    [e.location?.name, e.location?.countryCode].filter(Boolean).join(', '),
      description: e.status ?? '',
      status_code: e.statusCode,
    }));

    const latest = events[0];
    return {
      tracking_number: number,
      tracking_type:   /^\d{3}-?\d{8}$/.test(number) ? 'AWB' : 'BL',
      carrier:    tracker.tracker?.courierCode ?? 'Unknown',
      origin_name: shipment.originAddress?.addressLocality ?? 'Origin',
      origin_code: shipment.originAddress?.countryCode ?? '',
      dest_name:   shipment.destinationAddress?.addressLocality ?? 'Destination',
      dest_code:   shipment.destinationAddress?.countryCode ?? '',
      current_location: latest?.location ?? 'Unknown',
      status:      isDelivered ? 'Delivered' : (latest?.description ?? 'In Transit'),
      status_code: isDelivered ? 'DELIVERED' : 'IN_TRANSIT',
      eta:         delivery.estimatedDeliveryDate ?? null,
      eta_initial: delivery.estimatedDeliveryDate ?? null,
      progress_pct: isDelivered ? 100 : Math.min(85, events.length * 12),
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

  // POST /v1/tracker/track
  fastify.post('/track', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const { number, type } = req.body as { number: string; type?: 'AWB' | 'BL' };
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
    } catch { /* no settings — use mock */ }

    let result: TrackingResult | null = null;

    // ShipsGo handles BL/container tracking best
    if (shipsgoKey && resolvedType === 'BL') {
      result = await trackViaShipsGo(normalized, shipsgoKey);
    }
    // Ship24 handles AWB and BL fallback
    if (!result && ship24Key) {
      result = await trackViaShip24(normalized, ship24Key);
    }
    // Demo fallback
    if (!result) {
      result = buildMockResult(normalized, resolvedType);
    }

    return result;
  });

  // POST /v1/tracker/snapshots
  fastify.post('/snapshots', async (req: FastifyRequest, reply) => {
    const user = (req as any).user;
    const body = req.body as any;
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
        eta:              body.eta ?? null,
        eta_initial:      body.eta_initial ?? body.eta ?? null,
        progress_pct:     body.progress_pct ?? 0,
        events:           JSON.stringify(body.events ?? []),
        created_by:       user.sub,
      }).returningAll().executeTakeFirst();
      return reply.code(201).send(snap);
    });
  });

  // GET /v1/tracker/snapshots
  fastify.get('/snapshots', async (req: FastifyRequest) => {
    const user = (req as any).user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('tracking_snapshots').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').limit(50).execute()
    );
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
    const body = req.body as any;
    const patch: Record<string, any> = { updated_at: new Date() };
    for (const key of ['tracking_number', 'tracking_type', 'carrier', 'shipment_id', 'status', 'current_location', 'eta', 'progress_pct'] as const) {
      if (key in body) patch[key] = body[key] ?? null;
    }
    if (patch.tracking_number) patch.tracking_number = String(patch.tracking_number).trim().toUpperCase().replace(/\s/g, '');
    const updated = await withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('tracking_snapshots')
        .set(patch)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst()
    );
    if (!updated) return reply.code(404).send({ error: 'Snapshot not found' });
    return updated;
  });

  // PATCH /v1/tracker/snapshots/:id/link
  fastify.patch('/snapshots/:id/link', async (req: FastifyRequest) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const { shipment_id } = req.body as any;
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('tracking_snapshots')
        .set({ shipment_id: shipment_id ?? null, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst()
    );
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
}

// ── Public shared snapshot (no auth) ─────────────────────────────────────────

export async function trackerPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/shared/:token', async (req: FastifyRequest, reply) => {
    const { token } = req.params as any;
    // Public, unauthenticated — no tenant is knowable, access control is the
    // unguessable token alone, same reasoning as landed-cost-share.routes.ts.
    const snap = await dbPlatform.selectFrom('tracking_snapshots').selectAll()
      .where('share_token', '=', token).executeTakeFirst();
    if (!snap) return reply.code(404).send({ error: 'Snapshot not found or expired' });
    return snap;
  });
}
