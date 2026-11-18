/**
 * Hudumika MCP gateway — transport, account linking and management.
 *
 *   POST /mcp                                   Streamable HTTP (JSON responses), Bearer MCP token
 *   GET  /mcp                                   event stream for list_changed notifications
 *   DELETE /mcp                                 end an Mcp-Session-Id session
 *   GET  /.well-known/oauth-protected-resource   RFC 9728 (also …/mcp)
 *   GET  /.well-known/oauth-authorization-server RFC 8414
 *   POST /v1/mcp/oauth/register                 RFC 7591 dynamic client registration
 *   GET  /v1/mcp/oauth/authorize/info           consent screen data (signed-in session)
 *   POST /v1/mcp/oauth/authorize/approve        creates/updates the connection, issues a code
 *   POST /v1/mcp/oauth/token                    authorization_code (PKCE S256) / refresh_token
 *   POST /v1/mcp/oauth/revoke                   RFC 7009
 *   /v1/mcp/me/*     the caller's own connections (staff and customers)
 *   /v1/mcp/admin/*  workspace admins: catalog, policy, tools, connections, call history
 *
 * Authorization codes and refresh tokens are stored hashed in Postgres
 * (mcp_oauth_codes / mcp_refresh_tokens) and consumed atomically.
 *
 * MCP access tokens are RS256 JWTs from the Ondi issuer with token_use 'mcp'.
 * authenticate() (middleware/auth.ts) accepts only token_use 'access' for
 * Ondi tokens, so an MCP token can never be replayed against the REST API.
 * Each token names its connection (cid); every request re-reads that row,
 * so revocation and policy changes take effect immediately.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { ALL_APP_IDS } from '@hudumika/types';
import { dbPlatform, withTenant } from '../db/client.js';
import { env } from '../config/env.js';
import { signJwt, verifyJwt, verifyPkce, issuerUrl } from '../lib/oidc.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { requireRole } from '../middleware/rbac.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { MCP_TOOLS, MCP_TOOL_BY_ID, MCP_EXCLUDED_APPS, MCP_RECORD_KINDS, setMcpAppOrigin } from '../lib/mcp/tools.js';
import { MCP_PROMPTS } from '../lib/mcp/prompts.js';
import type { McpTool } from '../lib/mcp/types.js';
import {
  MCP_SCOPES, McpAuthError, currentCustomerLink, entitlementDecision, getToolOverrides, getWorkspacePolicy, isConnectableRole,
  listToolsFor, mcpEvents, mcpTenantChanged, resolveActor, runTool, toolDefaultEnabled, type McpActor,
} from '../services/mcp-gateway.service.js';

const SERVER_VERSION = '1.0.0';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const ACCESS_TTL = 60 * 60;
const REFRESH_TTL = 30 * 24 * 60 * 60;
const CODE_TTL = 120;
const ADMIN = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const MAX_STREAMS_PER_CONNECTION = 3;
const STREAM_RECHECK_MS = 30_000;
const STREAM_MAX_MS = 60 * 60 * 1000;

/** Codes and refresh tokens live in Postgres (migration 915), hashed, and are
 *  consumed with DELETE … RETURNING — single-use without Redis. */
const hashSecret = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export const mcpResourceUrl = () => `${issuerUrl()}/mcp`;
const metadataUrl = () => `${issuerUrl()}/.well-known/oauth-protected-resource/mcp`;

/** The public MCP name. Dots are not accepted by every client (OpenAI tool
 *  names are [A-Za-z0-9_-]), so `clearos.list_shipments` is exposed as
 *  `clearos__list_shipments`; the dotted id stays the stable key. */
export const mcpName = (id: string) => MCP_TOOL_BY_ID.get(id)?.name ?? id.replace('.', '__');
const NAME_TO_ID = new Map(MCP_TOOLS.map(t => [mcpName(t.id), t.id]));

function scopesOf(raw: unknown): string[] {
  const list = String(raw ?? '').split(/\s+/).filter(Boolean);
  return [...new Set(list.length ? list : ['mcp:read'])];
}

function parseRedirectUris(raw: unknown): string[] {
  try { return Array.isArray(raw) ? raw : JSON.parse(String(raw ?? '[]')); } catch { return []; }
}

/** https anywhere; http only to a loopback host; private-use schemes for native apps. */
function acceptableRedirectUri(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !['javascript:', 'data:', 'file:', 'blob:', 'about:', 'vbscript:', 'ws:', 'wss:', 'ftp:'].includes(u.protocol);
}

async function loadClient(clientId: string) {
  return dbPlatform.selectFrom('ondi_oauth_clients').selectAll().where('client_id', '=', clientId).executeTakeFirst();
}

function toolView(t: McpTool) {
  return {
    id: t.id, mcp_name: mcpName(t.id), app: t.app, title: t.title, description: t.description, access: t.access,
    actors: t.actors, roles: t.roles ?? null, routes: t.routes, entitlement: t.entitlement,
    destructive: !!t.destructive, open_world: !!t.openWorld,
    default_enabled: toolDefaultEnabled(t),
  };
}

function bearerChallenge(reply: FastifyReply, status: 401 | 403, message: string, extra = '') {
  reply.header('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl()}"${extra}`);
  return reply.status(status).send({ error: status === 401 ? 'invalid_token' : 'insufficient_scope', error_description: message });
}

function allowedOrigins(): Set<string> {
  return new Set([issuerUrl(), ...env.CORS_ORIGINS.split(',').map(s => s.trim().replace(/\/+$/, ''))].filter(Boolean));
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────
type RpcId = string | number | null;
const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: RpcId, code: number, message: string, data?: unknown) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } });

function toolDescriptor(t: McpTool) {
  return {
    name: mcpName(t.id),
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    outputSchema: t.outputSchema,
    annotations: {
      title: t.title,
      readOnlyHint: t.access === 'read',
      destructiveHint: !!t.destructive,
      // Writes are idempotent per idempotency_key (a retry replays the result).
      idempotentHint: true,
      openWorldHint: !!t.openWorld,
    },
    _meta: { 'hudumika/toolId': t.id, 'hudumika/app': t.app },
  };
}

