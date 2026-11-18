/**
 * Hudumika MCP gateway — who is calling, what they may use, and running it.
 *
 * Every call re-derives the actor from the database, never from the token
 * alone: the connection must still be active, the user active, the tenant not
 * suspended, MCP still allowed for that kind of actor, the tool enabled for the
 * workspace, the actor type/role allowed, the scope granted and the app
 * entitled. Then the tool runs through the app's own REST route as that user
 * (fastify.inject), so the route's own record rules apply too. Discovery
 * (tools/list) runs the same checks, so what a client sees is what it can call.
 */
import crypto from 'crypto';
import { EventEmitter } from 'events';
import type { FastifyInstance } from 'fastify';
import type { JWTPayload, UserRole } from '@hudumika/types';
import { dbPlatform, withTenant } from '../db/client.js';
import { loginEmail } from '../lib/login-email.js';
import { userEntitlementFailure } from '../middleware/entitlement.js';
import { isPlatformInMaintenance } from '../lib/platform-settings.js';
import { MCP_TOOLS, MCP_TOOL_BY_ID } from '../lib/mcp/tools.js';
import { McpToolError, type McpActorType, type McpCallContext, type McpTool } from '../lib/mcp/types.js';
import { validateArgs } from '../lib/mcp/validate.js';

export const MCP_SCOPES = ['mcp:read', 'mcp:write'] as const;
export type McpScope = typeof MCP_SCOPES[number];

export interface McpActor {
  connectionId: string;
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  actorType: McpActorType;
  customerId: string | null;
  clientId: string;
  scopes: string[];
  ip: string;
}

export class McpAuthError extends Error {
  constructor(public status: 401 | 403, message: string) { super(message); }
}

// ── Workspace policy & tool enablement ────────────────────────────────────

export async function getWorkspacePolicy(tenantId: string) {
  const row = await withTenant(tenantId, trx => trx.selectFrom('mcp_workspace_policy').selectAll()
    .where('tenant_id', '=', tenantId).executeTakeFirst());
  return { staff_enabled: row?.staff_enabled ?? true, customers_enabled: row?.customers_enabled ?? false, updated_at: row?.updated_at ?? null };
}

export async function getToolOverrides(tenantId: string): Promise<Map<string, boolean>> {
  const rows = await withTenant(tenantId, trx => trx.selectFrom('mcp_tool_settings').select(['tool_id', 'enabled'])
    .where('tenant_id', '=', tenantId).execute());
  return new Map(rows.map(r => [r.tool_id, r.enabled]));
}

export function toolDefaultEnabled(tool: McpTool): boolean {
  return tool.defaultEnabled ?? tool.access === 'read';
}

// ── Actor resolution ──────────────────────────────────────────────────────

