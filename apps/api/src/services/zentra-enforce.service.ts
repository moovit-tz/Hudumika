import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant } from '../db/client.js';

/**
 * Zentra access policies, enforced inside the apps that own the records.
 *
 * Only a workspace's EXPLICIT policies apply here. Zentra's baseline rules
 * (e.g. "juniors see only assigned records") are not imposed on other apps;
 * those keep their own permissions, and a policy can only narrow them:
 *
 *  - a matching DENY hides the record, unless
 *  - a matching ALLOW for the same person covers it (an exception), e.g.
 *    "deny JUNIOR read invoice always" + "allow JUNIOR read invoice
 *    assigned_only" = juniors only see invoices assigned to them.
 *  - ALLOW never grants more than the app itself would.
 *
 * Covered:
 *  - read: list and detail routes of shipments, customers, invoices,
 *    support tickets and staff (employees);
 *  - search: the global search (/v1/search) — a record is left out if a
 *    'search' or a 'read' policy hides it;
 *  - export: the export routes in EXPORT_ROUTES and any export under the
 *    apps above — blocked outright when a deny applies, since a file can't
 *    be filtered per record.
 *
 * "Team" is the person's department (users.department_id). A record's team
 * is its assignee's department (or its owner's, e.g. an invoice's creator);
 * an employee's team is their own department.
 *
 * SuperAdmins and API keys are not subject to tenant policies.
 */

export type Rec = { id: string; owner_id?: string | null; assigned_to_user_id?: string | null; team_id?: string | null; amount?: number | null; classification?: string | null };
interface PolicyRow {
  id: string; name: string; resource_type: string; action: string; subject_type: string; subject_id: string;
  effect: 'allow' | 'deny'; condition_type: string; condition_value: unknown;
}
interface Subject { id: string; role: string; team_id: string | null; tenant_id: string }

const TYPES: Record<string, { type: string; toRec: (r: any) => Rec }> = {
  '/v1/shipments': { type: 'shipment', toRec: r => ({ id: r.id, assigned_to_user_id: r.assigned_to ?? null }) },
  '/v1/customers': { type: 'customer', toRec: r => ({ id: r.id, assigned_to_user_id: r.assigned_officer_id ?? null }) },
  '/v1/invoices': { type: 'invoice', toRec: r => ({ id: r.id, owner_id: r.created_by ?? null, amount: r.tra_total_incl == null ? null : Number(r.tra_total_incl) }) },
  '/v1/support/tickets': { type: 'support_ticket', toRec: r => ({ id: r.id, assigned_to_user_id: r.assigned_to ?? null }) },
  // An employee "owns" their own record, so owner_only = only themselves.
  '/v1/hr/staff': { type: 'employee', toRec: r => ({ id: r.id, owner_id: r.id, team_id: r.department_id ?? null }) },
};

/** Exports outside the prefixes above, by the record type their file holds. */
const EXPORT_ROUTES: Record<string, string> = {
  '/v1/payroll/runs/:id/bank-file': 'employee',
  '/v1/hr/clock-in/timesheet/export': 'employee',
  '/v1/finance/vat-return/export': 'invoice',
  '/v1/vat-periods/:id/export': 'invoice',
  '/v1/contacts/export.csv': 'contact',
  '/v1/contacts/export.vcf': 'contact',
};

/** Global search categories → policy resource type. */
const SEARCH_TYPES: Record<string, string> = {
  shipments: 'shipment', customers: 'customer', invoices: 'invoice', tickets: 'support_ticket', staff: 'employee',
};

const CACHE_MS = 30_000;
const policyCache = new Map<string, { at: number; rows: PolicyRow[] }>();
const deptCache = new Map<string, { at: number; byUser: Map<string, string | null> }>();
/** Call after a policy is created, changed or deleted. */
export function clearZentraPolicyCache(tenantId: string) { policyCache.delete(tenantId); }

async function policiesFor(tenantId: string): Promise<PolicyRow[]> {
  const hit = policyCache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = await withTenant(tenantId, trx => trx.selectFrom('zentra_policies')
    .select(['id', 'name', 'resource_type', 'action', 'subject_type', 'subject_id', 'effect', 'condition_type', 'condition_value'])
    .where('tenant_id', '=', tenantId).where('enabled', '=', true).execute()) as PolicyRow[];
  policyCache.set(tenantId, { at: Date.now(), rows });
  return rows;
}

