import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant } from '../db/client.js';

/**
 * Server-observed telemetry for Zentra, recorded for every app at once:
 *
 *  - permission.denied: any authenticated request refused with 403. This is
 *    what the "repeated access denials" rule counts; domain events only
 *    ever describe things that succeeded.
 *  - record.exported: any successful response delivered as a file (CSV,
 *    spreadsheet, PDF, ZIP, or anything sent as an attachment). For CSV the
 *    row count is measured from the body, which drives the bulk-export rule.
 *
 * Both are observed by the server, so a user cannot forge or suppress them.
 * Writes go to zentra_event_outbox and never block or fail the response.
 */

/** URL prefix → app id, for routes that never pass an entitlement check. */
const PREFIX_APP: Record<string, string> = {
  finance: 'finops', bills: 'finops', invoices: 'finops', expenses: 'finops', payroll: 'nexushr',
  hr: 'nexushr', support: 'bliss', shipments: 'clearos', declarations: 'clearos', customs: 'clearos',
  customers: 'crm', leads: 'crm', deals: 'crm', contacts: 'contacts', files: 'cloud', drive: 'cloud',
  settings: 'workspace', users: 'workspace', admin: 'admin', superadmin: 'admin', zentra: 'zentra',
};

const FILE_TYPES = /text\/csv|spreadsheetml|ms-excel|application\/pdf|application\/zip|octet-stream/i;
const PACKAGING_REFUSAL = /PLAN_UPGRADE_REQUIRED|SEAT_LICENSE_REQUIRED|TENANT_SUSPENDED|not enabled for your organization/;
const SKIP = /^\/(health|auth\/(refresh|me)|v1\/(notifications|presence|avatars?|identity\/avatars))/;

/** App id for a request path, the same mapping telemetry uses (also read by the staff console's monitoring). */
export function appIdForPath(path: string): string {
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const first = seg[0] === 'v1' ? seg[1] : seg[0];
  return (first && (PREFIX_APP[first] ?? first)).slice(0, 64) || 'workspace';
}

function appFor(request: FastifyRequest): string {
  const metered = (request as any).meteredAppId as string | undefined;
  if (metered) return metered;
  const seg = (request.routeOptions?.url || request.url).split('?')[0].split('/').filter(Boolean);
  const first = seg[0] === 'v1' ? seg[1] : seg[0];
  return (first && (PREFIX_APP[first] ?? first)).slice(0, 64) || 'workspace';
}

function resourceFor(request: FastifyRequest): { type: string; id: string } {
  const route = (request.routeOptions?.url || request.url).split('?')[0];
  const parts = route.split('/').filter(p => p && p !== 'v1' && !p.startsWith(':'));
  const params = (request.params ?? {}) as Record<string, string>;
  return {
    type: (parts[parts.length - 1] || 'route').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 64),
    id: String(params.id ?? params.tenantId ?? route).slice(0, 128),
  };
}

function queue(request: FastifyRequest, event: { name: string; outcome: 'denied' | 'success'; action: string; summary: string; meta: Record<string, unknown> }) {
  const user = (request as any).user;
  if (!user?.tenant_id || !user?.sub) return;
  const app = appFor(request);
  const res = resourceFor(request);
  void withTenant(user.tenant_id, trx => trx.insertInto('zentra_event_outbox').values({
    tenant_id: user.tenant_id,
    app_id: app,
    event_name: event.name,
    payload: JSON.stringify({
      actor_id: String(user.sub).slice(0, 128),
      actor_role: user.role ?? null,
      actor_name: user.name ?? null,
      actor_ip: request.ip ?? null,
      actor_user_agent: String(request.headers['user-agent'] ?? '').slice(0, 300) || null,
      resource_type: res.type,
      resource_id: res.id,
      action: event.action,
      outcome: event.outcome,
      correlation_id: request.id,
      safe_summary: event.summary,
      safe_metadata: { ...event.meta, method: request.method, route: (request.routeOptions?.url || '').slice(0, 200), source: 'server_observed' },
    }),
    status: 'pending',
    idempotency_key: `req:${event.name}:${request.id}:${Date.now()}`,
  } as any).execute()).catch(err => request.log.warn({ err: err?.message }, 'Zentra telemetry could not be queued'));
}

