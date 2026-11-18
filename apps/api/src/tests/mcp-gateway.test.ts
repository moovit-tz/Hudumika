/**
 * MCP gateway — end-to-end through the real endpoints (fastify.inject):
 * dynamic client registration → consent → PKCE code exchange → /mcp.
 *
 * Two disposable tenants. Tenant A has every catalog app enabled (the real
 * per-tenant `enabled-apps` override SuperAdmin uses), staff in several roles,
 * and two customers with a portal login each. Tenant B is a second workspace
 * with a smaller app set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { sql } from 'kysely';
import { ALL_APP_IDS } from '@hudumika/types';
import { dbPlatform, withTenant } from '../db/client.js';
import { MCP_TOOLS, MCP_TOOL_BY_ID } from '../lib/mcp/tools.js';
import { GLService } from '../services/gl.service.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

const RESOURCE = () => `${(process.env.ONDI_ISSUER_OVERRIDE || process.env.PUBLIC_APP_URL || (process.env.CORS_ORIGINS ?? 'http://localhost:5180').split(',')[0]).replace(/\/+$/, '')}/mcp`;
const REDIRECT = 'http://127.0.0.1:8976/callback';
const b64u = (b: Buffer) => b.toString('base64url');

type App = Awaited<ReturnType<typeof getApp>>;
let app: App;
let A: TestTenant;
let B: TestTenant;
const users: Record<string, { userId: string; token: string }> = {};
const ids: Record<string, string> = {};
const evidence: Record<string, { tool: string; ok: boolean; detail: string }[]> = {};
const clientIds: string[] = [];

async function setEnabledApps(tenantId: string, apps: Record<string, boolean>) {
  await sql`INSERT INTO tenant_settings (tenant_id, settings) VALUES (${tenantId}, ${JSON.stringify({ 'enabled-apps': apps })}::jsonb)
    ON CONFLICT (tenant_id) DO UPDATE SET settings = jsonb_set(coalesce(tenant_settings.settings, '{}'::jsonb), '{enabled-apps}', ${JSON.stringify(apps)}::jsonb)`.execute(dbPlatform);
}

async function register(name = 'Vitest MCP client') {
  const res = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/register', payload: { client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' } });
  expect(res.statusCode, res.body).toBe(201);
  clientIds.push(res.json().client_id);
  return res.json().client_id as string;
}

/** The whole linking flow as a signed-in user. Returns tokens, or the failing response. */
let sharedClient: string | null = null;
async function connect(token: string, scope = 'mcp:read', clientId?: string, extra: Record<string, unknown> = {}) {
  // One registered client for the suite: registration is rate-limited (10/min).
  const client = clientId ?? (sharedClient ??= await register());
  const verifier = b64u(crypto.randomBytes(32));
  const params = {
    client_id: client, redirect_uri: REDIRECT, response_type: 'code', scope, state: 's1',
    code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', resource: RESOURCE(),
  };
  const approve = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/authorize/approve', headers: authHeaders(token), payload: { ...params, ...extra } });
  if (approve.statusCode !== 200) return { ok: false as const, res: approve, client };
  const code = new URL(approve.json().redirect_url).searchParams.get('code')!;
  const tok = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/token', payload: { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client, redirect_uri: REDIRECT } });
  expect(tok.statusCode, tok.body).toBe(200);
  return { ok: true as const, client, code, verifier, ...tok.json() as { access_token: string; refresh_token: string; scope: string } };
}

let rpcId = 0;
async function rpc(accessToken: string, method: string, params: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST', url: '/mcp',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    payload: { jsonrpc: '2.0', id: ++rpcId, method, params },
  });
}
async function listNames(at: string): Promise<string[]> {
  const r = await rpc(at, 'tools/list');
  expect(r.statusCode, r.body).toBe(200);
  return r.json().result.tools.map((t: any) => t.name);
}
async function call(at: string, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(at, 'tools/call', { name, arguments: args });
  expect(r.statusCode, r.body).toBe(200);
  return r.json().result as { isError: boolean; structuredContent?: any; content: { text: string }[]; _meta?: any };
}
const n = (id: string) => MCP_TOOL_BY_ID.get(id)?.name ?? id.replace('.', '__');