/** Re-derive the actor for an MCP access token's connection. Throws McpAuthError. */
export async function resolveActor(claims: { tenant_id: string; sub: string; cid: string; aud: string; scope?: string }, ip: string): Promise<McpActor> {
  const tenant = await dbPlatform.selectFrom('tenants').select(['active']).where('id', '=', claims.tenant_id).executeTakeFirst();
  if (!tenant) throw new McpAuthError(401, 'Workspace no longer exists.');
  if (tenant.active === false) throw new McpAuthError(403, "This organization's account has been suspended.");
  if (await isPlatformInMaintenance()) throw new McpAuthError(403, 'Hudumika is temporarily down for maintenance.');

  return withTenant(claims.tenant_id, async trx => {
    const conn = await trx.selectFrom('mcp_connections').selectAll()
      .where('id', '=', claims.cid).where('tenant_id', '=', claims.tenant_id).executeTakeFirst();
    if (!conn || conn.status !== 'active' || conn.user_id !== claims.sub || conn.client_id !== claims.aud) {
      throw new McpAuthError(401, 'This connection has been revoked. Reconnect to Hudumika.');
    }
    const user = await trx.selectFrom('users').select(['id', 'role', 'name', 'email', 'active', 'customer_id'])
      .where('id', '=', conn.user_id).where('tenant_id', '=', claims.tenant_id).executeTakeFirst() as any;
    if (!user || !user.active) throw new McpAuthError(401, 'This account is no longer active.');

    const role = user.role as UserRole;
    const actorType: McpActorType = role === 'CUSTOMER' ? 'customer' : 'staff';
    if (actorType !== conn.actor_type) throw new McpAuthError(401, 'This account changed type since it was connected. Reconnect to Hudumika.');
    if (!isConnectableRole(role)) throw new McpAuthError(403, 'This account type cannot use MCP connections.');

    const policy = await trx.selectFrom('mcp_workspace_policy').selectAll().where('tenant_id', '=', claims.tenant_id).executeTakeFirst();
    const allowed = actorType === 'customer' ? (policy?.customers_enabled ?? false) : (policy?.staff_enabled ?? true);
    if (!allowed) throw new McpAuthError(403, actorType === 'customer'
      ? 'Your provider has turned off AI connections for customer accounts.'
      : 'Your workspace admin has turned off AI connections.');

    let customerId: string | null = null;
    if (actorType === 'customer') {
      customerId = await currentCustomerLink(trx, claims.tenant_id, user);
      if (!customerId || customerId !== conn.customer_id) throw new McpAuthError(403, 'This customer login is no longer linked to the customer account it was connected for.');
    }

    // Grant scopes are the ceiling; a token can never carry more.
    const granted: string[] = Array.isArray(conn.scopes) ? conn.scopes : JSON.parse(String(conn.scopes ?? '[]'));
    const tokenScopes = String(claims.scope ?? '').split(' ').filter(Boolean);
    const scopes = tokenScopes.filter(s => granted.includes(s));

    return {
      connectionId: conn.id, tenantId: claims.tenant_id, userId: user.id, name: user.name, email: loginEmail(user),
      role, actorType, customerId, clientId: conn.client_id, scopes, ip,
    };
  });
}

/** Platform operators and non-login identities never connect. */
export function isConnectableRole(role: string): boolean {
  return !['SUPER_ADMIN', 'ORG', 'GUEST'].includes(role);
}

/** The customers row a CUSTOMER login acts for — uncached, so an unlink takes effect at once. */
export async function currentCustomerLink(trx: any, tenantId: string, user: { customer_id?: string | null; email?: string | null }): Promise<string | null> {
  if (user.customer_id) return user.customer_id;
  if (!user.email) return null;
  const matches = await trx.selectFrom('customers').select('id').where('tenant_id', '=', tenantId)
    .where((eb: any) => eb(eb.fn('lower', ['email']), '=', String(user.email).toLowerCase())).limit(2).execute();
  return matches.length === 1 ? matches[0].id : null;
}

// ── Tool availability ─────────────────────────────────────────────────────

export type ToolDecision = { allowed: true } | { allowed: false; reason: string; code: string };

function asJwtUser(a: Pick<McpActor, 'userId' | 'tenantId' | 'role' | 'email' | 'name'>): JWTPayload {
  const now = Math.floor(Date.now() / 1000);
  return { sub: a.userId, tenant_id: a.tenantId, role: a.role, email: a.email, name: a.name, iat: now, exp: now + 60 };
}

type EntCache = { get(key: string): string | null | undefined; set(key: string, value: string | null): unknown };

export async function entitlementDecision(actor: Pick<McpActor, 'userId' | 'tenantId' | 'role' | 'email' | 'name'>, tool: McpTool, cache?: EntCache): Promise<string | null> {
  if (!tool.entitlement) return null;
  const keys = Array.isArray(tool.entitlement) ? tool.entitlement : [tool.entitlement];
  let first: string | null = null;
  for (const key of keys) {
    let failure = cache?.get(key);
    if (failure === undefined) {
      const f = await userEntitlementFailure(asJwtUser(actor), key);
      failure = f ? String(f.body.error ?? 'Not entitled') : null;
      cache?.set(key, failure);
    }
    if (failure === null) return null;
    first ??= failure;
  }
  return first;
}

