/**
 * Support network — who sees which centres, and where a new ticket goes.
 *
 * Bliss used to be one desk: every agent saw every ticket. With many centres
 * (tenant_sites with support_enabled), grouped into zones (geo_zones), and
 * product lines with their own SLAs (support_products), two questions need one
 * answer each, used everywhere:
 *
 *   supportScope()  which centres this person may see and work in.
 *   routeTicket()   which centre, product, queue and agent a new ticket gets,
 *                   and a plain-language reason recorded on the ticket.
 *
 * Backward compatible by construction: a workspace that has not set up its
 * network (no agent memberships) keeps the old behaviour — everyone sees
 * everything and the existing auto-assign rules still decide assignment.
 */
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import type { TicketPriority, UserRole } from '@hudumika/types';

type Trx = Transaction<Database>;

/** Roles that oversee the whole network regardless of memberships. */
export const NETWORK_ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

export const DEFAULT_SLA_HOURS: Record<TicketPriority, number> = { URGENT: 4, HIGH: 8, NORMAL: 24, MEDIUM: 24, LOW: 48 };

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS'] as const;

export interface SupportScope {
  /** Sees every centre (admins, or a workspace with no network set up). */
  all: boolean;
  /** Centres this person may see, when not `all`. */
  siteIds: string[];
  /** Whether tickets not yet placed in any centre are visible (the shared pool). */
  includeUnplaced: boolean;
  /** Whether this person may change the network itself (zones, centres, queues). */
  canManageNetwork: boolean;
  /** Zones this person manages (zone_manager), with every zone beneath them. */
  managedZoneIds: string[];
}

/** Every zone id under the given ones, the given ones included. */
export async function zoneWithDescendants(trx: Trx, tenantId: string, zoneIds: string[]): Promise<string[]> {
  if (!zoneIds.length) return [];
  const rows = await sql<{ id: string }>`
    WITH RECURSIVE z AS (
      SELECT id FROM geo_zones WHERE tenant_id = ${tenantId} AND id = ANY(${zoneIds}::uuid[])
      UNION
      SELECT g.id FROM geo_zones g JOIN z ON g.parent_id = z.id WHERE g.tenant_id = ${tenantId}
    ) SELECT id FROM z`.execute(trx);
  return rows.rows.map(r => r.id);
}

export async function supportScope(trx: Trx, user: { sub: string; tenant_id: string; role: string }): Promise<SupportScope> {
  const isAdmin = NETWORK_ADMIN_ROLES.includes(user.role as UserRole);
  if (isAdmin) return { all: true, siteIds: [], includeUnplaced: true, canManageNetwork: true, managedZoneIds: [] };

  const anyMembership = await trx.selectFrom('support_agent_memberships').select('id')
    .where('tenant_id', '=', user.tenant_id).limit(1).executeTakeFirst();
  // Network not set up yet: keep the single-desk behaviour.
  if (!anyMembership) {
    return { all: true, siteIds: [], includeUnplaced: true, canManageNetwork: user.role === 'MANAGER', managedZoneIds: [] };
  }

  const mine = await trx.selectFrom('support_agent_memberships')
    .select(['site_id', 'zone_id', 'role'])
    .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();

  const managedZoneIds = await zoneWithDescendants(trx, user.tenant_id,
    mine.filter(m => m.zone_id).map(m => m.zone_id!) );
  const siteIds = new Set(mine.filter(m => m.site_id).map(m => m.site_id!));
  if (managedZoneIds.length) {
    const zoneSites = await trx.selectFrom('tenant_sites').select('id')
      .where('tenant_id', '=', user.tenant_id).where('zone_id', 'in', managedZoneIds).execute();
    zoneSites.forEach(s => siteIds.add(s.id));
  }
  return {
    all: false,
    siteIds: [...siteIds],
    // Anyone in the network can pick up work no centre has claimed yet; a
    // person with no membership at all sees only that pool.
    includeUnplaced: true,
    canManageNetwork: managedZoneIds.length > 0 || user.role === 'MANAGER',
    managedZoneIds,
  };
}

/** Narrow a requested centre/zone filter to what the scope allows. */
export async function resolveSiteFilter(
  trx: Trx, tenantId: string, scope: SupportScope, q: { site_id?: string; zone_id?: string },
): Promise<{ siteIds: string[] | null; includeUnplaced: boolean }> {
  let wanted: string[] | null = null;
  if (q.site_id) wanted = [q.site_id];
  else if (q.zone_id) {
    const zones = await zoneWithDescendants(trx, tenantId, [q.zone_id]);
    const rows = zones.length
      ? await trx.selectFrom('tenant_sites').select('id').where('tenant_id', '=', tenantId).where('zone_id', 'in', zones).execute()
      : [];
    wanted = rows.map(r => r.id);
  }
  if (scope.all) return { siteIds: wanted, includeUnplaced: wanted === null };
  const allowed = new Set(scope.siteIds);
  if (wanted === null) return { siteIds: [...allowed], includeUnplaced: scope.includeUnplaced };
  return { siteIds: wanted.filter(id => allowed.has(id)), includeUnplaced: false };
}