/** Each user's department, for team conditions. */
export async function departmentsFor(tenantId: string): Promise<Map<string, string | null>> {
  const hit = deptCache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.byUser;
  const rows = await withTenant(tenantId, trx => trx.selectFrom('users').select(['id', 'department_id'])
    .where('tenant_id', '=', tenantId).execute());
  const byUser = new Map(rows.map(r => [r.id, r.department_id ?? null]));
  deptCache.set(tenantId, { at: Date.now(), byUser });
  return byUser;
}

/** Fill in a record's team from its assignee's (or owner's) department. */
export function withTeam(r: Rec, depts: Map<string, string | null>): Rec {
  if (r.team_id !== undefined && r.team_id !== null) return r;
  const who = r.assigned_to_user_id ?? r.owner_id;
  return { ...r, team_id: who ? depts.get(who) ?? null : null };
}

const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return null; } };
function conditionMet(p: PolicyRow, s: Subject, r: Rec | null): boolean {
  const v: any = typeof p.condition_value === 'string' ? safeJson(p.condition_value) : p.condition_value;
  switch (p.condition_type) {
    case 'always': return true;
    case 'owner_only': return !!r?.owner_id && r.owner_id === s.id;
    case 'assigned_only': return !!r?.assigned_to_user_id && r.assigned_to_user_id === s.id;
    case 'team_only': return !!r?.team_id && !!s.team_id && r.team_id === s.team_id;
    case 'classification_le': return !!r && (RANK[r.classification ?? 'internal'] ?? 1) <= (RANK[String(v?.max ?? 'internal')] ?? 1);
    case 'amount_lt': return !!r && typeof r.amount === 'number' && r.amount <= Number(v?.max ?? Infinity);
    default: return false;
  }
}

const appliesTo = (p: PolicyRow, s: Subject) =>
  (p.subject_type === 'role' && p.subject_id === s.role)
  || (p.subject_type === 'user' && p.subject_id === s.id)
  || (p.subject_type === 'team' && !!s.team_id && p.subject_id === s.team_id);

/** The deny policy that hides this record from this person, or null. */
function deniedBy(policies: PolicyRow[], s: Subject, type: string, actions: string[], r: Rec | null): PolicyRow | null {
  const mine = policies.filter(p => p.resource_type === type && actions.includes(p.action) && appliesTo(p, s));
  if (!mine.length) return null;
  const deny = mine.find(p => p.effect === 'deny' && conditionMet(p, s, r));
  if (!deny) return null;
  return mine.some(p => p.effect === 'allow' && conditionMet(p, s, r)) ? null : deny;
}

function routeInfo(request: FastifyRequest) {
  const url = (request.routeOptions?.url || '').replace(/\/$/, '');
  if (url === '/v1/search') return { kind: 'search' as const, type: '', toRec: (r: any) => r as Rec };
  if (EXPORT_ROUTES[url]) return { kind: 'export' as const, type: EXPORT_ROUTES[url], toRec: (r: any) => r as Rec };
  for (const [prefix, cfg] of Object.entries(TYPES)) {
    if (url === prefix) return { ...cfg, kind: 'list' as const };
    if (url === `${prefix}/:id`) return { ...cfg, kind: 'detail' as const };
    if (url.startsWith(prefix + '/') && /export/i.test(url)) return { ...cfg, kind: 'export' as const };
  }
  return null;
}

async function subjectOf(request: FastifyRequest): Promise<Subject | null> {
  const u = (request as any).user;
  if (!u?.tenant_id || !u?.sub || u.role === 'SUPER_ADMIN' || String(u.sub).startsWith('apikey:')) return null;
  const depts = await departmentsFor(u.tenant_id);
  return { id: u.sub, role: u.role, tenant_id: u.tenant_id, team_id: depts.get(u.sub) ?? null };
}