/** Everything except the route's own record rules, which run at call time. */
export async function decideTool(actor: McpActor, tool: McpTool, overrides: Map<string, boolean>, entCache?: EntCache): Promise<ToolDecision> {
  if (!tool.actors.includes(actor.actorType)) return { allowed: false, code: 'actor_type', reason: actor.actorType === 'customer' ? 'Not available to customer accounts.' : 'Not available to staff accounts.' };
  if (actor.actorType === 'staff' && tool.roles && !tool.roles.includes(actor.role)) return { allowed: false, code: 'role', reason: `Your role (${actor.role}) cannot use this tool.` };
  const needed: McpScope = tool.access === 'write' ? 'mcp:write' : 'mcp:read';
  if (!actor.scopes.includes(needed)) return { allowed: false, code: 'scope', reason: `This connection was not granted ${needed}. Reconnect and allow ${tool.access === 'write' ? 'changes' : 'read access'}.` };
  const enabled = overrides.get(tool.id) ?? toolDefaultEnabled(tool);
  if (!enabled) return { allowed: false, code: 'disabled', reason: 'Your workspace admin has not enabled this tool.' };
  const ent = await entitlementDecision(actor, tool, entCache);
  if (ent) return { allowed: false, code: 'entitlement', reason: ent };
  return { allowed: true };
}

// ── Discovery and change notifications ────────────────────────────────────
//
// Discovery is never cached across calls: plan, app-switch and seat-licence
// changes are written from many places, and a stale tool list would advertise
// tools a person may no longer use. Within one listing each entitlement key is
// checked once (apps share keys) and all keys are checked in parallel.
// Workspace changes made here (policy, tool switches, revocation) also wake
// that tenant's open notification streams at once; other changes are picked
// up by the stream's periodic recheck.

export const mcpEvents = new EventEmitter();
mcpEvents.setMaxListeners(0);

/** Call after any change that can alter what a tenant's connections may use. */
export function mcpTenantChanged(tenantId: string) {
  mcpEvents.emit('tenant-changed', tenantId);
}

export async function listToolsFor(actor: McpActor): Promise<McpTool[]> {
  const overrides = await getToolOverrides(actor.tenantId);
  // Resolve every distinct entitlement key once, concurrently.
  const keys = [...new Set(MCP_TOOLS.flatMap(t => (t.entitlement ? [t.entitlement].flat() : [])))];
  const resolved = new Map<string, string | null>();
  await Promise.all(keys.map(async key => {
    const f = await userEntitlementFailure(asJwtUser(actor), key);
    resolved.set(key, f ? String(f.body.error ?? 'Not entitled') : null);
  }));
  const out: McpTool[] = [];
  for (const tool of MCP_TOOLS) if ((await decideTool(actor, tool, overrides, resolved)).allowed) out.push(tool);
  return out;
}

// ── Invocation ────────────────────────────────────────────────────────────

function statusToError(status: number, body: any): McpToolError {
  const msg = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : null;
  if (status === 401 || status === 403 || status === 402) return new McpToolError('denied', msg ?? 'Not allowed.', status);
  if (status === 404 || status === 410) return new McpToolError('not_found', msg ?? 'Not found.', status);
  if (status === 400 || status === 409 || status === 422) return new McpToolError('invalid', msg ?? 'The request was not accepted.', status);
  if (status === 503) return new McpToolError('unavailable', msg ?? 'Temporarily unavailable.', status);
  // Never surface internals of a server error.
  return new McpToolError('error', 'The app could not complete this request.', status);
}