/** May this person see/act on a ticket placed at `siteId` (null = unplaced)? */
export function scopeAllowsSite(scope: SupportScope, siteId: string | null): boolean {
  if (scope.all) return true;
  if (!siteId) return scope.includeUnplaced;
  return scope.siteIds.includes(siteId);
}

// ── Routing ─────────────────────────────────────────────────────────────

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Is the centre open now, in its own timezone? No hours set = always open. */
export function isCentreOpen(site: { timezone: string; opening_hours: Record<string, [string, string]> | null }, now = new Date()): boolean {
  const hours = site.opening_hours;
  if (!hours || !Object.keys(hours).length) return true;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: site.timezone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(now);
  const day = (parts.find(p => p.type === 'weekday')?.value ?? '').toLowerCase().slice(0, 3);
  const hm = `${parts.find(p => p.type === 'hour')?.value ?? '00'}:${parts.find(p => p.type === 'minute')?.value ?? '00'}`.replace(/^24/, '00');
  const today = hours[day];
  if (!today) return false;
  const [open, close] = today;
  return close > open ? hm >= open && hm < close : hm >= open || hm < close; // overnight shifts
}

export interface RouteInput {
  siteId?: string | null;
  productId?: string | null;
  sourceApp?: string | null;
  priority: TicketPriority;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface RouteResult {
  siteId: string | null;
  zoneId: string | null;
  productId: string | null;
  groupId: string | null;
  assignedTo: string | null;
  slaHours: number;
  reason: string;
}

type Site = { id: string; name: string; zone_id: string | null; latitude: number | null; longitude: number | null; timezone: string; opening_hours: Record<string, [string, string]> | null };

/**
 * Decide where a new ticket goes. Pure decision — the caller writes it.
 *
 * 1. Product: as given, else the product that claims the ticket's source app.
 * 2. Centre: as given, else the nearest open support centre to the customer's
 *    location, else none (the ticket waits in the shared pool).
 * 3. Queue: the centre+product queue, else the centre's general queue, else
 *    the product's network-wide queue.
 * 4. Agent: the least-loaded available agent under their capacity, working
 *    that queue (or that centre). Nobody available → per the queue's overflow
 *    setting, try the rest of the zone, then the whole network. Still nobody →
 *    unassigned, waiting in the queue.
 */
export async function routeTicket(trx: Trx, tenantId: string, input: RouteInput): Promise<RouteResult | null> {
  const networkOn = await trx.selectFrom('tenant_sites').select('id')
    .where('tenant_id', '=', tenantId).where('support_enabled', '=', true).limit(1).executeTakeFirst();
  const productsExist = await trx.selectFrom('support_products').select('id')
    .where('tenant_id', '=', tenantId).where('status', '=', 'active').limit(1).executeTakeFirst();
  if (!networkOn && !productsExist && !input.siteId && !input.productId) return null; // single desk: old behaviour

  const why: string[] = [];

  // 1. Product
  let product: { id: string; name: string; sla_hours: Record<string, number> } | undefined;
  if (input.productId) {
    product = await trx.selectFrom('support_products').select(['id', 'name', 'sla_hours'])
      .where('tenant_id', '=', tenantId).where('id', '=', input.productId).executeTakeFirst() as any;
    if (product) why.push(`product ${product.name}`);
  } else if (input.sourceApp) {
    product = await trx.selectFrom('support_products').select(['id', 'name', 'sla_hours'])
      .where('tenant_id', '=', tenantId).where('status', '=', 'active')
      .where(sql<boolean>`${input.sourceApp} = ANY(source_apps)`).orderBy('created_at').executeTakeFirst() as any;
    if (product) why.push(`product ${product.name} (raised from ${input.sourceApp})`);
  }
  const productSla = Number((product?.sla_hours as any)?.[input.priority]);
  const slaHours = Number.isFinite(productSla) && productSla > 0 ? productSla : DEFAULT_SLA_HOURS[input.priority];

  // 2. Centre
  const centres = await trx.selectFrom('tenant_sites')
    .select(['id', 'name', 'zone_id', 'latitude', 'longitude', 'timezone', 'opening_hours'])
    .where('tenant_id', '=', tenantId).where('support_enabled', '=', true).where('status', '=', 'active')
    .execute() as unknown as Site[];
  let site: Site | undefined;
  if (input.siteId) {
    site = centres.find(c => c.id === input.siteId)
      ?? (await trx.selectFrom('tenant_sites').select(['id', 'name', 'zone_id', 'latitude', 'longitude', 'timezone', 'opening_hours'])
        .where('tenant_id', '=', tenantId).where('id', '=', input.siteId).executeTakeFirst() as unknown as Site | undefined);
    if (site) why.push(`centre ${site.name} (chosen)`);
  } else if (input.lat != null && input.lng != null) {
    const ranked = centres
      .filter(c => c.latitude != null && c.longitude != null)
      .map(c => ({ c, km: haversineKm(Number(input.lat), Number(input.lng), Number(c.latitude), Number(c.longitude)) }))
      .sort((a, b) => a.km - b.km);
    const open = ranked.find(r => isCentreOpen(r.c));
    const pick = open ?? ranked[0];
    if (pick) {
      site = pick.c;
      why.push(`${open ? 'nearest open' : 'nearest'} centre ${site.name} (${pick.km.toFixed(1)} km)`);
    }
  }
  if (!site) why.push('no centre yet — waiting in the shared pool');

  // 3. Queue
  const queues = await trx.selectFrom('support_groups').select(['id', 'name', 'site_id', 'product_id', 'overflow'])
    .where('tenant_id', '=', tenantId).execute();
  const queue =
    (site && product && queues.find(q => q.site_id === site!.id && q.product_id === product!.id)) ||
    (site && queues.find(q => q.site_id === site!.id && !q.product_id)) ||
    (product && queues.find(q => !q.site_id && q.product_id === product!.id)) ||
    undefined;
  if (queue) why.push(`queue ${queue.name}`);

  // 4. Agent
  const pickAgent = async (siteIds: string[] | null, queueId: string | null): Promise<string | null> => {
    let candidates: { user_id: string; max_open: number }[] = [];
    if (queueId) {
      candidates = await trx.selectFrom('support_group_members as gm')
        .leftJoin('support_agent_memberships as m', (j) => j.onRef('m.user_id', '=', 'gm.user_id').on('m.tenant_id', '=', tenantId))
        .select(['gm.user_id as user_id', sql<number>`coalesce(min(m.max_open), 15)`.as('max_open')])
        .where('gm.tenant_id', '=', tenantId).where('gm.group_id', '=', queueId)
        .groupBy('gm.user_id').execute();
    } else if (siteIds?.length) {
      candidates = await trx.selectFrom('support_agent_memberships')
        .select(['user_id', sql<number>`min(max_open)`.as('max_open')])
        .where('tenant_id', '=', tenantId).where('site_id', 'in', siteIds)
        .where('role', 'in', ['agent', 'lead']).groupBy('user_id').execute();
    }
    if (!candidates.length) return null;
    const ids = candidates.map(c => c.user_id);
    const [presence, clocked, load] = await Promise.all([
      trx.selectFrom('user_presence').select(['user_id', 'last_active_at']).where('tenant_id', '=', tenantId).where('user_id', 'in', ids).execute(),
      trx.selectFrom('hr_clock_sessions').select('user_id').where('tenant_id', '=', tenantId).where('user_id', 'in', ids).where('status', 'in', ['ACTIVE', 'ON_BREAK']).execute(),
      trx.selectFrom('support_tickets').select(['assigned_to', sql<number>`count(*)`.as('n')])
        .where('tenant_id', '=', tenantId).where('assigned_to', 'in', ids).where('status', 'in', [...OPEN_STATUSES])
        .groupBy('assigned_to').execute(),
    ]);
    const now = Date.now();
    const online = new Set(presence.filter(p => p.last_active_at && now - new Date(p.last_active_at).getTime() < ONLINE_THRESHOLD_MS).map(p => p.user_id));
    const clockedIn = new Set(clocked.map(c => c.user_id));
    const loadMap = new Map(load.map(l => [l.assigned_to as string, Number(l.n)]));
    const available = candidates
      .filter(c => online.has(c.user_id) && (loadMap.get(c.user_id) ?? 0) < Number(c.max_open))
      // Clocked in first (on shift), then least loaded.
      .sort((a, b) => (Number(clockedIn.has(b.user_id)) - Number(clockedIn.has(a.user_id)))
        || ((loadMap.get(a.user_id) ?? 0) - (loadMap.get(b.user_id) ?? 0)));
    return available[0]?.user_id ?? null;
  };

  let assignedTo: string | null = null;
  if (site || queue) {
    assignedTo = await pickAgent(site ? [site.id] : null, queue?.id ?? null);
    if (!assignedTo && queue && site) assignedTo = await pickAgent([site.id], null);
    if (assignedTo) why.push('least-loaded available agent');
  }

  const overflow = queue?.overflow ?? 'zone';
  if (!assignedTo && site && overflow !== 'none') {
    if (site.zone_id) {
      const zoneSites = centres.filter(c => c.zone_id === site!.zone_id && c.id !== site!.id && isCentreOpen(c)).map(c => c.id);
      assignedTo = await pickAgent(zoneSites, null);
      if (assignedTo) why.push('overflowed to another centre in the zone');
    }
    if (!assignedTo && overflow === 'network') {
      assignedTo = await pickAgent(centres.filter(c => c.id !== site!.id && isCentreOpen(c)).map(c => c.id), null);
      if (assignedTo) why.push('overflowed across the network');
    }
  }
  if (!assignedTo && (site || queue)) why.push('nobody available — waiting in the queue');

  return {
    siteId: site?.id ?? null,
    zoneId: site?.zone_id ?? null,
    productId: product?.id ?? null,
    groupId: queue?.id ?? null,
    assignedTo,
    slaHours,
    reason: why.join(' · ').replace(/^./, c => c.toUpperCase()),
  };
}

// ── Product ticket forms ────────────────────────────────────────────────

export type FormValue = string | number | boolean;

/**
 * Check answers against a product's form and keep only its fields, coerced to
 * the field's type. Returns the clean answers, or the first problem in plain
 * words. `requireAll` is off when editing a single answer later.
 */
export function validateFormAnswers(
  fields: { key: string; label: string; type: string; options?: string[]; required?: boolean }[],
  answers: Record<string, unknown> | undefined,
  requireAll = true,
): { ok: true; values: Record<string, FormValue> } | { ok: false; error: string } {
  const values: Record<string, FormValue> = {};
  const given = answers ?? {};
  for (const f of fields) {
    const raw = given[f.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (requireAll && f.required) return { ok: false, error: `${f.label} is required for this product.` };
      continue;
    }
    if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(n)) return { ok: false, error: `${f.label} must be a number.` };
      values[f.key] = n;
    } else if (f.type === 'date') {
      const s = String(raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return { ok: false, error: `${f.label} must be a date (YYYY-MM-DD).` };
      values[f.key] = s;
    } else if (f.type === 'select') {
      const s = String(raw);
      if (f.options?.length && !f.options.includes(s)) return { ok: false, error: `${f.label} must be one of: ${f.options.join(', ')}.` };
      values[f.key] = s;
    } else {
      values[f.key] = String(raw).slice(0, f.type === 'textarea' ? 4000 : 500);
    }
  }
  return { ok: true, values };
}