function audit(request: FastifyRequest, s: Subject, name: string, outcome: 'denied' | 'success', type: string, id: string, summary: string, meta: Record<string, unknown>) {
  void withTenant(s.tenant_id, trx => trx.insertInto('zentra_event_outbox').values({
    tenant_id: s.tenant_id, app_id: 'zentra', event_name: name, status: 'pending',
    payload: JSON.stringify({
      actor_id: s.id, actor_role: s.role, actor_ip: request.ip ?? null, resource_type: type, resource_id: id,
      action: 'read', outcome, correlation_id: request.id, safe_summary: summary, safe_metadata: { ...meta, source: 'zentra_policy' },
    }),
  } as any).execute()).catch(() => {});
}

/** Filter arrays of records (top level or one level down, e.g. grouped lists). */
function filterPayload(payload: any, keep: (row: any) => boolean): { payload: any; removed: number } {
  let removed = 0;
  const filterArr = (arr: any[]): any[] => {
    const out: any[] = [];
    for (const item of arr) {
      if (item && typeof item === 'object' && typeof item.id === 'string') {
        if (keep(item)) out.push(item); else removed++;
      } else if (item && typeof item === 'object') {
        const copy = { ...item };
        for (const [k, v] of Object.entries(copy)) if (Array.isArray(v)) copy[k] = filterArr(v);
        out.push(copy);
      } else out.push(item);
    }
    return out;
  };
  if (Array.isArray(payload)) return { payload: filterArr(payload), removed };
  if (payload && typeof payload === 'object') {
    const copy = { ...payload };
    for (const k of ['data', 'items', 'rows', 'results', 'tickets', 'invoices', 'customers', 'shipments', 'staff']) {
      if (Array.isArray(copy[k])) copy[k] = filterArr(copy[k]);
    }
    if (removed && typeof copy.total === 'number') copy.total = Math.max(0, copy.total - removed);
    return { payload: copy, removed };
  }
  return { payload, removed };
}

