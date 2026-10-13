import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ACTIONS_BY_ID } from '../studio/actions.js';
import { validateExecutableGraph } from '../studio/validation.js';
import { executeAndRecord } from '../studio/executor.js';
import { dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

const nodes = [
  { id: 'start', type: 'trigger', eventOrAction: 'manual.run' },
  { id: 'notify', type: 'action', eventOrAction: 'notification.send_in_app', config: { input: { userId: '00000000-0000-0000-0000-000000000000', title: 'Test' } } },
];
const edges = [{ source: 'start', target: 'notify' }];
describe('Studio graph validation', () => {
  it('accepts a supported linear graph', () => expect(validateExecutableGraph('manual.run', nodes, edges)).toEqual([]));
  it('rejects disconnected actions and cycles', () => {
    expect(validateExecutableGraph('manual.run', nodes, []).join(' ')).toContain('reachable');
    expect(validateExecutableGraph('manual.run', nodes, [...edges, { source: 'notify', target: 'start' }]).join(' ')).toContain('Cycles');
  });
  it('rejects branching rather than executing it as a sequence', () => {
    expect(validateExecutableGraph('manual.run', [...nodes, { ...nodes[1], id: 'other' }], [...edges, { source: 'start', target: 'other' }]).join(' ')).toContain('Branching');
  });
  it('blocks unregistered actions and restricted ledger writes', () => {
    expect(validateExecutableGraph('manual.run', [nodes[0], { ...nodes[1], eventOrAction: 'send_email' }], edges).join(' ')).toContain('not registered');
    expect(validateExecutableGraph('manual.run', [nodes[0], { ...nodes[1], eventOrAction: 'seal.release_lot' }], edges).join(' ')).toContain('approval');
  });
});

describe('Studio database run claims', () => {
  let tenant: TestTenant;
  let workflow: any;
  beforeAll(async () => {
    tenant = await createTestTenant();
    await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { studio: true } }) }).execute();
    workflow = await dbPlatform.insertInto('workflow_studio_apps').values({ tenant_id: tenant.tenantId, name: 'Claim test', status: 'DRAFT', trigger_event: 'manual.run', nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }).returningAll().executeTakeFirstOrThrow();
  }, 120000);
  afterAll(async () => { await tenant?.cleanup(); }, 120000);
  it('claims one run for concurrent delivery and does not rerun a completed claim', async () => {
    const opts = { tenantId: tenant.tenantId, workflow, payload: {}, entityId: null, domainEventId: '999999999', simulate: true, triggerSource: 'test' };
    const outcomes = await Promise.all([executeAndRecord(opts), executeAndRecord(opts)]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await executeAndRecord(opts)).toBeNull();
    const rows = await dbPlatform.selectFrom('workflow_studio_runs').select('status').where('tenant_id', '=', tenant.tenantId).where('workflow_id', '=', workflow.id).execute();
    expect(rows).toEqual([{ status: 'SIMULATED' }]);
  });
  it('creates drafts and refuses invalid activation', async () => {
    const api = await getApp();
    const created = await api.inject({ method: 'POST', url: '/v1/workflow-studio/apps', headers: authHeaders(tenant.token), payload: { name: 'Safe default', trigger_event: 'manual.run' } });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().data.status).toBe('DRAFT');
    expect(created.json().data.nodes).toHaveLength(1);
    const activated = await api.inject({ method: 'PATCH', url: `/v1/workflow-studio/apps/${created.json().data.id}`, headers: authHeaders(tenant.token), payload: { status: 'ACTIVE' } });
    expect(activated.statusCode).toBe(400);
  });
  it('executes an action only once under concurrent real delivery', async () => {
    const action = ACTIONS_BY_ID.get('notification.send_in_app')!;
    const execute = vi.spyOn(action, 'execute').mockResolvedValue({ ok: true, detail: 'Test action' });
    try {
      const opts = { tenantId: tenant.tenantId, workflow, payload: {}, entityId: null, domainEventId: '999999998', simulate: false, triggerSource: 'test' };
      const outcomes = await Promise.all([executeAndRecord(opts), executeAndRecord(opts)]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally { execute.mockRestore(); }
  });
  it('denies workflow mutation to a non-admin', async () => {
    const viewer = await tenant.addUser('JUNIOR');
    const response = await (await getApp()).inject({ method: 'POST', url: '/v1/workflow-studio/apps', headers: authHeaders(viewer.token), payload: { name: 'Unauthorized', trigger_event: 'manual.run' } });
    expect(response.statusCode).toBe(403);
  });
});