function buildContext(fastify: FastifyInstance, actor: McpActor, toolId: string, depth: number): McpCallContext {
  async function request(method: string, path: string, query?: Record<string, unknown>, body?: unknown, extraHeaders: Record<string, string> = {}) {
    // A short-lived session token for this one in-process call. It never
    // leaves the process, carries the user's current role (not the token's),
    // and goes through the normal authenticate() gates (suspension, IP
    // allowlist, maintenance) plus the route's own checks.
    const token = fastify.jwt.sign({
      sub: actor.userId, tenant_id: actor.tenantId, role: actor.role, email: actor.email, name: actor.name,
      typ: 'access', via: 'mcp', mcp_connection_id: actor.connectionId,
    } as any, { expiresIn: 120 });
    const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString() : '';
    const res = await fastify.inject({
      method: method as any, url: qs ? `${path}?${qs}` : path, remoteAddress: actor.ip,
      headers: { ...extraHeaders, authorization: `Bearer ${token}`, 'user-agent': `hudumika-mcp (${actor.clientId}; ${toolId})`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
    });
    let parsed: any = null;
    try { parsed = res.body ? JSON.parse(res.body) : null; } catch { parsed = null; }
    if (res.statusCode >= 400) throw statusToError(res.statusCode, parsed);
    return parsed;
  }
  return {
    tenantId: actor.tenantId, userId: actor.userId, role: actor.role, actorType: actor.actorType,
    customerId: actor.customerId, connectionId: actor.connectionId, clientId: actor.clientId,
    get: (path, query) => request('GET', path, query),
    send: (method, path, body, headers) => request(method, path, undefined, body ?? {}, headers),
    async callTool(id, args) {
      if (depth > 1) return { ok: false, reason: 'Nested tool calls are limited.' };
      const r = await runTool(fastify, actor, id, args, { depth: depth + 1, audit: true });
      return r.isError ? { ok: false, reason: r.message } : { ok: true, result: r.structured };
    },
  };
}

export type ToolRunResult =
  | { isError: false; structured: Record<string, unknown> }
  | { isError: true; message: string; code: string };

async function audit(actor: McpActor, tool: { id: string; app: string }, outcome: string, extra: { code?: string; status?: number; ms: number; args: Record<string, unknown> }) {
  await withTenant(actor.tenantId, async trx => {
    await trx.insertInto('mcp_call_log').values({
      tenant_id: actor.tenantId, connection_id: actor.connectionId, user_id: actor.userId, actor_type: actor.actorType,
      client_id: actor.clientId, tool_id: tool.id, app_id: tool.app, outcome: outcome as any,
      error_code: extra.code ?? null, http_status: extra.status ?? null, duration_ms: extra.ms,
      // Argument names only — never values, so no customer data is retained.
      arg_names: JSON.stringify(Object.keys(extra.args).sort()),
    }).execute();
    await trx.updateTable('mcp_connections').set({ last_used_at: new Date() })
      .where('id', '=', actor.connectionId).where('tenant_id', '=', actor.tenantId).execute();
  }).catch(err => console.error('[mcp] audit write failed:', err?.message));
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stableJson((v as any)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export async function runTool(
  fastify: FastifyInstance, actor: McpActor, toolId: string, rawArgs: Record<string, unknown>,
  opts: { depth?: number; audit?: boolean } = {},
): Promise<ToolRunResult> {
  const started = Date.now();
  const tool = MCP_TOOL_BY_ID.get(toolId);
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const done = async (r: ToolRunResult, outcome: string, status?: number) => {
    if (tool && opts.audit !== false) await audit(actor, tool, outcome, { code: r.isError ? r.code : undefined, status, ms: Date.now() - started, args });
    return r;
  };
  if (!tool) return { isError: true, code: 'unknown_tool', message: `Unknown tool: ${toolId}` };

  const decision = await decideTool(actor, tool, await getToolOverrides(actor.tenantId));
  if (!decision.allowed) return done({ isError: true, code: decision.code, message: decision.reason }, 'denied');

  const invalid = validateArgs(tool.inputSchema, args);
  if (invalid) return done({ isError: true, code: 'invalid_arguments', message: invalid }, 'invalid');

  const ctx = buildContext(fastify, actor, tool.id, opts.depth ?? 0);
  try {
    if (tool.access === 'write') return await runWrite(ctx, actor, tool, args as Record<string, any>, done);
    const structured = await tool.run(ctx, args as Record<string, any>);
    return done({ isError: false, structured }, 'ok');
  } catch (err: any) {
    if (err instanceof McpToolError) {
      return done({ isError: true, code: err.code, message: err.message }, err.code === 'denied' ? 'denied' : err.code === 'invalid' || err.code === 'not_found' ? 'invalid' : 'error', err.httpStatus);
    }
    console.error(`[mcp] ${tool.id} failed:`, err?.message);
    return done({ isError: true, code: 'error', message: 'The tool failed unexpectedly.' }, 'error');
  }
}

/**
 * Two-step, idempotent write.
 *  1. No confirmation_token: validate (including a preview that checks
 *     referenced records through the app's own routes), then return a summary
 *     and a single-use token. Nothing is written.
 *  2. With the token: run the app's own create route once. A retry with the
 *     same idempotency_key returns the stored result instead of writing again;
 *     reusing the key with different arguments is refused.
 */
async function runWrite(
  ctx: McpCallContext, actor: McpActor, tool: McpTool, args: Record<string, any>,
  done: (r: ToolRunResult, outcome: string, status?: number) => Promise<ToolRunResult>,
): Promise<ToolRunResult> {
  const { confirmation_token: token, ...rest } = args;
  const key = String(args.idempotency_key);
  const argsHash = sha(stableJson(rest));

  const existing = await withTenant(actor.tenantId, trx => trx.selectFrom('mcp_write_requests').selectAll()
    .where('tenant_id', '=', actor.tenantId).where('connection_id', '=', actor.connectionId)
    .where('tool_id', '=', tool.id).where('idempotency_key', '=', key).executeTakeFirst());

  if (existing && existing.args_hash !== argsHash) {
    return done({ isError: true, code: 'idempotency_conflict', message: 'This idempotency_key was already used for a different request. Use a new key.' }, 'invalid');
  }
  if (existing?.status === 'done') return done({ isError: false, structured: { status: 'already_done', replayed: true, result: existing.result } }, 'replayed');
  if (existing?.status === 'executing') return done({ isError: true, code: 'in_progress', message: 'This change is already being made. Try again in a moment.' }, 'invalid');
  if (existing?.status === 'failed') return done({ isError: true, code: 'failed', message: `This change failed earlier (${existing.result?.error ?? 'error'}). Use a new idempotency_key to try again.` }, 'invalid');

  if (!token) {
    const summary = tool.preview ? await tool.preview(ctx, rest) : `Run ${tool.title}.`;
    const newToken = crypto.randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + CONFIRMATION_TTL_MS);
    await withTenant(actor.tenantId, async trx => {
      if (existing) {
        await trx.updateTable('mcp_write_requests').set({ confirmation_hash: sha(newToken), expires_at: expires })
          .where('id', '=', existing.id).where('tenant_id', '=', actor.tenantId).execute();
      } else {
        await trx.insertInto('mcp_write_requests').values({
          tenant_id: actor.tenantId, connection_id: actor.connectionId, tool_id: tool.id, idempotency_key: key,
          args_hash: argsHash, confirmation_hash: sha(newToken), expires_at: expires,
        }).execute();
      }
    });
    return done({ isError: false, structured: {
      status: 'confirmation_required', summary, confirmation_token: newToken, expires_at: expires.toISOString(),
      next_step: 'Show the summary to the user. If they agree, call this tool again with the same arguments plus confirmation_token.',
    } }, 'confirmation_required');
  }

  if (!existing || existing.confirmation_hash !== sha(String(token)) || new Date(existing.expires_at).getTime() < Date.now()) {
    return done({ isError: true, code: 'confirmation_invalid', message: 'The confirmation token is invalid or expired. Call the tool again without confirmation_token to get a new one.' }, 'invalid');
  }
  // Claim it: only one caller can move pending → executing.
  const claimed = await withTenant(actor.tenantId, trx => trx.updateTable('mcp_write_requests').set({ status: 'executing' })
    .where('id', '=', existing.id).where('tenant_id', '=', actor.tenantId).where('status', '=', 'pending').returning('id').executeTakeFirst());
  if (!claimed) return done({ isError: true, code: 'in_progress', message: 'This change is already being made.' }, 'invalid');

  try {
    const result = await tool.run(ctx, rest);
    await withTenant(actor.tenantId, trx => trx.updateTable('mcp_write_requests')
      .set({ status: 'done', result: JSON.stringify(result) as any, completed_at: new Date() })
      .where('id', '=', existing.id).where('tenant_id', '=', actor.tenantId).execute());
    return done({ isError: false, structured: { status: 'done', replayed: false, result } }, 'ok');
  } catch (err: any) {
    const message = err instanceof McpToolError ? err.message : 'error';
    await withTenant(actor.tenantId, trx => trx.updateTable('mcp_write_requests')
      .set({ status: 'failed', result: JSON.stringify({ error: message }) as any, completed_at: new Date() })
      .where('id', '=', existing.id).where('tenant_id', '=', actor.tenantId).execute());
    throw err;
  }
}