/** The owner/assignee/amount/team of records, read from their own tables (for search, which returns labels only). */
export async function loadRecs(tenantId: string, type: string, ids: string[]): Promise<Map<string, Rec>> {
  const out = new Map<string, Rec>();
  if (!ids.length) return out;
  await withTenant(tenantId, async trx => {
    if (type === 'shipment') {
      for (const r of await trx.selectFrom('shipment_cases').select(['id', 'assigned_to']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute())
        out.set(r.id, { id: r.id, assigned_to_user_id: r.assigned_to });
    } else if (type === 'customer') {
      for (const r of await trx.selectFrom('customers').select(['id', 'assigned_officer_id']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute())
        out.set(r.id, { id: r.id, assigned_to_user_id: r.assigned_officer_id });
    } else if (type === 'invoice') {
      for (const r of await trx.selectFrom('sales_invoices').select(['id', 'created_by', 'tra_total_incl']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute())
        out.set(r.id, { id: r.id, owner_id: r.created_by as string | null, amount: r.tra_total_incl == null ? null : Number(r.tra_total_incl) });
    } else if (type === 'support_ticket') {
      for (const r of await trx.selectFrom('support_tickets').select(['id', 'assigned_to']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute())
        out.set(r.id, { id: r.id, assigned_to_user_id: r.assigned_to });
    } else if (type === 'employee') {
      for (const r of await trx.selectFrom('users').select(['id', 'department_id']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute())
        out.set(r.id, { id: r.id, owner_id: r.id, team_id: r.department_id ?? null });
    }
  });
  return out;
}

export function registerZentraPolicyEnforcement(server: FastifyInstance): void {
  // Exports: checked as the response leaves, because global hooks run before
  // each route's own authentication — only by now is request.user known.
  // A blocked file is replaced with a 403; nothing of it is sent.
  server.addHook('onSend', async (request, reply, payload) => {
    if ((request.method !== 'GET' && request.method !== 'POST') || reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    const info = routeInfo(request);
    if (info?.kind !== 'export') return payload;
    const s = await subjectOf(request).catch(() => null);
    if (!s) return payload;
    const refuse = (status: number, body: Record<string, string>) => {
      reply.code(status);
      reply.removeHeader('content-disposition');
      reply.removeHeader('content-length');
      reply.header('content-type', 'application/json; charset=utf-8');
      return JSON.stringify(body);
    };
    const policies = await policiesFor(s.tenant_id).catch(() => null);
    if (policies === null) return refuse(503, { error: 'Access policies could not be checked. Try again shortly.' });
    // Any deny on export (whatever its condition) blocks the file, unless an
    // unconditional allow exception covers this person.
    const mine = policies.filter(p => p.resource_type === info.type && p.action === 'export' && appliesTo(p, s));
    const deny = mine.find(p => p.effect === 'deny');
    if (deny && !mine.some(p => p.effect === 'allow' && p.condition_type === 'always')) {
      audit(request, s, 'permission.denied', 'denied', info.type, 'export', `Export blocked by policy "${deny.name}"`, { reason_code: 'zentra_policy' });
      // Recorded just above with the policy name; stop the telemetry hook counting it a second time.
      (request as any).zentraSkipDenial = true;
      return refuse(403, { error: `Exporting is blocked by your workspace's access policy "${deny.name}".`, code: 'ZENTRA_POLICY_DENIED' });
    }
    return payload;
  });

  // Lists, single records and search: hide what a policy denies.
  server.addHook('preSerialization', async (request, reply, payload: any) => {
    if (request.method !== 'GET' || reply.statusCode !== 200 || payload == null) return payload;
    const info = routeInfo(request);
    if (!info || info.kind === 'export') return payload;
    const s = await subjectOf(request).catch(() => null);
    if (!s) return payload;
    const policies = await policiesFor(s.tenant_id).catch(() => null);
    if (policies === null) {
      reply.code(503);
      return { error: 'Access policies could not be checked. Try again shortly.' };
    }
    const depts = await departmentsFor(s.tenant_id);

    if (info.kind === 'search') {
      const data = payload?.data;
      if (!data || typeof data !== 'object') return payload;
      let hidden = 0;
      const next = { ...data };
      for (const [cat, type] of Object.entries(SEARCH_TYPES)) {
        const items: any[] | undefined = next[cat];
        if (!Array.isArray(items) || !items.length) continue;
        if (!policies.some(p => p.resource_type === type && (p.action === 'read' || p.action === 'search'))) continue;
        const recs = await loadRecs(s.tenant_id, type, items.map(i => i.id).filter((id: unknown) => typeof id === 'string'));
        const kept = items.filter(i => !deniedBy(policies, s, type, ['read', 'search'], withTeam(recs.get(i.id) ?? { id: i.id }, depts)));
        hidden += items.length - kept.length;
        if (kept.length) next[cat] = kept; else delete next[cat];
      }
      if (!hidden) return payload;
      audit(request, s, 'policy.records_hidden', 'success', 'search', 'search', `${hidden} search result(s) hidden by access policy`, { count: hidden });
      return { ...payload, data: next, order: Array.isArray(payload.order) ? payload.order.filter((c: string) => c in next) : payload.order };
    }

    if (!policies.some(p => p.resource_type === info.type && p.action === 'read')) return payload;

    if (info.kind === 'detail') {
      const record = typeof payload.id === 'string' ? payload : (payload.ticket ?? payload.data ?? null);
      if (!record || typeof record.id !== 'string') return payload;
      const deny = deniedBy(policies, s, info.type, ['read'], withTeam(info.toRec(record), depts));
      if (!deny) return payload;
      audit(request, s, 'permission.denied', 'denied', info.type, record.id, `Blocked by policy "${deny.name}"`, { reason_code: 'zentra_policy' });
      reply.code(403);
      return { error: `Access to this record is blocked by your workspace's access policy "${deny.name}".`, code: 'ZENTRA_POLICY_DENIED' };
    }

    const result = filterPayload(payload, row => !deniedBy(policies, s, info.type, ['read'], withTeam(info.toRec(row), depts)));
    if (result.removed) {
      // Not a "denied" outcome: viewing a list isn't an attempt on a record,
      // and counting it would turn every list view into a denial signal.
      audit(request, s, 'policy.records_hidden', 'success', info.type, 'list', `${result.removed} record(s) hidden by access policy`, { count: result.removed });
    }
    return result.payload;
  });
}