function csvRows(payload: unknown): number | null {
  let text: string | null = null;
  if (typeof payload === 'string') text = payload;
  else if (Buffer.isBuffer(payload)) text = payload.toString('utf8');
  if (text === null) return null;
  const lines = text.split(/\r?\n/).filter(l => l.trim()).length;
  return Math.max(0, lines - 1); // minus the header row
}

export function registerZentraTelemetryHooks(server: FastifyInstance): void {
  // Measure CSV size before the body is sent (onResponse no longer has it).
  server.addHook('onSend', async (request, reply, payload) => {
    // A refusal because the workspace's plan or seats don't include the app
    // is a packaging answer, not a security event — don't count it.
    if (reply.statusCode === 403 && (typeof payload === 'string' || Buffer.isBuffer(payload))
      && PACKAGING_REFUSAL.test(String(payload).slice(0, 400))) {
      (request as any).zentraSkipDenial = true;
    }
    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      const type = String(reply.getHeader('content-type') ?? '');
      const disposition = String(reply.getHeader('content-disposition') ?? '');
      if (FILE_TYPES.test(type) || /attachment/i.test(disposition)) {
        (request as any).zentraExport = {
          format: /csv/i.test(type) ? 'csv' : /spreadsheet|excel/i.test(type) ? 'xlsx' : /pdf/i.test(type) ? 'pdf' : /zip/i.test(type) ? 'zip' : 'file',
          count: /csv/i.test(type) ? csvRows(payload) : null,
        };
      }
    }
    return payload;
  });

  server.addHook('onResponse', async (request, reply) => {
    const url = request.url.split('?')[0];
    if (SKIP.test(url)) return;
    if (reply.statusCode === 403 && !(request as any).zentraSkipDenial) {
      queue(request, {
        name: 'permission.denied', outcome: 'denied', action: request.method.toLowerCase(),
        summary: `Refused ${request.method} ${request.routeOptions?.url || url}`,
        meta: { status: 403 },
      });
      return;
    }
    const exp = (request as any).zentraExport as { format: string; count: number | null } | undefined;
    if (exp) {
      queue(request, {
        name: 'record.exported', outcome: 'success', action: 'export',
        summary: `Downloaded ${exp.count ?? 'a'} ${exp.count === null ? '' : 'row '}${exp.format} file from ${request.routeOptions?.url || url}`.replace(/\s+/g, ' '),
        meta: { format: exp.format, ...(exp.count !== null ? { count: exp.count } : {}) },
      });
      return;
    }
    // Every successful change a signed-in person makes, in every app — so
    // apps that emit no domain events (LexCore, Gereji, Tuma, Travel, Ngao,
    // Notes, Contacts…) still leave a "who changed what" trail and can be
    // checked for going silent. Integrations (API keys) and chatty endpoints
    // (presence, read receipts, autosave, chat) are left out.
    const action = WRITE_ACTIONS[request.method];
    const user = (request as any).user;
    if (action && reply.statusCode >= 200 && reply.statusCode < 300 && user?.sub && !String(user.sub).startsWith('apikey:')
        && !NOISY_WRITES.test(request.routeOptions?.url || url)) {
      queue(request, {
        name: 'record.changed', outcome: 'success', action,
        summary: `${action[0].toUpperCase()}${action.slice(1)}d via ${request.method} ${request.routeOptions?.url || url}`,
        meta: { status: reply.statusCode },
      });
    }
  });
}

const WRITE_ACTIONS: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
/** Writes too frequent or too trivial to audit one by one. /v1/zentra has its own audit hook. */
const NOISY_WRITES = /^\/(auth|v1\/(zentra|agent|ai|presence|notifications|calls|chat|search|events|telemetry|ondi\/session))(\/|$)|\/(read|seen|typing|heartbeat|ping|presence|autosave|draft|drafts|recent|pin|unpin|star|unstar|views?|preferences|mark-read|read-all|positions?|location|track)(\/|$)/i;