export async function mcpRoutes(fastify: FastifyInstance) {
  setMcpAppOrigin(() => issuerUrl());
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  // ── Discovery metadata ────────────────────────────────────────────────
  const protectedResource = async () => ({
    resource: mcpResourceUrl(),
    authorization_servers: [issuerUrl()],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Hudumika',
    resource_documentation: `${issuerUrl()}/developer/mcp`,
  });
  fastify.get('/.well-known/oauth-protected-resource', protectedResource);
  fastify.get('/.well-known/oauth-protected-resource/mcp', protectedResource);

  const authServer = async () => {
    const issuer = issuerUrl();
    return {
      issuer,
      authorization_endpoint: `${issuer}/mcp/authorize`,
      token_endpoint: `${issuer}/v1/mcp/oauth/token`,
      registration_endpoint: `${issuer}/v1/mcp/oauth/register`,
      revocation_endpoint: `${issuer}/v1/mcp/oauth/revoke`,
      jwks_uri: `${issuer}/jwks.json`,
      scopes_supported: [...MCP_SCOPES],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: false,
    };
  };
  fastify.get('/.well-known/oauth-authorization-server', authServer);
  fastify.get('/.well-known/oauth-authorization-server/mcp', authServer);

  // ── Streamable HTTP endpoint ──────────────────────────────────────────
  //
  // POST /mcp    JSON-RPC requests (single or, for 2025-03-26 clients, a batch); JSON responses.
  // GET  /mcp    text/event-stream for server → client notifications (list_changed).
  // DELETE /mcp  ends the Mcp-Session-Id session.
  //
  // Every method authenticates the bearer token and re-resolves the actor first.

  type Authed = { actor: McpActor; sessionId: string | null };

  /** Bearer token → actor, plus the session header if any. Sends the error reply itself and returns null on failure. */
  async function authenticateMcp(request: FastifyRequest, reply: FastifyReply): Promise<Authed | null> {
    // DNS-rebinding protection: a browser page may only call from a known origin.
    const origin = request.headers.origin;
    if (origin && !allowedOrigins().has(String(origin).replace(/\/+$/, ''))) {
      reply.status(403).send(rpcError(null, -32000, 'Origin not allowed'));
      return null;
    }
    const pv = request.headers['mcp-protocol-version'];
    if (typeof pv === 'string' && !SUPPORTED_PROTOCOL_VERSIONS.includes(pv)) {
      reply.status(400).send(rpcError(null, -32000, `Unsupported MCP-Protocol-Version: ${pv}`));
      return null;
    }
    const auth = request.headers.authorization;
    const bearer = typeof auth === 'string' && /^Bearer\s/i.test(auth) ? auth.slice(7).trim() : '';
    if (!bearer) { bearerChallenge(reply, 401, 'Sign in to Hudumika to use this connector.'); return null; }
    const claims = await verifyJwt(bearer);
    if (!claims || claims.token_use !== 'mcp' || claims.iss !== issuerUrl() || claims.resource !== mcpResourceUrl() ||
        typeof claims.cid !== 'string' || typeof claims.sub !== 'string' || typeof claims.tenant_id !== 'string' || typeof claims.aud !== 'string') {
      bearerChallenge(reply, 401, 'The access token is invalid or expired.', ', error="invalid_token"');
      return null;
    }
    let actor: McpActor;
    try {
      actor = await resolveActor(claims as any, request.ip);
    } catch (err) {
      if (err instanceof McpAuthError) {
        if (err.status === 401) bearerChallenge(reply, 401, err.message, ', error="invalid_token"');
        else reply.status(403).send(rpcError(null, -32001, err.message));
        return null;
      }
      throw err;
    }
    const raw = request.headers['mcp-session-id'];
    const sessionId = typeof raw === 'string' && raw ? raw : null;
    if (sessionId && !(await touchSession(actor, sessionId))) {
      // Unknown, ended or another connection's: the client must initialize again.
      reply.status(404).send(rpcError(null, -32001, 'Session not found. Initialize a new session.'));
      return null;
    }
    return { actor, sessionId };
  }

  /** True when the session exists, belongs to this connection and is live; refreshes last_seen_at. */
  async function touchSession(actor: McpActor, id: string): Promise<boolean> {
    if (id.length > 100) return false;
    return withTenant(actor.tenantId, async trx => {
      const row = await trx.selectFrom('mcp_sessions').select(['id', 'last_seen_at', 'ended_at'])
        .where('id', '=', id).where('tenant_id', '=', actor.tenantId).where('connection_id', '=', actor.connectionId).executeTakeFirst();
      if (!row || row.ended_at) return false;
      const idleMs = Date.now() - new Date(row.last_seen_at).getTime();
      if (idleMs > SESSION_IDLE_MS) {
        await trx.updateTable('mcp_sessions').set({ ended_at: new Date() }).where('id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
        return false;
      }
      if (idleMs > 60_000) await trx.updateTable('mcp_sessions').set({ last_seen_at: new Date() }).where('id', '=', id).where('tenant_id', '=', actor.tenantId).execute();
      return true;
    });
  }

  async function allowedToolIds(actor: McpActor): Promise<Set<string>> {
    return new Set((await listToolsFor(actor)).map(t => t.id));
  }

  /** Static resources plus one template per record kind whose detail tool is available. */
  function resourceTemplates(allowed: Set<string>) {
    return Object.entries(MCP_RECORD_KINDS).filter(([, k]) => allowed.has(k.tool)).map(([kind, k]) => ({
      uriTemplate: `hudumika://${kind}/{id}`, name: `${kind}`, title: k.kind,
      description: `One ${k.kind.toLowerCase()} by id, as returned by ${mcpName(k.tool)} (same access rules).`, mimeType: 'application/json',
    }));
  }

  const STATIC_RESOURCES = [
    { uri: 'hudumika://workspace/profile', name: 'workspace-profile', title: 'This connection', description: 'Who you are connected as, and which apps and tools this connection can use.', mimeType: 'application/json' },
    { uri: 'hudumika://guide/changes', name: 'guide-changes', title: 'How changes are confirmed', description: 'The two-step confirmation and idempotency rules for write tools.', mimeType: 'text/markdown' },
  ];

  async function readResource(actor: McpActor, uri: string): Promise<{ ok: true; contents: unknown[] } | { ok: false; code: number; message: string }> {
    if (uri === 'hudumika://workspace/profile') {
      const tools = await listToolsFor(actor);
      const apps: Record<string, string[]> = {};
      for (const t of tools) (apps[t.app] ??= []).push(mcpName(t.id));
      const text = JSON.stringify({
        name: actor.name, account_type: actor.actorType, role: actor.actorType === 'staff' ? actor.role : null,
        scopes: actor.scopes, can_make_changes: actor.scopes.includes('mcp:write'), apps,
      }, null, 2);
      return { ok: true, contents: [{ uri, mimeType: 'application/json', text }] };
    }
    if (uri === 'hudumika://guide/changes') {
      const text = [
        '# Making changes through Hudumika',
        '',
        '- Write tools are off until a workspace admin enables them, and need a connection that was allowed to make changes.',
        '- The first call (without `confirmation_token`) changes nothing. It returns a `summary` and a `confirmation_token` valid for 10 minutes.',
        '- Show the summary to the person. Only if they agree, call the same tool again with the same arguments plus `confirmation_token`.',
        '- `idempotency_key` identifies one intended change. Retrying with the same key returns the first result; using it with different arguments is refused.',
      ].join('\n');
      return { ok: true, contents: [{ uri, mimeType: 'text/markdown', text }] };
    }
    const m = /^hudumika:\/\/([a-z]+)\/([0-9a-fA-F-]{36})$/.exec(uri);
    const kind = m ? MCP_RECORD_KINDS[m[1]] : undefined;
    if (!m || !kind) return { ok: false, code: -32002, message: `Resource not found: ${uri}` };
    const r = await runTool(fastify, actor, kind.tool, { id: m[2] });
    if (r.isError) return { ok: false, code: -32002, message: r.message };
    return { ok: true, contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(r.structured) }] };
  }

  async function promptsFor(actor: McpActor) {
    const allowed = await allowedToolIds(actor);
    return MCP_PROMPTS.filter(p => p.actors.includes(actor.actorType) && p.requires.every(id => allowed.has(id)));
  }

  /** One JSON-RPC message → its response, or null for a notification. */
  async function handleRpc(authed: Authed, msg: any, reply: FastifyReply): Promise<unknown | null> {
    const { actor } = authed;
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      // A response or notification from the client needs no answer.
      if (msg && msg.jsonrpc === '2.0' && (('result' in msg) || ('error' in msg))) return null;
      return rpcError(msg?.id ?? null, -32600, 'Invalid JSON-RPC request.');
    }
    if (msg.id === undefined || msg.id === null) return null;
    const id: RpcId = msg.id;
    const p = msg.params ?? {};
    switch (msg.method) {
      case 'initialize': {
        const requested = p.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
        const sessionId = crypto.randomBytes(24).toString('base64url');
        await withTenant(actor.tenantId, trx => trx.insertInto('mcp_sessions').values({
          id: sessionId, tenant_id: actor.tenantId, connection_id: actor.connectionId, protocol_version: protocolVersion,
        }).execute());
        reply.header('Mcp-Session-Id', sessionId);
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: true }, resources: { listChanged: true, subscribe: false }, prompts: { listChanged: true } },
          serverInfo: { name: 'hudumika', title: 'Hudumika', version: SERVER_VERSION },
          instructions: `Hudumika workspace tools for ${actor.name} (${actor.actorType === 'customer' ? 'customer account' : actor.role}). `
            + 'Tools are named <app>__<action>; `search` and `fetch` find and open records across apps. Only tools this account may use are listed; results contain only records it is allowed to see. '
            + 'Write tools need two calls: the first returns a summary and confirmation_token — show the summary to the user and call again with the token only if they agree.',
        });
      }
      case 'ping': return rpcResult(id, {});
      case 'tools/list': {
        const tools = await listToolsFor(actor);
        return rpcResult(id, { tools: tools.map(toolDescriptor) });
      }
      case 'tools/call': {
        const name = String(p.name ?? '');
        const toolId = NAME_TO_ID.get(name) ?? (MCP_TOOL_BY_ID.has(name) ? name : null);
        if (!toolId) return rpcError(id, -32602, `Unknown tool: ${name}`);
        const r = await runTool(fastify, actor, toolId, p.arguments ?? {});
        if (r.isError) return rpcResult(id, { content: [{ type: 'text', text: r.message }], isError: true, _meta: { 'hudumika/errorCode': r.code } });
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(r.structured) }], structuredContent: r.structured, isError: false });
      }
      case 'resources/list': return rpcResult(id, { resources: STATIC_RESOURCES });
      case 'resources/templates/list': return rpcResult(id, { resourceTemplates: resourceTemplates(await allowedToolIds(actor)) });
      case 'resources/read': {
        const uri = typeof p.uri === 'string' ? p.uri : '';
        if (!uri) return rpcError(id, -32602, 'uri is required.');
        const r = await readResource(actor, uri);
        return r.ok ? rpcResult(id, { contents: r.contents }) : rpcError(id, r.code, r.message, { uri });
      }
      case 'prompts/list': {
        const prompts = await promptsFor(actor);
        return rpcResult(id, { prompts: prompts.map(pr => ({ name: pr.name, title: pr.title, description: pr.description, arguments: pr.arguments })) });
      }
      case 'prompts/get': {
        const prompt = (await promptsFor(actor)).find(pr => pr.name === p.name);
        if (!prompt) return rpcError(id, -32602, `Unknown prompt: ${String(p.name ?? '')}`);
        const args: Record<string, string> = {};
        const given = p.arguments && typeof p.arguments === 'object' ? p.arguments : {};
        for (const [k, v] of Object.entries(given)) {
          if (!prompt.arguments.some(a => a.name === k)) return rpcError(id, -32602, `Unknown argument: ${k}`);
          if (typeof v !== 'string' || v.length > 500) return rpcError(id, -32602, `${k} must be a string of at most 500 characters.`);
          args[k] = v;
        }
        const missing = prompt.arguments.find(a => a.required && !args[a.name]?.trim());
        if (missing) return rpcError(id, -32602, `${missing.name} is required.`);
        return rpcResult(id, { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text: prompt.render(args) } }] });
      }
      case 'logging/setLevel': return rpcResult(id, {});
      default:
        return rpcError(id, -32601, `Method not found: ${msg.method}`);
    }
  }

  fastify.post('/mcp', { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (request, reply) => {
    const authed = await authenticateMcp(request, reply);
    if (!authed) return reply;
    const body = request.body as any;
    if (Array.isArray(body)) {
      // JSON-RPC batches were part of MCP 2025-03-26 (removed in 2025-06-18).
      if (!body.length || body.length > 20) return reply.status(400).send(rpcError(null, -32600, 'A batch must contain 1–20 messages.'));
      if (body.some(m => m?.method === 'initialize')) return reply.status(400).send(rpcError(null, -32600, 'initialize cannot be batched.'));
      const out: unknown[] = [];
      for (const m of body) { const r = await handleRpc(authed, m, reply); if (r) out.push(r); }
      return out.length ? reply.send(out) : reply.status(202).send();
    }
    const r = await handleRpc(authed, body, reply);
    if (r === null) return reply.status(202).send();
    if ((r as any).error?.code === -32600) return reply.status(400).send(r);
    return reply.send(r);
  });

  fastify.delete('/mcp', async (request, reply) => {
    const authed = await authenticateMcp(request, reply);
    if (!authed) return reply;
    if (!authed.sessionId) return reply.status(400).send(rpcError(null, -32600, 'Mcp-Session-Id header is required.'));
    await withTenant(authed.actor.tenantId, trx => trx.updateTable('mcp_sessions').set({ ended_at: new Date() })
      .where('id', '=', authed.sessionId!).where('tenant_id', '=', authed.actor.tenantId).execute());
    return reply.status(204).send();
  });

  // Server → client notification stream. Sends tools/prompts/resources
  // list_changed when what this connection may use changes (a workspace
  // switch, a role or plan change), and ends when the connection stops being
  // valid (revoked, user deactivated, policy off). No requests are ever sent
  // to the client on this stream, so there is nothing to resume.
  const openStreams = new Map<string, number>();
  fastify.get('/mcp', async (request, reply) => {
    const accept = String(request.headers.accept ?? '');
    if (!accept.includes('text/event-stream')) return reply.status(406).send({ error: 'GET /mcp opens an event stream: send Accept: text/event-stream.' });
    const authed = await authenticateMcp(request, reply);
    if (!authed) return reply;
    const { actor } = authed;
    const open = openStreams.get(actor.connectionId) ?? 0;
    if (open >= MAX_STREAMS_PER_CONNECTION) return reply.status(429).send({ error: 'Too many open streams for this connection.' });
    openStreams.set(actor.connectionId, open + 1);

    const claims = { tenant_id: actor.tenantId, sub: actor.userId, cid: actor.connectionId, aud: actor.clientId, scope: actor.scopes.join(' ') };
    const fingerprint = async (a: McpActor) => crypto.createHash('sha256').update((await listToolsFor(a)).map(t => t.id).sort().join(',')).digest('hex');
    let last = await fingerprint(actor);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      ...(authed.sessionId ? { 'Mcp-Session-Id': authed.sessionId } : {}),
    });
    res.write(': connected\n\n');

    let closed = false;
    let checking = false;
    const send = (method: string) => res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method })}\n\n`);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(keepalive); clearInterval(poll); clearTimeout(lifetime);
      mcpEvents.off('tenant-changed', onTenant);
      openStreams.set(actor.connectionId, Math.max(0, (openStreams.get(actor.connectionId) ?? 1) - 1));
      if (!res.writableEnded) res.end();
    };
    let again = false;
    const recheck = async (): Promise<void> => {
      if (closed) return;
      // A change that arrives mid-check must not be dropped: run once more after.
      if (checking) { again = true; return; }
      checking = true;
      try {
        const now = await resolveActor(claims, actor.ip);
        const fp = await fingerprint(now);
        if (fp !== last) {
          last = fp;
          send('notifications/tools/list_changed');
          send('notifications/prompts/list_changed');
          send('notifications/resources/list_changed');
        }
      } catch {
        close(); // revoked, deactivated, suspended or policy off: the stream ends with the grant
      } finally {
        checking = false;
        if (again && !closed) { again = false; void recheck(); }
      }
    };
    const onTenant = (tenantId: string) => { if (tenantId === actor.tenantId) void recheck(); };
    mcpEvents.on('tenant-changed', onTenant);
    const keepalive = setInterval(() => { if (!closed) res.write(': keepalive\n\n'); }, 20_000);
    const poll = setInterval(() => void recheck(), STREAM_RECHECK_MS);
    const lifetime = setTimeout(close, STREAM_MAX_MS);
    request.raw.on('close', close);
  });

  // ── OAuth: dynamic client registration (RFC 7591) ─────────────────────
  fastify.post('/v1/mcp/oauth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = z.object({
      redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
      client_name: z.string().max(200).optional(),
      client_uri: z.string().url().max(500).optional(),
      software_id: z.string().max(200).optional(),
      token_endpoint_auth_method: z.enum(['none', 'client_secret_post', 'client_secret_basic']).default('none'),
      grant_types: z.array(z.string()).optional(),
      response_types: z.array(z.string()).optional(),
      scope: z.string().optional(),
    }).passthrough().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_client_metadata', error_description: parsed.error.issues[0]?.message ?? 'Invalid client metadata' });
    const b = parsed.data;
    const bad = b.redirect_uris.find(u => !acceptableRedirectUri(u));
    if (bad) return reply.status(400).send({ error: 'invalid_redirect_uri', error_description: `Redirect URI not allowed: ${bad}. Use https, a loopback http address, or an app scheme.` });
    const grants = b.grant_types ?? ['authorization_code', 'refresh_token'];
    if (grants.some(g => !['authorization_code', 'refresh_token'].includes(g))) return reply.status(400).send({ error: 'invalid_client_metadata', error_description: 'Only authorization_code and refresh_token grants are supported.' });

    const clientId = `mcp_${crypto.randomBytes(16).toString('hex')}`;
    const secret = b.token_endpoint_auth_method === 'none' ? null : crypto.randomBytes(32).toString('base64url');
    // eslint-disable-next-line no-control-regex
    const name = (b.client_name ?? 'MCP client').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || 'MCP client';
    await dbPlatform.insertInto('ondi_oauth_clients').values({
      client_id: clientId, client_secret_hash: secret ? hashPassword(secret) : null, name, logo_url: null,
      redirect_uris: JSON.stringify(b.redirect_uris), first_party: false, registered_via: 'mcp_dcr',
      client_uri: b.client_uri ?? null, software_id: b.software_id ?? null,
    }).execute();
    return reply.status(201).send({
      client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: name, redirect_uris: b.redirect_uris, grant_types: grants, response_types: ['code'],
      token_endpoint_auth_method: b.token_endpoint_auth_method, scope: MCP_SCOPES.join(' '),
    });
  });

  // ── OAuth: authorization (consent) ────────────────────────────────────
  const authorizeSchema = z.object({
    client_id: z.string().min(1).max(200),
    redirect_uri: z.string().min(1).max(2000),
    response_type: z.literal('code').default('code'),
    scope: z.string().max(200).optional(),
    state: z.string().max(2000).optional(),
    code_challenge: z.string().min(43).max(128),
    code_challenge_method: z.literal('S256'),
    resource: z.string().max(500).optional(),
  });

  async function checkAuthorizeRequest(request: FastifyRequest, reply: FastifyReply, source: unknown) {
    const q = authorizeSchema.safeParse(source);
    if (!q.success) { reply.status(400).send({ error: 'invalid_request', error_description: 'This connection link is missing PKCE (S256) or other required parameters.' }); return null; }
    const client = await loadClient(q.data.client_id);
    if (!client) { reply.status(400).send({ error: 'invalid_client', error_description: 'Unknown client. The app must register with Hudumika first.' }); return null; }
    if (!parseRedirectUris(client.redirect_uris).includes(q.data.redirect_uri)) { reply.status(400).send({ error: 'invalid_request', error_description: 'redirect_uri is not registered for this client.' }); return null; }
    if (q.data.resource && q.data.resource.replace(/\/+$/, '') !== mcpResourceUrl()) { reply.status(400).send({ error: 'invalid_target', error_description: 'This server only issues tokens for its own MCP endpoint.' }); return null; }
    const scopes = scopesOf(q.data.scope);
    if (scopes.some(s => !(MCP_SCOPES as readonly string[]).includes(s))) { reply.status(400).send({ error: 'invalid_scope', error_description: `Supported scopes: ${MCP_SCOPES.join(', ')}` }); return null; }

    const u = request.user;
    if ((u as any).impersonated_by) { reply.status(403).send({ error: 'access_denied', error_description: 'You cannot connect an AI client while impersonating someone.' }); return null; }
    if (!isConnectableRole(u.role)) { reply.status(403).send({ error: 'access_denied', error_description: 'Platform operator accounts cannot connect MCP clients. Sign in with a workspace account.' }); return null; }
    const user = await withTenant(u.tenant_id, trx => trx.selectFrom('users').select(['id', 'active', 'email', 'customer_id', 'role', 'name'] as any)
      .where('id', '=', u.sub).where('tenant_id', '=', u.tenant_id).executeTakeFirst()) as any;
    if (!user || !user.active) { reply.status(403).send({ error: 'access_denied', error_description: 'This account cannot connect.' }); return null; }
    const actorType = user.role === 'CUSTOMER' ? 'customer' as const : 'staff' as const;
    const policy = await getWorkspacePolicy(u.tenant_id);
    if (actorType === 'staff' && !policy.staff_enabled) { reply.status(403).send({ error: 'access_denied', error_description: 'Your workspace admin has turned off AI connections.' }); return null; }
    if (actorType === 'customer' && !policy.customers_enabled) { reply.status(403).send({ error: 'access_denied', error_description: 'Your provider has not enabled AI connections for customer accounts.' }); return null; }
    const customerId = actorType === 'customer' ? await withTenant(u.tenant_id, trx => currentCustomerLink(trx, u.tenant_id, user)) : null;
    if (actorType === 'customer' && !customerId) { reply.status(403).send({ error: 'access_denied', error_description: 'This login is not linked to a customer account.' }); return null; }
    return { q: q.data, client, scopes, user, actorType, customerId };
  }

  fastify.get('/v1/mcp/oauth/authorize/info', { preHandler: fastify.authenticate }, async (request, reply) => {
    const r = await checkAuthorizeRequest(request, reply, request.query);
    if (!r) return reply;
    const tenant = await dbPlatform.selectFrom('tenants').select(['name']).where('id', '=', request.user.tenant_id).executeTakeFirst();
    const toolCount = MCP_TOOLS.filter(t => t.actors.includes(r.actorType)).length;
    return {
      client: {
        client_id: r.client.client_id, name: r.client.name, verified: r.client.registered_via !== 'mcp_dcr',
        redirect_host: (() => { try { return new URL(r.q.redirect_uri).host || new URL(r.q.redirect_uri).protocol; } catch { return r.q.redirect_uri; } })(),
      },
      workspace: { id: request.user.tenant_id, name: tenant?.name ?? 'Workspace' },
      account: { name: r.user.name, email: r.user.email, actor_type: r.actorType, role: r.user.role },
      requested_scopes: r.scopes,
      tools_in_catalog: toolCount,
    };
  });

  fastify.post('/v1/mcp/oauth/authorize/approve', { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const r = await checkAuthorizeRequest(request, reply, body);
    if (!r) return reply;
    // The person may untick write access on the consent screen.
    const granted = r.scopes.filter(s => s !== 'mcp:write' || body.allow_write !== false);
    if (!granted.includes('mcp:read')) granted.unshift('mcp:read');
    const u = request.user;

    const connectionId = await withTenant(u.tenant_id, async trx => {
      const existing = await trx.selectFrom('mcp_connections').select('id')
        .where('tenant_id', '=', u.tenant_id).where('user_id', '=', u.sub).where('client_id', '=', r.client.client_id)
        .where('status', '=', 'active').executeTakeFirst();
      if (existing) {
        await trx.updateTable('mcp_connections').set({ scopes: JSON.stringify(granted), customer_id: r.customerId })
          .where('id', '=', existing.id).where('tenant_id', '=', u.tenant_id).execute();
        return existing.id;
      }
      const row = await trx.insertInto('mcp_connections').values({
        tenant_id: u.tenant_id, user_id: u.sub, actor_type: r.actorType, customer_id: r.customerId,
        client_id: r.client.client_id, scopes: JSON.stringify(granted),
      }).returning('id').executeTakeFirstOrThrow();
      return row.id;
    });
    await recordAuthEvent(u.tenant_id, u.sub, 'oauth_consent_granted', { metadata: { via: 'mcp_authorize', client_id: r.client.client_id, connection_id: connectionId, scopes: granted } });

    const code = crypto.randomBytes(32).toString('base64url');
    await dbPlatform.deleteFrom('mcp_oauth_codes').where('expires_at', '<', new Date()).execute();
    await dbPlatform.insertInto('mcp_oauth_codes').values({
      code_hash: hashSecret(code), connection_id: connectionId, tenant_id: u.tenant_id, user_id: u.sub,
      client_id: r.client.client_id, redirect_uri: r.q.redirect_uri, scope: granted.join(' '),
      code_challenge: r.q.code_challenge, expires_at: new Date(Date.now() + CODE_TTL * 1000),
    }).execute();
    const url = new URL(r.q.redirect_uri);
    url.searchParams.set('code', code);
    if (r.q.state) url.searchParams.set('state', r.q.state);
    url.searchParams.set('iss', issuerUrl());
    return { redirect_url: url.toString() };
  });

  // ── OAuth: token ──────────────────────────────────────────────────────
  async function authenticateClient(request: FastifyRequest, body: Record<string, any>) {
    let clientId = body.client_id as string | undefined;
    let secret = body.client_secret as string | undefined;
    const basic = request.headers.authorization;
    if (typeof basic === 'string' && /^Basic\s/i.test(basic)) {
      const [id, sec] = Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':');
      clientId = decodeURIComponent(id ?? ''); secret = decodeURIComponent(sec ?? '');
    }
    if (!clientId) return null;
    const client = await loadClient(clientId);
    if (!client) return null;
    if (client.client_secret_hash && (!secret || !verifyPassword(secret, client.client_secret_hash))) return null;
    return client;
  }

  async function issueTokens(grant: { connectionId: string; tenantId: string; userId: string; clientId: string; scope: string }) {
    const now = Math.floor(Date.now() / 1000);
    const access = await signJwt({
      iss: issuerUrl(), sub: grant.userId, aud: grant.clientId, tenant_id: grant.tenantId, cid: grant.connectionId,
      scope: grant.scope, resource: mcpResourceUrl(), token_use: 'mcp', jti: crypto.randomUUID(), iat: now, exp: now + ACCESS_TTL,
    });
    const refresh = crypto.randomBytes(32).toString('base64url');
    await dbPlatform.insertInto('mcp_refresh_tokens').values({
      token_hash: hashSecret(refresh), connection_id: grant.connectionId, tenant_id: grant.tenantId, user_id: grant.userId,
      client_id: grant.clientId, scope: grant.scope, expires_at: new Date(Date.now() + REFRESH_TTL * 1000),
    }).execute();
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: grant.scope };
  }

  async function connectionActive(g: { connectionId: string; tenantId: string; userId: string; clientId: string }) {
    const row = await withTenant(g.tenantId, trx => trx.selectFrom('mcp_connections').select(['status', 'user_id', 'client_id'])
      .where('id', '=', g.connectionId).where('tenant_id', '=', g.tenantId).executeTakeFirst());
    return !!row && row.status === 'active' && row.user_id === g.userId && row.client_id === g.clientId;
  }

  fastify.post('/v1/mcp/oauth/token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const body = (request.body ?? {}) as Record<string, any>;
    const client = await authenticateClient(request, body);
    if (!client) return reply.status(401).send({ error: 'invalid_client' });

    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.code_verifier) return reply.status(400).send({ error: 'invalid_request', error_description: 'code and code_verifier are required' });
      const row = await dbPlatform.deleteFrom('mcp_oauth_codes').where('code_hash', '=', hashSecret(String(body.code)))
        .returningAll().executeTakeFirst();
      if (!row || new Date(row.expires_at).getTime() < Date.now()) return reply.status(400).send({ error: 'invalid_grant', error_description: 'Code is invalid or expired' });
      const g = { connectionId: row.connection_id, tenantId: row.tenant_id, userId: row.user_id, clientId: row.client_id, redirectUri: row.redirect_uri, scope: row.scope, codeChallenge: row.code_challenge };
      if (g.clientId !== client.client_id) return reply.status(400).send({ error: 'invalid_grant' });
      if (body.redirect_uri && body.redirect_uri !== g.redirectUri) return reply.status(400).send({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      if (!verifyPkce(String(body.code_verifier), g.codeChallenge)) return reply.status(400).send({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      if (body.resource && String(body.resource).replace(/\/+$/, '') !== mcpResourceUrl()) return reply.status(400).send({ error: 'invalid_target' });
      if (!(await connectionActive(g))) return reply.status(400).send({ error: 'invalid_grant', error_description: 'Connection was revoked' });
      return issueTokens({ connectionId: g.connectionId, tenantId: g.tenantId, userId: g.userId, clientId: g.clientId, scope: g.scope });
    }
    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) return reply.status(400).send({ error: 'invalid_request' });
      const row = await dbPlatform.deleteFrom('mcp_refresh_tokens').where('token_hash', '=', hashSecret(String(body.refresh_token)))
        .returningAll().executeTakeFirst();
      if (!row || new Date(row.expires_at).getTime() < Date.now()) return reply.status(400).send({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired' });
      const g = { connectionId: row.connection_id, tenantId: row.tenant_id, userId: row.user_id, clientId: row.client_id, scope: row.scope };
      if (g.clientId !== client.client_id) return reply.status(400).send({ error: 'invalid_grant' });
      if (!(await connectionActive(g))) return reply.status(400).send({ error: 'invalid_grant', error_description: 'Connection was revoked' });
      // Scope can only shrink on refresh, and never beyond the current grant.
      const conn = await withTenant(g.tenantId, trx => trx.selectFrom('mcp_connections').select('scopes').where('id', '=', g.connectionId).where('tenant_id', '=', g.tenantId).executeTakeFirst());
      const grantScopes: string[] = Array.isArray(conn?.scopes) ? conn!.scopes : JSON.parse(String(conn?.scopes ?? '[]'));
      const requested = body.scope ? scopesOf(body.scope) : String(g.scope).split(' ');
      const scope = requested.filter(s => grantScopes.includes(s)).join(' ') || 'mcp:read';
      return issueTokens({ connectionId: g.connectionId, tenantId: g.tenantId, userId: g.userId, clientId: g.clientId, scope });
    }
    return reply.status(400).send({ error: 'unsupported_grant_type' });
  });

  fastify.post('/v1/mcp/oauth/revoke', async (request) => {
    const body = (request.body ?? {}) as Record<string, any>;
    if (body.token) await dbPlatform.deleteFrom('mcp_refresh_tokens').where('token_hash', '=', hashSecret(String(body.token))).execute();
    return {};
  });

  // ── The caller's own connections (staff and customers) ────────────────
  async function listConnections(tenantId: string, filter: { userId?: string }) {
    return withTenant(tenantId, async trx => {
      let q = trx.selectFrom('mcp_connections as c').leftJoin('users as u', 'u.id', 'c.user_id')
        .select(['c.id', 'c.user_id', 'c.actor_type', 'c.customer_id', 'c.client_id', 'c.scopes', 'c.status', 'c.created_at', 'c.last_used_at', 'c.revoked_at', 'c.revoke_reason', 'u.name as user_name', 'u.email as user_email', 'u.avatar_url as user_avatar_url'] as any)
        .where('c.tenant_id', '=', tenantId).orderBy('c.created_at', 'desc').limit(500);
      if (filter.userId) q = q.where('c.user_id', '=', filter.userId);
      const rows = await q.execute() as any[];
      const ids = [...new Set(rows.map(r => r.client_id))];
      const clients = ids.length ? await dbPlatform.selectFrom('ondi_oauth_clients').select(['client_id', 'name', 'registered_via']).where('client_id', 'in', ids).execute() : [];
      const byId = new Map(clients.map(c => [c.client_id, c]));
      return rows.map(r => ({
        ...r, scopes: Array.isArray(r.scopes) ? r.scopes : JSON.parse(String(r.scopes ?? '[]')),
        client_name: byId.get(r.client_id)?.name ?? r.client_id, client_verified: byId.get(r.client_id)?.registered_via !== 'mcp_dcr',
      }));
    });
  }

  async function revokeConnection(tenantId: string, id: string, by: string, reason: string, onlyUserId?: string) {
    return withTenant(tenantId, async trx => {
      let q = trx.updateTable('mcp_connections').set({ status: 'revoked', revoked_at: new Date(), revoked_by: by, revoke_reason: reason })
        .where('id', '=', id).where('tenant_id', '=', tenantId).where('status', '=', 'active');
      if (onlyUserId) q = q.where('user_id', '=', onlyUserId);
      const row = await q.returning(['id', 'user_id', 'client_id']).executeTakeFirst();
      if (row) await dbPlatform.deleteFrom('mcp_refresh_tokens').where('connection_id', '=', row.id).execute();
      if (row) mcpTenantChanged(tenantId);
      return row;
    });
  }

  fastify.register(async me => {
    me.addHook('preHandler', fastify.authenticate);
    me.get('/v1/mcp/me/connections', async request => ({ data: await listConnections(request.user.tenant_id, { userId: request.user.sub }), mcp_url: mcpResourceUrl() }));
    me.post<{ Params: { id: string } }>('/v1/mcp/me/connections/:id/revoke', async (request, reply) => {
      if (!z.string().uuid().safeParse(request.params.id).success) return reply.status(404).send({ error: 'Not found' });
      const row = await revokeConnection(request.user.tenant_id, request.params.id, request.user.sub, 'Revoked by the account owner', request.user.sub);
      if (!row) return reply.status(404).send({ error: 'Not found' });
      await recordAuthEvent(request.user.tenant_id, request.user.sub, 'oauth_consent_revoked', { metadata: { via: 'mcp', connection_id: row.id, client_id: row.client_id } });
      return { success: true };
    });

    // Read-only catalog for any staff member (Developer ▸ MCP setup and "who can use what").
    me.get('/v1/mcp/catalog', async (request, reply) => {
      if (request.user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for this account type.' });
      return catalogFor(request.user.tenant_id, request.user, false);
    });
  });

  // ── Workspace admin ───────────────────────────────────────────────────
  async function catalogFor(tenantId: string, user: FastifyRequest['user'], includeSettings: boolean) {
    const overrides = await getToolOverrides(tenantId);
    const cache = new Map<string, string | null>();
    // Entitlement is the workspace's, judged as the requesting admin/staff.
    const probe = { userId: user.sub, tenantId, role: (user.role === 'SUPER_ADMIN' ? 'TENANT_ADMIN' : user.role) as any, email: user.email, name: user.name };
    const apps = [];
    for (const appId of ALL_APP_IDS) {
      const tools = MCP_TOOLS.filter(t => t.app === appId);
      const excluded = MCP_EXCLUDED_APPS[appId];
      let entitlement: { entitled: boolean; reason: string | null } | null = null;
      if (tools.length) {
        const reason = await entitlementDecision(probe, tools[0], cache);
        entitlement = { entitled: !reason, reason };
      }
      apps.push({
        app: appId,
        status: excluded ? excluded.status : tools.length ? 'implemented' : 'blocked',
        note: excluded?.reason ?? null,
        entitlement,
        tools: tools.map(t => ({ ...toolView(t), enabled: overrides.get(t.id) ?? toolDefaultEnabled(t), overridden: overrides.has(t.id) })),
      });
    }
    return { mcp_url: mcpResourceUrl(), policy: includeSettings ? await getWorkspacePolicy(tenantId) : undefined, apps };
  }

  fastify.register(async admin => {
    admin.addHook('preHandler', fastify.authenticate);
    admin.addHook('preHandler', requireRole(...ADMIN));

    admin.get('/v1/mcp/admin/catalog', async request => catalogFor(request.user.tenant_id, request.user, true));

    admin.put('/v1/mcp/admin/policy', async (request, reply) => {
      const b = z.object({ staff_enabled: z.boolean().optional(), customers_enabled: z.boolean().optional() }).safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid policy' });
      const tenantId = request.user.tenant_id;
      const cur = await getWorkspacePolicy(tenantId);
      const next = { staff_enabled: b.data.staff_enabled ?? cur.staff_enabled, customers_enabled: b.data.customers_enabled ?? cur.customers_enabled };
      await withTenant(tenantId, trx => trx.insertInto('mcp_workspace_policy')
        .values({ tenant_id: tenantId, ...next, updated_by: request.user.sub, updated_at: new Date() })
        .onConflict(oc => oc.column('tenant_id').doUpdateSet({ ...next, updated_by: request.user.sub, updated_at: new Date() })).execute());
      mcpTenantChanged(tenantId);
      return getWorkspacePolicy(tenantId);
    });

    admin.put<{ Params: { toolId: string } }>('/v1/mcp/admin/tools/:toolId', async (request, reply) => {
      const tool = MCP_TOOL_BY_ID.get(request.params.toolId);
      // Only catalog tools exist; platform-only/internal surfaces have no
      // tools, so there is nothing a tenant admin could enable for them.
      if (!tool) return reply.status(404).send({ error: 'Unknown tool. Platform and internal tools cannot be enabled for a workspace.' });
      const b = z.object({ enabled: z.boolean() }).safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'enabled (boolean) is required' });
      const tenantId = request.user.tenant_id;
      await withTenant(tenantId, trx => trx.insertInto('mcp_tool_settings')
        .values({ tenant_id: tenantId, tool_id: tool.id, enabled: b.data.enabled, updated_by: request.user.sub, updated_at: new Date() })
        .onConflict(oc => oc.columns(['tenant_id', 'tool_id']).doUpdateSet({ enabled: b.data.enabled, updated_by: request.user.sub, updated_at: new Date() })).execute());
      mcpTenantChanged(tenantId);
      return { tool_id: tool.id, enabled: b.data.enabled };
    });

    admin.get('/v1/mcp/admin/connections', async request => ({ data: await listConnections(request.user.tenant_id, {}) }));

    admin.post<{ Params: { id: string } }>('/v1/mcp/admin/connections/:id/revoke', async (request, reply) => {
      if (!z.string().uuid().safeParse(request.params.id).success) return reply.status(404).send({ error: 'Not found' });
      const row = await revokeConnection(request.user.tenant_id, request.params.id, request.user.sub, 'Revoked by a workspace admin');
      if (!row) return reply.status(404).send({ error: 'Not found' });
      await recordAuthEvent(request.user.tenant_id, request.user.sub, 'oauth_consent_revoked', { metadata: { via: 'mcp_admin', connection_id: row.id, client_id: row.client_id, user_id: row.user_id } });
      return { success: true };
    });

    admin.post('/v1/mcp/admin/connections/revoke-all', async request => {
      const b = z.object({ client_id: z.string().max(200).optional() }).parse(request.body ?? {});
      const tenantId = request.user.tenant_id;
      const rows = await withTenant(tenantId, trx => {
        let q = trx.updateTable('mcp_connections').set({ status: 'revoked', revoked_at: new Date(), revoked_by: request.user.sub, revoke_reason: 'Revoked by a workspace admin (all)' })
          .where('tenant_id', '=', tenantId).where('status', '=', 'active');
        if (b.client_id) q = q.where('client_id', '=', b.client_id);
        return q.returning('id').execute();
      });
      if (rows.length) await dbPlatform.deleteFrom('mcp_refresh_tokens').where('connection_id', 'in', rows.map(r => r.id)).execute();
      mcpTenantChanged(tenantId);
      await recordAuthEvent(tenantId, request.user.sub, 'oauth_consent_revoked', { metadata: { via: 'mcp_admin_all', count: rows.length, client_id: b.client_id ?? null } });
      return { revoked: rows.length };
    });

    admin.get('/v1/mcp/admin/calls', async request => {
      const q = request.query as { connection_id?: string; tool_id?: string; outcome?: string; limit?: string };
      const tenantId = request.user.tenant_id;
      const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
      return withTenant(tenantId, async trx => {
        let sel = trx.selectFrom('mcp_call_log as l').leftJoin('users as u', 'u.id', 'l.user_id')
          .select(['l.id', 'l.connection_id', 'l.user_id', 'l.actor_type', 'l.client_id', 'l.tool_id', 'l.app_id', 'l.outcome', 'l.error_code', 'l.http_status', 'l.duration_ms', 'l.arg_names', 'l.created_at', 'u.name as user_name', 'u.avatar_url as user_avatar_url'] as any)
          .where('l.tenant_id', '=', tenantId).orderBy('l.created_at', 'desc').limit(limit);
        if (q.connection_id && z.string().uuid().safeParse(q.connection_id).success) sel = sel.where('l.connection_id', '=', q.connection_id);
        if (q.tool_id) sel = sel.where('l.tool_id', '=', q.tool_id);
        if (q.outcome) sel = sel.where('l.outcome', '=', q.outcome as any);
        return { data: await sel.execute() };
      });
    });
  });
}