describe('MCP gateway', () => {
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    users.adminA = { userId: A.userId, token: A.token };
    users.managerA = await A.addUser('MANAGER');
    users.juniorA = await A.addUser('JUNIOR');
    users.adminB = { userId: B.userId, token: B.token };

    const allKeys = new Set<string>(ALL_APP_IDS);
    for (const t of MCP_TOOLS) for (const k of [t.entitlement].flat()) if (k) allKeys.add(k);
    await setEnabledApps(A.tenantId, Object.fromEntries([...allKeys].map(k => [k, true])));
    await setEnabledApps(B.tenantId, { clearos: true, crm: true, bliss: true, finops: false });
    // Payments post to the ledger by account code, so A needs its chart of accounts.
    await withTenant(A.tenantId, trx => GLService.seedChartOfAccounts(trx, A.tenantId));

    // Two customers in A, each with a portal login linked to its customers row.
    for (const key of ['c1', 'c2']) {
      const cust = await withTenant(A.tenantId, trx => trx.insertInto('customers').values({ tenant_id: A.tenantId, name: `MCP Customer ${key}`, email: `${key}-${A.tenantId.slice(0, 8)}@mcp-test.invalid` } as any).returning('id').executeTakeFirstOrThrow());
      ids[key] = cust.id;
      const u = await A.addUser('CUSTOMER');
      await dbPlatform.updateTable('users').set({ customer_id: cust.id } as any).where('id', '=', u.userId).execute();
      users[key] = u;
      const ship = await withTenant(A.tenantId, trx => trx.insertInto('shipment_cases').values({
        tenant_id: A.tenantId, ref_number: `MCP-${key}-${crypto.randomUUID().slice(0, 6)}`, customer_id: cust.id, type: 'SEA_FCL',
        goods_desc: `Goods for ${key}`, vessel: 'MV Test', origin_port: 'CNSHA', dest_port: 'TZDAR',
      } as any).returning('id').executeTakeFirstOrThrow());
      ids[`ship_${key}`] = ship.id;
      const ticket = await app.inject({ method: 'POST', url: '/v1/support/tickets', headers: authHeaders(A.token), payload: { customer_id: cust.id, subject: `Ticket for ${key}`, priority: 'NORMAL', category: 'General' } });
      expect(ticket.statusCode, ticket.body).toBe(201);
      ids[`ticket_${key}`] = ticket.json().id ?? ticket.json().ticket?.id;
    }
    const custB = await withTenant(B.tenantId, trx => trx.insertInto('customers').values({ tenant_id: B.tenantId, name: 'Tenant B customer' } as any).returning('id').executeTakeFirstOrThrow());
    ids.custB = custB.id;
    const shipB = await withTenant(B.tenantId, trx => trx.insertInto('shipment_cases').values({ tenant_id: B.tenantId, ref_number: `MCP-B-${crypto.randomUUID().slice(0, 6)}`, customer_id: custB.id, type: 'SEA_FCL', goods_desc: 'Tenant B goods', vessel: 'MV B', origin_port: 'CNSHA', dest_port: 'TZDAR' } as any).returning('id').executeTakeFirstOrThrow());
    ids.ship_b = shipB.id;
    const lead = await app.inject({ method: 'POST', url: '/v1/leads', headers: authHeaders(A.token), payload: { company: 'MCP Lead Co', contact_name: 'Asha Lead' } });
    expect(lead.statusCode, lead.body).toBeLessThan(300);
    ids.lead = lead.json().id;
    // An issued invoice and a draft for c1, and an issued invoice for c2.
    for (const [key, cust, status] of [['inv_c1', ids.c1, 'Unpaid'], ['draft_c1', ids.c1, 'Draft'], ['inv_c2', ids.c2, 'Unpaid']] as const) {
      const inv = await withTenant(A.tenantId, trx => trx.insertInto('sales_invoices').values({ tenant_id: A.tenantId, invoice_number: `MCP-${key}-${crypto.randomUUID().slice(0, 6)}`, customer_id: cust, client_name: 'MCP Customer', status, currency: 'TZS', exchange_rate: 1, received: 0 } as any).returning('id').executeTakeFirstOrThrow());
      ids[key] = inv.id;
    }
  }, 300_000);

  afterAll(async () => {
    // GET /v1/developer/accounts creates a personal developer account on first read.
    for (const t of [A, B]) if (t) await sql`DELETE FROM developer_accounts WHERE owner_user_id IN (SELECT id FROM users WHERE tenant_id = ${t.tenantId})`.execute(dbPlatform);
    for (const t of [A, B]) if (t) for (const table of ['pos_sales', 'pos_shifts', 'tuma_parcel_tracking', 'tuma_parcels', 'tuma_booking_offices', 'legal_court_events', 'legal_deadlines', 'legal_court_cases', 'legal_matters', 'legal_clients', 'privacy_incidents', 'privacy_assessments', 'finance_job_cards', 'finance_industry_work_lines', 'finance_industry_work', 'finance_vehicle_records', 'payroll_runs']) {
      await sql`DELETE FROM ${sql.table(table)} WHERE tenant_id = ${t.tenantId}`.execute(dbPlatform).catch(() => {});
    }
    if (clientIds.length) await dbPlatform.deleteFrom('ondi_oauth_clients').where('client_id', 'in', clientIds).execute();
    await A?.cleanup();
    await B?.cleanup();
    if (process.env.MCP_EVIDENCE) (await import('fs')).writeFileSync(process.env.MCP_EVIDENCE, JSON.stringify(evidence, null, 1));
    // Fail loudly if a tenant survived cleanup (a table without ON DELETE CASCADE).
    for (const t of [A, B]) if (t) expect(await dbPlatform.selectFrom('tenants').select('id').where('id', '=', t.tenantId).executeTakeFirst(), 'test tenant removed').toBeUndefined();
  }, 300_000);

  it('publishes OAuth discovery and challenges unauthenticated calls', async () => {
    const prm = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/mcp' })).json();
    expect(prm.resource).toBe(RESOURCE());
    expect(prm.scopes_supported).toEqual(['mcp:read', 'mcp:write']);
    const as = (await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).json();
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.registration_endpoint).toMatch(/\/v1\/mcp\/oauth\/register$/);
    const r = await app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', id: 1, method: 'initialize' } });
    expect(r.statusCode).toBe(401);
    expect(r.headers['www-authenticate']).toContain('resource_metadata=');
    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(406);
    expect((await app.inject({ method: 'GET', url: '/mcp', headers: { accept: 'text/event-stream' } })).statusCode).toBe(401);
  });

  it('registration refuses unsafe redirect URIs, and registered clients cannot use the REST OAuth endpoints', async () => {
    for (const bad of ['javascript:alert(1)', 'http://evil.example/cb', 'https://x.example/cb#frag']) {
      const r = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/register', payload: { client_name: 'x', redirect_uris: [bad] } });
      expect(r.statusCode, bad).toBe(400);
    }
    const cid = await register();
    const info = await app.inject({ method: 'GET', url: `/v1/ondi/oauth/authorize/info?client_id=${cid}&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=openid`, headers: authHeaders(A.token) });
    expect(info.statusCode).toBe(400);
    expect(info.json().error).toMatch(/Unknown client/);
  });

  it('links an account with PKCE; codes are single-use; MCP tokens do not work on the REST API', async () => {
    const c = await connect(A.token, 'mcp:read');
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    tokens.adminA = c.access_token;
    // Replay of the same code fails.
    const again = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/token', payload: { grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: c.client } });
    expect(again.statusCode).toBe(400);
    // Wrong verifier fails.
    const verifier = b64u(crypto.randomBytes(32));
    const appr = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/authorize/approve', headers: authHeaders(A.token), payload: { client_id: c.client, redirect_uri: REDIRECT, scope: 'mcp:read', code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' } });
    const code = new URL(appr.json().redirect_url).searchParams.get('code')!;
    const bad = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/token', payload: { grant_type: 'authorization_code', code, code_verifier: 'x'.repeat(43), client_id: c.client } });
    expect(bad.json().error).toBe('invalid_grant');
    // Missing PKCE is refused at consent.
    const noPkce = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/authorize/approve', headers: authHeaders(A.token), payload: { client_id: c.client, redirect_uri: REDIRECT, scope: 'mcp:read' } });
    expect(noPkce.statusCode).toBe(400);
    // An MCP token is not a REST credential.
    const rest = await app.inject({ method: 'GET', url: '/v1/shipments', headers: { authorization: `Bearer ${c.access_token}` } });
    expect(rest.statusCode).toBe(401);

    const init = await rpc(c.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '1' } });
    expect(init.json().result.protocolVersion).toBe('2025-06-18');
    expect(init.json().result.capabilities.tools).toBeTruthy();
    expect((await rpc(c.access_token, 'notifications/initialized')).statusCode).toBe(200);
  });

  it('invokes a real read tool for every implemented app', async () => {
    const names = new Set(await listNames(tokens.adminA));
    const drives = await call(tokens.adminA, n('cloud.list_drives'), { limit: 5 });
    const driveId = drives.structuredContent?.items?.[0]?.id;
    const args: Record<string, Record<string, unknown>> = {
      'clearos.get_shipment': { id: ids.ship_c1 }, 'crm.get_customer': { id: ids.c1 }, 'bliss.get_ticket': { id: ids.ticket_c1 },
      'workspace.search': { q: 'MCP Customer' }, 'workspace.customer_overview': { customer_id: ids.c1 },
      'cloud.list_files': driveId ? { drive_id: driveId } : {},
      'crm.get_lead': { id: ids.lead }, 'clearos.list_shipment_notes': { shipment_id: ids.ship_c1 }, 'finops.get_invoice': { id: ids.inv_c1 },
      'workspace.search_records': { query: 'MCP Customer' }, 'workspace.fetch_record': { id: `shipment:${ids.ship_c1}` },
    };
    const apps = new Set(MCP_TOOLS.map(t => t.app));
    for (const appId of apps) {
      const tools = MCP_TOOLS.filter(t => t.app === appId && t.access === 'read');
      for (const t of tools) {
        if (t.id === 'cloud.list_files' && !driveId) continue;
        expect(names.has(n(t.id)), `${t.id} listed for tenant admin`).toBe(true);
        const r = await call(tokens.adminA, n(t.id), args[t.id] ?? {});
        const detail = r.isError ? r.content[0].text : t.outputSchema && (r.structuredContent?.items ? `items=${r.structuredContent.count}` : Object.keys(r.structuredContent ?? {}).slice(0, 6).join(','));
        (evidence[appId] ??= []).push({ tool: t.id, ok: !r.isError, detail: String(detail) });
      }
      const okCount = evidence[appId]!.filter(e => e.ok).length;
      expect(okCount, `${appId}: ${JSON.stringify(evidence[appId])}`).toBe(evidence[appId]!.length);
    }
    // Real data comes back for seeded records.
    const ship = await call(tokens.adminA, n('clearos.get_shipment'), { id: ids.ship_c1 });
    expect(ship.structuredContent.customer_id).toBe(ids.c1);
  }, 600_000);

  it('validates arguments against the advertised schema', async () => {
    const r = await call(tokens.adminA, n('clearos.get_shipment'), { id: 'not-a-uuid' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/UUID/);
    const extra = await call(tokens.adminA, n('finops.invoice_summary'), { limit: 3 });
    expect(extra.isError).toBe(true);
    const unknown = await rpc(tokens.adminA, 'tools/call', { name: 'lens__list_items', arguments: {} });
    expect(unknown.json().error.code).toBe(-32602);
  });

  it('a cross-app lookup applies each app’s rules independently', async () => {
    const r = await call(tokens.adminA, n('workspace.customer_overview'), { customer_id: ids.c1 });
    expect(r.isError, r.content[0].text).toBe(false);
    expect(r.structuredContent.customer.id).toBe(ids.c1);
    for (const s of ['invoices', 'shipments', 'tickets']) expect(r.structuredContent.sections[s].available, s).toBe(true);
    expect(r.structuredContent.sections.shipments.items.every((x: any) => x.customer_id === ids.c1)).toBe(true);
    expect(r.structuredContent.sections.shipments.items.map((x: any) => x.id)).toContain(ids.ship_c1);
    expect(r.structuredContent.sections.tickets.items.every((x: any) => x.customer_id === ids.c1)).toBe(true);

    // Turning one app's tool off removes only that section.
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/finops.list_invoices', headers: authHeaders(A.token), payload: { enabled: false } });
    const r2 = await call(tokens.adminA, n('workspace.customer_overview'), { customer_id: ids.c1 });
    expect(r2.structuredContent.sections.invoices).toMatchObject({ available: false });
    expect(r2.structuredContent.sections.shipments.available).toBe(true);
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/finops.list_invoices', headers: authHeaders(A.token), payload: { enabled: true } });

    // Another tenant's customer id is refused by the CRM route itself.
    const foreign = await call(tokens.adminA, n('workspace.customer_overview'), { customer_id: ids.custB });
    expect(foreign.isError).toBe(true);
  });

  it('keeps two workspaces apart', async () => {
    const c = await connect(B.token, 'mcp:read');
    if (!c.ok) throw new Error(c.res.body);
    tokens.adminB = c.access_token;
    const names = await listNames(c.access_token);
    expect(names).toContain(n('clearos.list_shipments'));
    expect(names).not.toContain(n('finops.list_invoices')); // finops disabled for B
    expect(names).not.toContain(n('lexcore.list_matters'));  // not entitled
    const ship = await call(c.access_token, n('clearos.get_shipment'), { id: ids.ship_c1 });
    expect(ship.isError).toBe(true);
    const list = await call(c.access_token, n('clearos.list_shipments'), {});
    expect(list.structuredContent.items.map((x: any) => x.id)).not.toContain(ids.ship_c1);
    const cust = await call(c.access_token, n('crm.get_customer'), { id: ids.c1 });
    expect(cust.isError).toBe(true);
    // RLS: B's tenant context cannot see A's connections.
    const leaked = await withTenant(B.tenantId, trx => trx.selectFrom('mcp_connections').select('id').where('tenant_id', '=', A.tenantId).execute());
    expect(leaked).toHaveLength(0);
  });

  it('external customers need the workspace switch and see only their own records', async () => {
    const blocked = await connect(users.c1.token);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.res.statusCode).toBe(403);

    const pol = await app.inject({ method: 'PUT', url: '/v1/mcp/admin/policy', headers: authHeaders(A.token), payload: { customers_enabled: true } });
    expect(pol.json().customers_enabled).toBe(true);
    const c = await connect(users.c1.token, 'mcp:read mcp:write');
    if (!c.ok) throw new Error(c.res.body);
    tokens.c1 = c.access_token;

    const names = await listNames(c.access_token);
    const allowed = MCP_TOOLS.filter(t => t.actors.includes('customer') && t.access === 'read').map(t => n(t.id));
    for (const name of names.filter(x => !x.includes('create'))) expect(allowed).toContain(name);
    expect(names).toContain(n('finops.list_invoices'));
    expect(names).toContain('search');
    expect(names).not.toContain(n('crm.list_customers'));

    const ships = await call(c.access_token, n('clearos.list_shipments'), {});
    const shipIds = ships.structuredContent.items.map((x: any) => x.id);
    expect(shipIds).toContain(ids.ship_c1);
    expect(shipIds).not.toContain(ids.ship_c2);
    expect((await call(c.access_token, n('clearos.get_shipment'), { id: ids.ship_c2 })).isError).toBe(true);

    const tickets = await call(c.access_token, n('bliss.list_tickets'), {});
    expect(tickets.structuredContent.items.every((x: any) => x.customer_id === ids.c1)).toBe(true);
    expect(tickets.structuredContent.items.map((x: any) => x.id)).toContain(ids.ticket_c1);
    // Invoices: only their own, and never a draft — through MCP and through the portal's REST calls.
    const inv = await call(c.access_token, n('finops.list_invoices'), {});
    expect(inv.isError, inv.content[0].text).toBe(false);
    const invIds = inv.structuredContent.items.map((x: any) => x.id);
    expect(invIds).toContain(ids.inv_c1);
    expect(invIds).not.toContain(ids.draft_c1);
    expect(invIds).not.toContain(ids.inv_c2);
    expect((await call(c.access_token, n('finops.get_invoice'), { id: ids.inv_c1 })).structuredContent.id).toBe(ids.inv_c1);
    expect((await call(c.access_token, n('finops.get_invoice'), { id: ids.inv_c2 })).isError).toBe(true);
    expect((await call(c.access_token, n('finops.get_invoice'), { id: ids.draft_c1 })).isError).toBe(true);
    const portal = await app.inject({ method: 'GET', url: '/v1/invoices', headers: authHeaders(users.c1.token) });
    expect(portal.statusCode, portal.body).toBe(200);
    expect((portal.json() as any[]).map(r => r.id).sort()).toEqual([ids.inv_c1]);
    for (const url of [`/v1/invoices/${ids.inv_c2}`, `/v1/invoices/${ids.draft_c1}`, `/v1/invoices/${ids.inv_c2}/pdf`, `/v1/invoices/not-a-uuid/pdf`]) {
      expect((await app.inject({ method: 'GET', url, headers: authHeaders(users.c1.token) })).statusCode, url).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: `/v1/invoices/${ids.inv_c1}`, headers: authHeaders(users.c1.token) })).statusCode).toBe(200);
    for (const url of ['/v1/invoices/stats', '/v1/invoices/report', `/v1/invoices/${ids.inv_c1}/activity`]) {
      expect((await app.inject({ method: 'GET', url, headers: authHeaders(users.c1.token) })).statusCode, url).toBe(403);
    }
    expect((await app.inject({ method: 'POST', url: '/v1/invoices', headers: authHeaders(users.c1.token), payload: {} })).statusCode).toBe(403);
    // search/fetch stay inside the customer's own records.
    const found = await call(c.access_token, 'search', { query: 'MCP' });
    const foundIds = found.structuredContent.results.map((r: any) => r.id);
    expect(foundIds).toContain(`shipment:${ids.ship_c1}`);
    expect(foundIds).not.toContain(`shipment:${ids.ship_c2}`);
    expect((await call(c.access_token, 'fetch', { id: `shipment:${ids.ship_c2}` })).isError).toBe(true);
    expect((await call(c.access_token, 'fetch', { id: `invoice:${ids.inv_c1}` })).structuredContent.id).toBe(`invoice:${ids.inv_c1}`);
    expect((await call(c.access_token, 'fetch', { id: `customer:${ids.c1}` })).isError).toBe(true);
    // A staff-only tool is refused even when named directly.
    const staffOnly = await call(c.access_token, n('crm.list_customers'), {});
    expect(staffOnly.isError).toBe(true);
    expect(staffOnly._meta?.['hudumika/errorCode']).toBe('actor_type');

    // Unlinking the login from its customer cuts access at once.
    await dbPlatform.updateTable('users').set({ customer_id: ids.c2 } as any).where('id', '=', users.c1.userId).execute();
    const after = await rpc(c.access_token, 'tools/list');
    expect(after.statusCode).toBe(403);
    await dbPlatform.updateTable('users').set({ customer_id: ids.c1 } as any).where('id', '=', users.c1.userId).execute();
  });

  it('write tools need the write scope, admin enablement, confirmation, and are idempotent', async () => {
    // Read-only connection: not listed, refused when named.
    expect(await listNames(tokens.adminA)).not.toContain(n('tasks.create_task'));
    const listsRes = await call(tokens.adminA, n('tasks.list_task_lists'), {});
    let listId = listsRes.structuredContent.items[0]?.id;
    if (!listId) {
      const created = await app.inject({ method: 'POST', url: '/v1/tasks/lists', headers: authHeaders(A.token), payload: { id: crypto.randomUUID(), name: 'MCP list' } });
      expect(created.statusCode, created.body).toBeLessThan(300);
      listId = created.json().id ?? created.json().data?.id;
    }
    const c = await connect(A.token, 'mcp:read mcp:write');
    if (!c.ok) throw new Error(c.res.body);
    const at = c.access_token;
    const args = { list_id: listId, title: 'Call the shipping line', idempotency_key: 'mcp-test-key-0001' };

    const off = await call(at, n('tasks.create_task'), args);
    expect(off.isError).toBe(true);
    expect(off._meta?.['hudumika/errorCode']).toBe('disabled');
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/tasks.create_task', headers: authHeaders(A.token), payload: { enabled: true } });
    expect(await listNames(at)).toContain(n('tasks.create_task'));

    const countTasks = async () => (await withTenant(A.tenantId, trx => trx.selectFrom('tasks').select('id').where('tenant_id', '=', A.tenantId).where('title', '=', args.title).execute())).length;
    const step1 = await call(at, n('tasks.create_task'), args);
    expect(step1.isError, step1.content[0].text).toBe(false);
    expect(step1.structuredContent.status).toBe('confirmation_required');
    expect(step1.structuredContent.summary).toContain('Call the shipping line');
    expect(await countTasks()).toBe(0);

    const badTok = await call(at, n('tasks.create_task'), { ...args, confirmation_token: 'nope' });
    expect(badTok._meta?.['hudumika/errorCode']).toBe('confirmation_invalid');

    const step2 = await call(at, n('tasks.create_task'), { ...args, confirmation_token: step1.structuredContent.confirmation_token });
    expect(step2.isError, step2.content[0].text).toBe(false);
    expect(step2.structuredContent.status).toBe('done');
    expect(await countTasks()).toBe(1);

    const retry = await call(at, n('tasks.create_task'), { ...args, confirmation_token: step1.structuredContent.confirmation_token });
    expect(retry.structuredContent).toMatchObject({ status: 'already_done', replayed: true });
    expect(await countTasks()).toBe(1);

    const conflict = await call(at, n('tasks.create_task'), { ...args, title: 'Something else' });
    expect(conflict._meta?.['hudumika/errorCode']).toBe('idempotency_conflict');

    // Notes: same two-step flow through POST /v1/notes.
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/notes.create_note', headers: authHeaders(A.token), payload: { enabled: true } });
    const nArgs = { title: 'Customs follow-up', content: 'Ask TRA about the valuation query.', idempotency_key: 'mcp-test-note-0001' };
    const n1 = await call(at, n('notes.create_note'), nArgs);
    expect(n1.structuredContent?.status, n1.content[0].text).toBe('confirmation_required');
    const n2 = await call(at, n('notes.create_note'), { ...nArgs, confirmation_token: n1.structuredContent.confirmation_token });
    expect(n2.structuredContent?.status, n2.content[0].text).toBe('done');
    const listed = await call(at, n('notes.list_notes'), { query: 'valuation query' });
    expect(listed.structuredContent.items.map((x: any) => x.id)).toContain(n2.structuredContent.result.id);

    // A customer can open a ticket only for themself, through the same flow.
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/bliss.create_ticket', headers: authHeaders(A.token), payload: { enabled: true } });
    const tArgs = { subject: 'My container is late', idempotency_key: 'mcp-cust-ticket-0001', customer_id: ids.c2 };
    const t1 = await call(tokens.c1, n('bliss.create_ticket'), tArgs);
    expect(t1.structuredContent?.status, t1.content[0].text).toBe('confirmation_required');
    const t2 = await call(tokens.c1, n('bliss.create_ticket'), { ...tArgs, confirmation_token: t1.structuredContent.confirmation_token });
    expect(t2.structuredContent.status, t2.content[0].text).toBe('done');
    const row = await withTenant(A.tenantId, trx => trx.selectFrom('support_tickets').select(['customer_id']).where('id', '=', t2.structuredContent.result.id).executeTakeFirstOrThrow());
    expect(row.customer_id).toBe(ids.c1); // not c2, whatever the arguments said
  });

  it('the other write tools run through each app’s own route', async () => {
    const c = await connect(A.token, 'mcp:read mcp:write');
    if (!c.ok) throw new Error(c.res.body);
    const at = c.access_token;
    const writeIds = MCP_TOOLS.filter(t => t.access === 'write').map(t => t.id);
    for (const id of writeIds) {
      const r = await app.inject({ method: 'PUT', url: `/v1/mcp/admin/tools/${id}`, headers: authHeaders(A.token), payload: { enabled: true } });
      expect(r.statusCode, id).toBe(200);
    }
    const names = await listNames(at);
    for (const id of writeIds) if (MCP_TOOL_BY_ID.get(id)!.actors.includes('staff')) expect(names, id).toContain(n(id));

    const run = async (token: string, id: string, args: Record<string, unknown>) => {
      const s1 = await call(token, n(id), args);
      expect(s1.structuredContent?.status, `${id}: ${s1.content[0].text}`).toBe('confirmation_required');
      const s2 = await call(token, n(id), { ...args, confirmation_token: s1.structuredContent.confirmation_token });
      expect(s2.structuredContent?.status, `${id}: ${s2.content[0].text}`).toBe('done');
      (evidence.writes ??= []).push({ tool: id, ok: true, detail: Object.keys(s2.structuredContent.result ?? {}).slice(0, 5).join(',') });
      return s2.structuredContent.result as any;
    };

    const lead = await run(at, 'crm.create_lead', { company: 'Kilima Traders', contact_name: 'Neema Mushi', value: 1200, idempotency_key: 'mcp-w-lead-0001' });
    expect((await call(at, n('crm.get_lead'), { id: lead.id })).structuredContent).toMatchObject({ company: 'Kilima Traders', contact_name: 'Neema Mushi', value: 1200 });
    const moved = await run(at, 'crm.update_lead_stage', { lead_id: lead.id, stage: 'CONTACTED', idempotency_key: 'mcp-w-stage-0001' });
    expect(moved.stage).toBe('CONTACTED');

    const contact = await run(at, 'contacts.create_contact', { first_name: 'Baraka', last_name: 'Mwita', company: 'Pwani Ltd', email: `baraka-${A.tenantId.slice(0, 6)}@mcp-test.invalid`, idempotency_key: 'mcp-w-contact-0001' });
    const contacts = await call(at, n('contacts.list_contacts'), { q: 'Baraka' });
    expect(contacts.structuredContent.items.find((x: any) => x.id === contact.id)).toMatchObject({ first_name: 'Baraka', last_name: 'Mwita', company: 'Pwani Ltd' });

    await run(at, 'calendar.create_event', { title: 'Customs broker call', start: '2026-12-01T09:00:00+03:00', end: '2026-12-01T10:00:00+03:00', idempotency_key: 'mcp-w-event-0001' });
    const evs = await call(at, n('calendar.list_events'), { from: '2026-12-01', to: '2026-12-02' });
    expect(evs.structuredContent.items.map((x: any) => x.title)).toContain('Customs broker call');
    const badEvent = await call(at, n('calendar.create_event'), { title: 'Backwards', start: '2026-12-01T10:00:00+03:00', end: '2026-12-01T09:00:00+03:00', idempotency_key: 'mcp-w-event-0002' });
    expect(badEvent.isError).toBe(true);

    const tasks = await call(at, n('tasks.list_tasks'), { query: 'Call the shipping line' });
    const done = await run(at, 'tasks.complete_task', { task_id: tasks.structuredContent.items[0].id, idempotency_key: 'mcp-w-done-0001' });
    expect(done.completed).toBe(true);

    const note = await run(at, 'clearos.add_shipment_note', { shipment_id: ids.ship_c1, content: 'Documents sent to TRA.', idempotency_key: 'mcp-w-snote-0001' });
    const notes = await call(at, n('clearos.list_shipment_notes'), { shipment_id: ids.ship_c1 });
    expect(notes.structuredContent.items.find((x: any) => x.id === note.id)).toMatchObject({ content: 'Documents sent to TRA.' });
    // A shipment outside this workspace is refused before anything is written.
    const foreignNote = await call(at, n('clearos.add_shipment_note'), { shipment_id: ids.ship_b, content: 'x', idempotency_key: 'mcp-w-snote-0002' });
    expect(foreignNote.isError).toBe(true);
    // …and the REST route itself no longer accepts another workspace's shipment id.
    const direct = await app.inject({ method: 'POST', url: `/v1/shipments/${ids.ship_b}/notes`, headers: authHeaders(A.token), payload: { content: 'cross-tenant' } });
    expect(direct.statusCode).toBe(404);

    const reply = await run(at, 'bliss.reply_to_ticket', { ticket_id: ids.ticket_c1, content: 'We are on it.', idempotency_key: 'mcp-w-reply-0001' });
    const msg = await withTenant(A.tenantId, trx => trx.selectFrom('support_messages').select(['channel', 'ticket_id']).where('id', '=', reply.id).executeTakeFirstOrThrow());
    expect(msg).toMatchObject({ channel: 'IN_APP', ticket_id: ids.ticket_c1 });
    // A customer replies on their own ticket only.
    const cReply = await run(tokens.c1, 'bliss.reply_to_ticket', { ticket_id: ids.ticket_c1, content: 'Thank you.', idempotency_key: 'mcp-c-reply-0001' });
    expect(cReply.author_type).toBe('CUSTOMER');
    const cBad = await call(tokens.c1, n('bliss.reply_to_ticket'), { ticket_id: ids.ticket_c2, content: 'x', idempotency_key: 'mcp-c-reply-0002' });
    expect(cBad.isError).toBe(true);

    await app.inject({ method: 'POST', url: '/v1/hr/leave-types/generate-statutory', headers: authHeaders(A.token), payload: {} });
    const leaveArgs = { type: 'ANNUAL', from_date: '2026-12-14', to_date: '2026-12-15', idempotency_key: 'mcp-w-leave-0001' };
    const l1 = await call(at, n('nexushr.request_leave'), leaveArgs);
    expect(l1.structuredContent?.status, l1.content[0].text).toBe('confirmation_required');
    const l2 = await call(at, n('nexushr.request_leave'), { ...leaveArgs, confirmation_token: l1.structuredContent.confirmation_token });
    // HR's own rules decide (entitlement ledger, working days); either way it is the route's answer, never a crash.
    (evidence.writes ??= []).push({ tool: 'nexushr.request_leave', ok: !l2.isError, detail: l2.isError ? l2.content[0].text : 'done' });
    if (l2.isError) expect(l2._meta?.['hudumika/errorCode']).not.toBe('error');
    else {
      const leaves = await call(at, n('nexushr.list_my_leave_requests'), {});
      expect(leaves.structuredContent.items.map((x: any) => x.id)).toContain(l2.structuredContent.result.id);
    }

    const trip = await run(at, 'travel.create_trip', { title: 'Mombasa port visit', destination: 'Mombasa', start_date: '2026-12-03', end_date: '2026-12-05', budget_amount: 900, idempotency_key: 'mcp-w-trip-0001' });
    const trips = await call(at, n('travel.list_trips'), {});
    const tripRow = trips.structuredContent.items.find((x: any) => x.id === trip.id);
    expect(tripRow).toMatchObject({ title: 'Mombasa port visit', budget_amount: 900 });
    expect(String(tripRow.start_date)).toMatch(/^2026-12-0[23]/);
  }, 300_000);

  it('returns real records for the apps whose demo data was empty', async () => {
    const H = authHeaders(A.token);
    const suffix = crypto.randomUUID().slice(0, 6);
    const idOf = (b: any) => b?.id ?? b?.data?.id ?? (Object.values(b ?? {}).find((v: any) => v && typeof v === 'object' && typeof v.id === 'string') as any)?.id;
    const post = async (url: string, payload: unknown) => {
      const r = await app.inject({ method: 'POST', url, headers: H, payload: payload as any });
      expect(r.statusCode, `${url} ${r.body}`).toBeLessThan(300);
      return idOf(r.json()) as string;
    };
    const page = await post('/v1/cms/pages', { slug: `mcp-${suffix}`, title: 'MCP Test Page' });
    const blog = await post('/v1/cms/posts', { title: 'MCP Test Post', category: 'News' });
    const form = await post('/v1/cms/forms', { name: 'MCP Contact form', fields: [{ label: 'Email', type: 'email' }] });
    const legalClient = await post('/v1/legal/clients', { name: 'MCP Legal Client', client_type: 'company' });
    const matter = await post('/v1/legal/matters', { client_id: legalClient, title: 'MCP v. Example' });
    const expense = await post('/v1/travel/expenses', { description: 'Taxi to the port', amount: 35000, currency: 'TZS', category: 'transport' });
    const deadline = await post('/v1/legal/deadlines', { matter_id: matter, deadline_type: 'APPEAL_WINDOW', description: 'File the appeal', due_date: '2026-12-20', is_critical: true });
    const courtCase = await post(`/v1/legal/matters/${matter}/court-cases`, { court_name: 'High Court Dar es Salaam', court_hierarchy: 'HIGH_COURT' });
    const courtEvent = await post(`/v1/legal/matters/${matter}/events`, { court_case_id: courtCase, event_type: 'HEARING', scheduled_at: '2026-12-10T09:00:00Z' });
    const assessment = await post('/v1/ngao/assessments', { title: 'MCP DPIA', assessment_type: 'dpia' });
    const incident = await post('/v1/ngao/incidents', { title: 'MCP test incident', severity: 'low', data_subjects_affected: 3 });
    const vehicle = await post('/v1/gereji/vehicles', { registration: `T${suffix.toUpperCase()}`, make: 'Toyota', model: 'Hilux', year: 2020, mileage: 41000 });
    const [o1, o2] = await withTenant(A.tenantId, async trx => Promise.all(['MCP Origin', 'MCP Destination'].map(async name =>
      (await trx.insertInto('tuma_booking_offices').values({ tenant_id: A.tenantId, name, code: name.slice(4, 7).toUpperCase() }).returning('id').executeTakeFirstOrThrow()).id)));
    await post('/v1/gereji/job-cards', { vehicle_id: vehicle, customer_id: ids.c1, reported_fault: 'MCP brake noise', mileage_in: 41010 });
    const parcel = await post('/v1/tuma/parcels', { name: 'Spare parts', sender_name: 'Asha', sender_phone: '+255700000001', recipient_name: 'Juma', recipient_phone: '+255700000002', origin_office_id: o1, dest_office_id: o2, price: 5000 });
    const sale = await withTenant(A.tenantId, async trx => {
      const shift = await trx.insertInto('pos_shifts' as any).values({ tenant_id: A.tenantId, opened_by: A.userId, status: 'OPEN', opening_float: 0 }).returning('id').executeTakeFirstOrThrow();
      return (await trx.insertInto('pos_sales' as any).values({
        tenant_id: A.tenantId, shift_id: (shift as any).id, sale_number: `POS-MCP-${suffix}`, customer_name: 'Walk-in', currency: 'TZS',
        subtotal: 1000, discount_total: 0, tax_total: 180, grand_total: 1180, amount_paid: 1180, change_due: 0, status: 'COMPLETED', sold_by: A.userId,
      }).returning('id').executeTakeFirstOrThrow() as any).id as string;
    });

    const checks: [string, string | null, Record<string, unknown>, Record<string, unknown>?][] = [
      ['travel.list_expenses', expense, { description: 'Taxi to the port', amount: 35000, category: 'transport' }],
      ['lexcore.list_deadlines', deadline, { description: 'File the appeal', deadline_type: 'APPEAL_WINDOW', is_critical: true, matter_id: matter }],
      ['lexcore.list_court_events', courtEvent, { event_type: 'HEARING', matter_id: matter }],
      ['ngao.list_assessments', assessment, { title: 'MCP DPIA', assessment_type: 'dpia' }],
      // The job-card route returns the work order and the card; match the card by its content.
      ['gereji.list_job_cards', null, { reported_fault: 'MCP brake noise', vehicle_id: vehicle, mileage_in: 41010 }],
      ['onesite.list_pages', page, { title: 'MCP Test Page', slug: `mcp-${suffix}` }],
      ['onesite.list_posts', blog, { title: 'MCP Test Post', category: 'News' }],
      ['onesite.list_forms', form, { name: 'MCP Contact form' }],
      ['lexcore.list_matters', matter, { title: 'MCP v. Example', client_name: 'MCP Legal Client' }],
      ['ngao.list_incidents', incident, { title: 'MCP test incident', severity: 'low', data_subjects_affected: 3 }],
      ['gereji.list_vehicles', vehicle, { make: 'Toyota', model: 'Hilux', year: 2020, mileage: 41000 }],
      ['tuma.list_offices', o1, { name: 'MCP Origin' }],
      ['tuma.list_parcels', parcel, { sender_name: 'Asha', recipient_name: 'Juma', origin_office_id: o1, price: 5000 }],
      ['pos.list_sales', sale, { sale_number: `POS-MCP-${suffix}`, grand_total: 1180, status: 'COMPLETED' }],
      ['pos.sales_report', sale, { sale_number: `POS-MCP-${suffix}`, tax_total: 180 }, { from: '2000-01-01', to: '2100-01-01' }],
    ];
    for (const [tool, id, expected, extra] of checks) {
      const r = await call(tokens.adminA, n(tool), { limit: 100, ...(extra ?? {}) });
      expect(r.isError, `${tool}: ${r.content[0].text}`).toBe(false);
      const row = r.structuredContent.items.find((x: any) => id ? x.id === id : Object.entries(expected).every(([k, v]) => x[k] === v));
      expect(row, `${tool} lists the record just created`).toBeTruthy();
      expect(row, tool).toMatchObject(expected);
      const filled = Object.entries(row).filter(([, v]) => v !== null).map(([k]) => k);
      (evidence.real_rows ??= []).push({ tool, ok: true, detail: `fields with values: ${filled.join(',')}` });
    }
  }, 300_000);

  it('MCP protocol: sessions, batches, resources, prompts, search/fetch and the notification stream', async () => {
    const at = tokens.adminA;
    const H = (extra: Record<string, string> = {}) => ({ authorization: `Bearer ${at}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...extra });

    // Sessions: initialize issues one; an unknown or ended id is 404; DELETE ends it.
    const init = await app.inject({ method: 'POST', url: '/mcp', headers: H(), payload: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '1' } } } });
    const sid = init.headers['mcp-session-id'] as string;
    expect(sid).toBeTruthy();
    expect(init.json().result.capabilities).toMatchObject({ tools: { listChanged: true }, resources: { listChanged: true }, prompts: { listChanged: true } });
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: H({ 'mcp-session-id': sid }), payload: { jsonrpc: '2.0', id: 2, method: 'ping' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: H({ 'mcp-session-id': 'not-a-session' }), payload: { jsonrpc: '2.0', id: 3, method: 'ping' } })).statusCode).toBe(404);
    // A session belongs to its connection: another connection's token cannot use it.
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: { ...H({ 'mcp-session-id': sid }), authorization: `Bearer ${tokens.adminB}` }, payload: { jsonrpc: '2.0', id: 4, method: 'ping' } })).statusCode).toBe(404);
    const { 'content-type': _ct, ...noBody } = H({ 'mcp-session-id': sid });
    expect((await app.inject({ method: 'DELETE', url: '/mcp', headers: noBody })).statusCode).toBe(204);
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: H({ 'mcp-session-id': sid }), payload: { jsonrpc: '2.0', id: 5, method: 'ping' } })).statusCode).toBe(404);

    // Batch (MCP 2025-03-26): one response per request, none for the notification.
    const batch = await app.inject({ method: 'POST', url: '/mcp', headers: H({ 'mcp-protocol-version': '2025-03-26' }), payload: [
      { jsonrpc: '2.0', id: 10, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 11, method: 'tools/list' },
    ] as any });
    expect(batch.statusCode, batch.body).toBe(200);
    expect(batch.json().map((r: any) => r.id)).toEqual([10, 11]);

    // Resources: static + per-record templates; a record read runs the app's detail tool.
    const res = (await rpc(at, 'resources/list')).json().result.resources.map((r: any) => r.uri);
    expect(res).toEqual(expect.arrayContaining(['hudumika://workspace/profile', 'hudumika://guide/changes']));
    const templates = (await rpc(at, 'resources/templates/list')).json().result.resourceTemplates.map((t: any) => t.uriTemplate);
    expect(templates).toEqual(expect.arrayContaining(['hudumika://shipment/{id}', 'hudumika://invoice/{id}', 'hudumika://customer/{id}']));
    const profile = JSON.parse((await rpc(at, 'resources/read', { uri: 'hudumika://workspace/profile' })).json().result.contents[0].text);
    expect(profile.account_type).toBe('staff');
    expect(Object.keys(profile.apps)).toContain('clearos');
    const shipRes = (await rpc(at, 'resources/read', { uri: `hudumika://shipment/${ids.ship_c1}` })).json();
    expect(JSON.parse(shipRes.result.contents[0].text).id).toBe(ids.ship_c1);
    expect((await rpc(at, 'resources/read', { uri: `hudumika://shipment/${ids.ship_b}` })).json().error.code).toBe(-32002);
    expect((await rpc(tokens.adminB, 'resources/read', { uri: `hudumika://shipment/${ids.ship_c1}` })).json().error.code).toBe(-32002);

    // Prompts: listed only when their tools are available; arguments validated.
    const prompts = (await rpc(at, 'prompts/list')).json().result.prompts.map((p: any) => p.name);
    expect(prompts).toEqual(expect.arrayContaining(['customer_briefing', 'shipment_status', 'my_day']));
    const got = (await rpc(at, 'prompts/get', { name: 'shipment_status', arguments: { reference: 'MCP-c1' } })).json().result;
    expect(got.messages[0].content.text).toContain('MCP-c1');
    expect((await rpc(at, 'prompts/get', { name: 'shipment_status', arguments: {} })).json().error.code).toBe(-32602);
    expect((await rpc(at, 'prompts/get', { name: 'customer_briefing', arguments: { customer: 'x', extra: 'y' } })).json().error.code).toBe(-32602);

    // ChatGPT search/fetch: staff search, then fetch returns the full record.
    const found = await call(at, 'search', { query: 'MCP Customer' });
    expect(found.isError, found.content[0].text).toBe(false);
    const custHit = found.structuredContent.results.find((r: any) => r.id === `customer:${ids.c1}`);
    expect(custHit?.url).toMatch(/\/crm\/customers\?id=/);
    const doc = await call(at, 'fetch', { id: `customer:${ids.c1}` });
    expect(doc.structuredContent).toMatchObject({ id: `customer:${ids.c1}`, title: 'MCP Customer c1' });
    expect(doc.structuredContent.text).toContain('MCP Customer c1');
    expect((await call(tokens.adminB, 'fetch', { id: `customer:${ids.c1}` })).isError).toBe(true);
    expect((await call(at, 'fetch', { id: 'shipment:not-a-uuid' })).isError).toBe(true);

    // Notification stream over a real socket: a tool switch announces list_changed; revoking ends the stream.
    expect((await app.inject({ method: 'GET', url: '/mcp', headers: { authorization: `Bearer ${at}` } })).statusCode).toBe(406);
    const stream = await connect(users.juniorA.token);
    if (!stream.ok) throw new Error(stream.res.body);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const ac = new AbortController();
    const resp = await fetch(`${address}/mcp`, { headers: { authorization: `Bearer ${stream.access_token}`, accept: 'text/event-stream' }, signal: ac.signal });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('text/event-stream');
    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const readUntil = async (pred: (s: string) => boolean, ms: number) => {
      const end = Date.now() + ms;
      while (!pred(buf) && Date.now() < end) {
        const r = await Promise.race([reader.read(), new Promise<{ done: true; value: undefined }>(res => setTimeout(() => res({ done: true, value: undefined }), Math.max(1, end - Date.now())))]);
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
      }
      return pred(buf);
    };
    expect(await readUntil(s => s.includes(': connected'), 5000)).toBe(true);
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/tasks.list_tasks', headers: authHeaders(A.token), payload: { enabled: false } });
    expect(await readUntil(s => s.includes('notifications/tools/list_changed'), 8000), buf).toBe(true);
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/tasks.list_tasks', headers: authHeaders(A.token), payload: { enabled: true } });
    const conn = (await app.inject({ method: 'GET', url: '/v1/mcp/me/connections', headers: authHeaders(users.juniorA.token) })).json().data.find((x: any) => x.client_id === stream.client && x.status === 'active');
    await app.inject({ method: 'POST', url: `/v1/mcp/me/connections/${conn.id}/revoke`, headers: authHeaders(users.juniorA.token) });
    const ended = await Promise.race([
      (async () => { for (;;) { const r = await reader.read(); if (r.done) return true; } })(),
      new Promise<boolean>(res => setTimeout(() => res(false), 8000)),
    ]);
    expect(ended, 'stream closes when the connection is revoked').toBe(true);
    ac.abort();
  }, 120_000);

  it('higher-impact writes: draft invoice, payment, outbound message, payroll draft and trash', async () => {
    const c = await connect(A.token, 'mcp:read mcp:write');
    if (!c.ok) throw new Error(c.res.body);
    const at = c.access_token;
    for (const t of MCP_TOOLS.filter(x => x.access === 'write')) await app.inject({ method: 'PUT', url: `/v1/mcp/admin/tools/${t.id}`, headers: authHeaders(A.token), payload: { enabled: true } });
    const run = async (token: string, id: string, args: Record<string, unknown>) => {
      const s1 = await call(token, n(id), args);
      expect(s1.structuredContent?.status, `${id}: ${s1.content[0].text}`).toBe('confirmation_required');
      const s2 = await call(token, n(id), { ...args, confirmation_token: s1.structuredContent.confirmation_token });
      expect(s2.structuredContent?.status, `${id}: ${s2.content[0].text}`).toBe('done');
      (evidence.writes ??= []).push({ tool: id, ok: true, detail: s1.structuredContent.summary });
      return { summary: s1.structuredContent.summary as string, result: s2.structuredContent.result as any };
    };

    // Clients are told which tools reach outside Hudumika and which remove things.
    const listed = (await rpc(at, 'tools/list')).json().result.tools as any[];
    const ann = (name: string) => listed.find(t => t.name === n(name))?.annotations;
    expect(ann('bliss.send_customer_message')).toMatchObject({ openWorldHint: true, readOnlyHint: false });
    expect(ann('tasks.delete_task')).toMatchObject({ destructiveHint: true });
    expect(ann('finops.create_draft_invoice')).toMatchObject({ destructiveHint: false, openWorldHint: false });

    // Draft invoice: totals in the summary, created as Draft, invisible to the customer.
    const invArgs = { customer_id: ids.c1, currency: 'TZS', items: [{ name: 'Clearing fee', qty: 1, rate: 100000, tax_pct: 18 }, { name: 'Handling', qty: 2, rate: 25000 }], idempotency_key: 'mcp-h-inv-0001' };
    const inv = await run(at, 'finops.create_draft_invoice', invArgs);
    expect(inv.summary).toContain('TZS 168,000.00');
    expect(inv.result).toMatchObject({ status: 'Draft', customer_id: ids.c1 });
    expect((await call(tokens.c1, n('finops.get_invoice'), { id: inv.result.id })).isError).toBe(true);
    expect((await call(at, n('finops.create_draft_invoice'), { ...invArgs, items: [], idempotency_key: 'mcp-h-inv-0002' })).isError).toBe(true);
    expect((await call(at, n('finops.create_draft_invoice'), { ...invArgs, items: [{ name: 'x' }], idempotency_key: 'mcp-h-inv-0003' })).content[0].text).toMatch(/rate is required/);

    // Payments: refused on a draft and above the outstanding amount; recorded once.
    const onDraft = await call(at, n('finops.record_payment'), { invoice_id: inv.result.id, amount: 10, idempotency_key: 'mcp-h-pay-0000' });
    expect(onDraft.isError).toBe(true);
    expect(onDraft.content[0].text).toMatch(/Draft/);
    await withTenant(A.tenantId, trx => trx.insertInto('sales_invoice_lines').values({ invoice_id: ids.inv_c1, name: 'Port charges', qty: 1, rate: 50000, tax_pct: 0, currency: 'TZS' } as any).execute());
    const over = await call(at, n('finops.record_payment'), { invoice_id: ids.inv_c1, amount: 60000, idempotency_key: 'mcp-h-pay-0001' });
    expect(over.content[0].text).toMatch(/more than the TZS 50,000.00 outstanding/);
    const payArgs = { invoice_id: ids.inv_c1, amount: 20000, method: 'Bank transfer', idempotency_key: 'mcp-h-pay-0002' };
    const paid = await run(at, 'finops.record_payment', payArgs);
    expect(paid.summary).toContain('TZS 20,000.00');
    expect(paid.result.received).toBe(20000);
    const payments = async () => (await withTenant(A.tenantId, trx => trx.selectFrom('invoice_payments').select('id').where('invoice_id', '=', ids.inv_c1).execute())).length;
    expect(await payments()).toBe(1);
    expect((await call(at, n('finops.record_payment'), payArgs)).structuredContent).toMatchObject({ status: 'already_done', replayed: true });
    expect(await payments()).toBe(1);
    // Narrower than the route: SALES may draft invoices but not record payments.
    const sales = await A.addUser('SALES');
    const sc = await connect(sales.token, 'mcp:read mcp:write');
    if (!sc.ok) throw new Error(sc.res.body);
    const salesNames = await listNames(sc.access_token);
    expect(salesNames).toContain(n('finops.create_draft_invoice'));
    expect(salesNames).not.toContain(n('finops.record_payment'));
    expect(salesNames).not.toContain(n('nexushr.create_draft_payroll_run'));

    // Outbound message: the confirmation names the real recipient; refused when there is none.
    // (Not executed here: it would hand the message to the configured mail/SMS gateway.)
    const email = await call(at, n('bliss.send_customer_message'), { ticket_id: ids.ticket_c1, channel: 'EMAIL', content: 'Your container has been released.', idempotency_key: 'mcp-h-msg-0001' });
    expect(email.structuredContent?.status, email.content[0].text).toBe('confirmation_required');
    expect(email.structuredContent.summary).toContain(`c1-${A.tenantId.slice(0, 8)}@mcp-test.invalid`);
    expect(email.structuredContent.summary).toMatch(/leaves Hudumika/);
    const sms = await call(at, n('bliss.send_customer_message'), { ticket_id: ids.ticket_c1, channel: 'SMS', content: 'x', idempotency_key: 'mcp-h-msg-0002' });
    expect(sms.content[0].text).toMatch(/no phone number/);
    expect((await listNames(tokens.c1)).includes(n('bliss.send_customer_message'))).toBe(false);

    // Payroll: read the runs, start a draft; a second run for the same month is refused.
    const draftRun = await run(at, 'nexushr.create_draft_payroll_run', { period_year: 2031, period_month: 1, idempotency_key: 'mcp-h-pr-0001' });
    expect(draftRun.result).toMatchObject({ status: 'DRAFT', period_year: 2031, period_month: 1 });
    const runs = await call(at, n('nexushr.list_payroll_runs'), {});
    expect(runs.structuredContent.items.find((r: any) => r.id === draftRun.result.id)).toMatchObject({ status: 'DRAFT' });
    const dup = await call(at, n('nexushr.create_draft_payroll_run'), { period_year: 2031, period_month: 1, idempotency_key: 'mcp-h-pr-0002' });
    expect(dup.content[0].text).toMatch(/already exists/);

    // Trash: task and note leave their lists and are restorable (soft-deleted rows remain).
    const task = (await call(at, n('tasks.list_tasks'), { query: 'Call the shipping line' })).structuredContent.items[0];
    await run(at, 'tasks.delete_task', { task_id: task.id, idempotency_key: 'mcp-h-del-0001' });
    expect((await call(at, n('tasks.list_tasks'), {})).structuredContent.items.map((x: any) => x.id)).not.toContain(task.id);
    const trashedTask = await withTenant(A.tenantId, trx => trx.selectFrom('tasks').select(['id', 'deleted_at'] as any).where('id', '=', task.id).executeTakeFirstOrThrow()) as any;
    expect(trashedTask.deleted_at).not.toBeNull();
    const note = await app.inject({ method: 'POST', url: '/v1/notes', headers: authHeaders(A.token), payload: { title: 'Scratch', content: 'Delete me via MCP' } });
    const noteId = (note.json().note ?? note.json()).id;
    await run(at, 'notes.delete_note', { note_id: noteId, idempotency_key: 'mcp-h-del-0002' });
    expect((await call(at, n('notes.list_notes'), {})).structuredContent.items.map((x: any) => x.id)).not.toContain(noteId);
    expect((await call(at, n('notes.delete_note'), { note_id: crypto.randomUUID(), idempotency_key: 'mcp-h-del-0003' })).isError).toBe(true);
  }, 300_000);

  it('records an audit trail without argument values', async () => {
    const calls = await app.inject({ method: 'GET', url: '/v1/mcp/admin/calls?limit=500', headers: authHeaders(A.token) });
    const rows = calls.json().data as any[];
    expect(rows.length).toBeGreaterThan(10);
    const outcomes = new Set(rows.map(r => r.outcome));
    for (const o of ['ok', 'denied', 'invalid', 'confirmation_required', 'replayed']) expect(outcomes.has(o), o).toBe(true);
    const raw = JSON.stringify(rows);
    expect(raw).not.toContain('Call the shipping line');
    expect(raw).not.toContain('My container is late');
    expect(rows.find(r => r.tool_id === 'tasks.create_task')?.arg_names).toEqual(expect.arrayContaining(['idempotency_key', 'list_id', 'title']));
    // Non-admins cannot read the workspace log.
    expect((await app.inject({ method: 'GET', url: '/v1/mcp/admin/calls', headers: authHeaders(users.juniorA.token) })).statusCode).toBe(403);
  });

  it('a role change, a disabled app and a disabled tool take effect on existing connections', async () => {
    const c = await connect(users.managerA.token);
    if (!c.ok) throw new Error(c.res.body);
    expect(await listNames(c.access_token)).toContain(n('complyos.list_obligations'));
    await dbPlatform.updateTable('users').set({ role: 'JUNIOR' } as any).where('id', '=', users.managerA.userId).execute();
    expect(await listNames(c.access_token)).not.toContain(n('complyos.list_obligations'));

    await setEnabledApps(A.tenantId, { ...Object.fromEntries([...new Set(MCP_TOOLS.flatMap(t => [t.entitlement].flat().filter(Boolean) as string[]))].map(k => [k, true])), sms: false });
    expect(await listNames(tokens.adminA)).not.toContain(n('sms.messaging_stats'));
    const sms = await call(tokens.adminA, n('sms.messaging_stats'), {});
    expect(sms._meta?.['hudumika/errorCode']).toBe('entitlement');

    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/clearos.list_declarations', headers: authHeaders(A.token), payload: { enabled: false } });
    expect(await listNames(tokens.adminA)).not.toContain(n('clearos.list_declarations'));
  });

  it('tenant admins cannot reach platform-only or internal surfaces', async () => {
    const put = await app.inject({ method: 'PUT', url: '/v1/mcp/admin/tools/lens.list_items', headers: authHeaders(A.token), payload: { enabled: true } });
    expect(put.statusCode).toBe(404);
    const cat = (await app.inject({ method: 'GET', url: '/v1/mcp/admin/catalog', headers: authHeaders(A.token) })).json();
    const byApp = Object.fromEntries(cat.apps.map((a: any) => [a.app, a]));
    expect(byApp.lens.status).toBe('internal');
    expect(byApp.admin.status).toBe('platform_only');
    expect(byApp.lens.tools).toHaveLength(0);
    expect(cat.apps).toHaveLength(ALL_APP_IDS.length);
    for (const name of await listNames(tokens.adminA)) expect(name.startsWith('lens__') || name.startsWith('admin__')).toBe(false);
    // Platform operator accounts cannot link at all.
    const sa = await A.addUser('SUPER_ADMIN' as any);
    const res = await connect(sa.token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.res.statusCode).toBe(403);
    await dbPlatform.deleteFrom('users').where('id', '=', sa.userId).execute();
  });

  it('revocation ends existing connections immediately, including refresh', async () => {
    const c = await connect(users.juniorA.token);
    if (!c.ok) throw new Error(c.res.body);
    expect((await rpc(c.access_token, 'tools/list')).statusCode).toBe(200);
    const mine = (await app.inject({ method: 'GET', url: '/v1/mcp/me/connections', headers: authHeaders(users.juniorA.token) })).json().data;
    const conn = mine.find((x: any) => x.client_id === c.client);
    expect(conn.status).toBe('active');

    const rev = await app.inject({ method: 'POST', url: `/v1/mcp/admin/connections/${conn.id}/revoke`, headers: authHeaders(A.token) });
    expect(rev.statusCode).toBe(200);
    const after = await rpc(c.access_token, 'tools/list');
    expect(after.statusCode).toBe(401);
    expect(after.headers['www-authenticate']).toContain('invalid_token');
    const refresh = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/token', payload: { grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client } });
    expect(refresh.json().error).toBe('invalid_grant');

    // Self-service revoke by the customer, and a person cannot revoke someone else's.
    const custConns = (await app.inject({ method: 'GET', url: '/v1/mcp/me/connections', headers: authHeaders(users.c1.token) })).json().data;
    const active = custConns.find((x: any) => x.status === 'active');
    expect((await app.inject({ method: 'POST', url: `/v1/mcp/me/connections/${active.id}/revoke`, headers: authHeaders(users.juniorA.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/v1/mcp/me/connections/${active.id}/revoke`, headers: authHeaders(users.c1.token) })).statusCode).toBe(200);
    expect((await rpc(tokens.c1, 'tools/list')).statusCode).toBe(401);

    // Turning MCP off for staff stops staff connections.
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/policy', headers: authHeaders(A.token), payload: { staff_enabled: false } });
    expect((await rpc(tokens.adminA, 'tools/list')).statusCode).toBe(403);
    await app.inject({ method: 'PUT', url: '/v1/mcp/admin/policy', headers: authHeaders(A.token), payload: { staff_enabled: true } });
    // A refresh still works while a connection is active, and rotates.
    const fresh = await connect(B.token);
    if (!fresh.ok) throw new Error(fresh.res.body);
    const r1 = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/token', payload: { grant_type: 'refresh_token', refresh_token: fresh.refresh_token, client_id: fresh.client } });
    expect(r1.statusCode, r1.body).toBe(200);
    const reuse = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/token', payload: { grant_type: 'refresh_token', refresh_token: fresh.refresh_token, client_id: fresh.client } });
    expect(reuse.json().error).toBe('invalid_grant');
  });

  it('eSign: a customer login sees only its own envelopes (regression)', async () => {
    // A staff envelope sent to nobody in particular. Before the fix, omitting
    // `view` returned every envelope in the tenant to a CUSTOMER login.
    const env = await withTenant(A.tenantId, trx => trx.insertInto('sign_envelopes').values({ tenant_id: A.tenantId, created_by: A.userId, title: 'Internal board pack' } as any).returning('id').executeTakeFirstOrThrow());
    const staff = await app.inject({ method: 'GET', url: '/v1/sign/envelopes', headers: authHeaders(A.token) });
    expect(staff.statusCode, staff.body).toBe(200);
    expect((staff.json() as any[]).map(r => r.id)).toContain(env.id);
    for (const view of ['', '?status=draft', '?view=all', '?view=sent']) {
      const res = await app.inject({ method: 'GET', url: `/v1/sign/envelopes${view}`, headers: authHeaders(users.c2.token) });
      expect(res.statusCode, `${view} ${res.body}`).toBe(200);
      expect((res.json() as any[]).map(r => r.id), view).not.toContain(env.id);
    }
  });
});