// ── Query filter ────────────────────────────────────────────────────────

export interface TicketFilter {
  /** Centres to include; null = no centre restriction. */
  siteIds: string[] | null;
  /** Include tickets not placed in any centre. */
  includeUnplaced: boolean;
  productId?: string | null;
  /** Tickets assigned to this person are always visible to them (overflow). */
  viewerId?: string | null;
}

/** Build the ticket filter for a request: the person's scope narrowed by any
 *  ?site_id= / ?zone_id= / ?product_id= they asked for. */
export async function ticketFilterFor(
  trx: Trx, user: { sub: string; tenant_id: string; role: string },
  q: { site_id?: string; zone_id?: string; product_id?: string },
): Promise<TicketFilter> {
  const scope = await supportScope(trx, user);
  const { siteIds, includeUnplaced } = await resolveSiteFilter(trx, user.tenant_id, scope, q);
  return { siteIds, includeUnplaced, productId: q.product_id || null, viewerId: scope.all ? null : user.sub };
}

/** A WHERE condition for support_tickets (optionally aliased, e.g. 'st'). */
export function ticketFilterSql(f: TicketFilter | undefined, alias?: string) {
  if (!f) return sql<boolean>`true`;
  const col = (c: string) => sql.ref(alias ? `${alias}.${c}` : c);
  const parts = [];
  if (f.siteIds !== null) {
    const ors = [sql`${col('site_id')} = ANY(${f.siteIds}::uuid[])`];
    if (f.includeUnplaced) ors.push(sql`${col('site_id')} IS NULL`);
    if (f.viewerId) ors.push(sql`${col('assigned_to')} = ${f.viewerId}`);
    parts.push(sql`(${sql.join(ors, sql` OR `)})`);
  }
  if (f.productId) parts.push(sql`${col('product_id')} = ${f.productId}`);
  return parts.length ? sql<boolean>`${sql.join(parts, sql` AND `)}` : sql<boolean>`true`;
}
