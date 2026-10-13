import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { ACTIONS_BY_ID } from '../studio/actions.js';
import { executeAndRecord } from '../studio/executor.js';
import { runStudioOutboxJob } from '../jobs/studio-outbox.job.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Studio delivery recovery API', () => {
  let tenant: TestTenant;
  let other: TestTenant;
  let workflowId: string;
  const event = { type: 'onsite.domain.created', sourceApp: 'onsite', entityType: 'onsite_domain', entityId: null, payload: { domain: 'example.tz' } };
  beforeAll(async () => {
    tenant = await createTestTenant(); other = await createTestTenant();
    for (const t of [tenant, other]) await dbPlatform.insertInto('tenant_settings').values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'enabled-apps': { studio: true } }) }).execute();
    const row = await withTenant(tenant.tenantId, trx => trx.insertInto('workflow_studio_apps').values({ tenant_id: tenant.tenantId,
      name: 'Recovery test', status: 'ACTIVE', trigger_event: event.type,
      nodes: JSON.stringify([{ id: 'start', type: 'trigger', eventOrAction: event.type }, { id: 'notify', type: 'action', eventOrAction: 'notification.send_in_app', config: { input: { userId: tenant.userId, title: 'Test' } } }]),
      edges: JSON.stringify([{ source: 'start', target: 'notify' }]) }).returning('id').executeTakeFirstOrThrow());
    workflowId = row.id;
  }, 120000);
  afterAll(async () => { await tenant?.cleanup(); await other?.cleanup(); }, 120000);
  async function deadDelivery() {
    return withTenant(tenant.tenantId, async trx => {
      const emitted = await emitDomainEvent(trx, tenant.tenantId, event, { deferDispatch: true });
      return trx.updateTable('studio_event_outbox').set({ status: 'dead', attempts: 8 }).where('tenant_id', '=', tenant.tenantId)
        .where('event_id', '=', emitted.id!).returningAll().executeTakeFirstOrThrow();
    });
  }
  async function retry(id: string, token = tenant.token, payload: Record<string, unknown> = { confirmed: true, reason: 'Infrastructure repaired and reviewed' }) {
    return (await getApp()).inject({ method: 'POST', url: `/v1/workflow-studio/deliveries/${id}/retry`, headers: authHeaders(token), payload });
  }
  it('queues one retry and records the actor and review reason atomically', async () => {
    const row = await deadDelivery();
    const results = await Promise.all([retry(row.id), retry(row.id)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([202, 409]);
    const detail = await (await getApp()).inject({ method: 'GET', url: `/v1/workflow-studio/deliveries/${row.id}`, headers: authHeaders(tenant.token) });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.status).toBe('pending');
    expect(detail.json().data.recoveries).toHaveLength(1);
    expect(detail.json().data.recoveries[0]).toMatchObject({ actor_id: tenant.userId, previous_attempts: 8 });
  });
  it('does not expose or retry another tenant delivery', async () => {
    const row = await deadDelivery();
    expect((await retry(row.id, other.token)).statusCode).toBe(404);
    const detail = await (await getApp()).inject({ method: 'GET', url: `/v1/workflow-studio/deliveries/${row.id}`, headers: authHeaders(other.token) });
    expect(detail.statusCode).toBe(404);
  });
  it('requires an administrator and explicit review confirmation', async () => {
    const row = await deadDelivery(); const viewer = await tenant.addUser('JUNIOR');
    expect((await retry(row.id, viewer.token)).statusCode).toBe(403);
    expect((await retry(row.id, tenant.token, { reason: 'Infrastructure repaired' })).statusCode).toBe(400);
  });
  it('blocks uncertain, failed and partially completed runs', async () => {
    for (const status of ['RUNNING', 'FAILED', 'PARTIAL']) {
      const row = await deadDelivery();
      await withTenant(tenant.tenantId, trx => trx.insertInto('workflow_studio_runs').values({ tenant_id: tenant.tenantId, workflow_id: workflowId,
        domain_event_id: row.event_id, status, trigger_source: 'test', error_message: null }).execute());
      expect((await retry(row.id)).statusCode).toBe(409);
    }
  });
  it('blocks legacy deliveries with no frozen graph', async () => {
    const row = await deadDelivery();
    await withTenant(tenant.tenantId, trx => trx.updateTable('studio_event_outbox').set({ workflow_snapshots: null })
      .where('tenant_id', '=', tenant.tenantId).where('id', '=', row.id).execute());
    expect((await retry(row.id)).statusCode).toBe(409);
  });
  async function claimedRun(status: string, old = false) {
    const delivery = await deadDelivery();
    const run = await withTenant(tenant.tenantId, trx => trx.insertInto('workflow_studio_runs').values({
      tenant_id: tenant.tenantId, workflow_id: workflowId, domain_event_id: delivery.event_id,
      status, trigger_source: 'test', error_message: 'Original failure',
      ...(old ? { created_at: new Date(Date.now() - 31 * 60_000) } : {}),
    }).returning('id').executeTakeFirstOrThrow());
    return { run, delivery };
  }
  async function review(id: string, token = tenant.token) {
    return (await getApp()).inject({ method: 'POST', url: `/v1/workflow-studio/runs/${id}/reconcile`, headers: authHeaders(token),
      payload: { confirmed: true, outcome: 'effects_verified', evidence: 'Verified records in the affected application; no additional effects required.' } });
  }
  async function cancel(id: string, token = tenant.token, payload: unknown = { confirmed: true, reason: 'Operator stopped this execution' }) {
    return (await getApp()).inject({ method: 'POST', url: `/v1/workflow-studio/runs/${id}/cancel`, headers: authHeaders(token), payload: payload as any });
  }
  it('accepts one audited cancellation request without pretending the worker stopped', async () => {
    const { run } = await claimedRun('RUNNING');
    const results = await Promise.all([cancel(run.id), cancel(run.id)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([202, 409]);
    const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').selectAll().where('tenant_id', '=', tenant.tenantId).where('id', '=', run.id).executeTakeFirstOrThrow());
    expect(row.status).toBe('RUNNING');
    expect(row.cancellation).toMatchObject({ actor_id: tenant.userId, reason: 'Operator stopped this execution' });
    expect(row.cancellation_acknowledged_at).toBeNull();
  });
  it('checks cancellation role, tenant, confirmation and terminal status', async () => {
    const { run } = await claimedRun('RUNNING'); const viewer = await tenant.addUser('JUNIOR');
    expect((await cancel(run.id, other.token)).statusCode).toBe(404);
    expect((await cancel(run.id, viewer.token)).statusCode).toBe(403);
    expect((await cancel(run.id, tenant.token, { reason: 'No confirmation' })).statusCode).toBe(400);
    const terminal = await claimedRun('SUCCESS');
    expect((await cancel(terminal.run.id)).statusCode).toBe(409);
  });
  it('acknowledges cancellation after the in-flight action settles and prevents the next effect', async () => {
    const workflow = { id: workflowId, trigger_event: 'manual.run', nodes: [
      { id: 'start', type: 'trigger', eventOrAction: 'manual.run' },
      ...['one', 'two'].map(id => ({ id, type: 'action', eventOrAction: 'notification.send_in_app', config: { input: { userId: tenant.userId, title: id } } })),
    ], edges: [{ source: 'start', target: 'one' }, { source: 'one', target: 'two' }] };
    let runId = '';
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockImplementation(async () => {
      const claim = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').select('id').where('tenant_id', '=', tenant.tenantId).where('trigger_source', '=', 'cancellation-test').executeTakeFirstOrThrow());
      runId = claim.id;
      expect((await cancel(runId)).statusCode).toBe(202);
      const pending = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').select(['status', 'cancellation_acknowledged_at']).where('tenant_id', '=', tenant.tenantId).where('id', '=', runId).executeTakeFirstOrThrow());
      expect(pending).toEqual({ status: 'RUNNING', cancellation_acknowledged_at: null });
      return { ok: true, detail: 'First effect completed' };
    });
    try {
      const result = await executeAndRecord({ tenantId: tenant.tenantId, workflow, payload: {}, entityId: null, domainEventId: null, simulate: false, triggerSource: 'cancellation-test' });
      expect(result?.status).toBe('PARTIAL'); expect(spy).toHaveBeenCalledTimes(1);
      const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').select(['cancellation_acknowledged_at', 'step_results']).where('tenant_id', '=', tenant.tenantId).where('id', '=', runId).executeTakeFirstOrThrow());
      expect(row.cancellation_acknowledged_at).not.toBeNull();
      const steps = typeof row.step_results === 'string' ? JSON.parse(row.step_results) : row.step_results;
      expect(steps.find((s: any) => s.node_id === 'one').status).toBe('SUCCESS');
      expect(steps.find((s: any) => s.node_id === 'two').status).toBe('FAILED');
    } finally { spy.mockRestore(); }
  });
  async function fencingWorkflow() {
    return { id: workflowId, trigger_event: 'manual.run', nodes: [
      { id: 'start', type: 'trigger', eventOrAction: 'manual.run' },
      ...['one', 'two'].map(id => ({ id, type: 'action', eventOrAction: 'notification.send_in_app', config: { input: { userId: tenant.userId, title: id } } })),
    ], edges: [{ source: 'start', target: 'one' }, { source: 'one', target: 'two' }] };
  }
  it('keeps a completed action checkpoint when execution is interrupted', async () => {
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockResolvedValue({ ok: true, detail: 'Completed effect' });
    try {
      await expect(executeAndRecord({ tenantId: tenant.tenantId, workflow: await fencingWorkflow(), payload: {}, entityId: null, domainEventId: null, simulate: false, triggerSource: 'checkpoint-test',
        checkpoint: async steps => { if (steps.some(s => s.node_id === 'one')) throw new Error('Worker interrupted'); },
      })).rejects.toThrow('Worker interrupted');
      const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').selectAll().where('tenant_id', '=', tenant.tenantId).where('trigger_source', '=', 'checkpoint-test').executeTakeFirstOrThrow());
      expect(row.status).toBe('RUNNING'); expect(row.active_step).toBeNull(); expect(spy).toHaveBeenCalledTimes(1);
      const response = await (await getApp()).inject({ method: 'GET', url: `/v1/workflow-studio/apps/${workflowId}/runs`, headers: authHeaders(tenant.token) });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.find((r: any) => r.id === row.id)).not.toHaveProperty('worker_token');
      const steps = typeof row.step_results === 'string' ? JSON.parse(row.step_results) : row.step_results;
      expect(steps.find((s: any) => s.node_id === 'one').status).toBe('SUCCESS');
    } finally { spy.mockRestore(); }
  });
  for (const invalidation of ['expiry', 'token'] as const) it(`fences ${invalidation} changes during an action without overwriting uncertain evidence`, async () => {
    const source = `fence-${invalidation}`;
    const spy = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockImplementation(async () => {
      const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').selectAll().where('tenant_id', '=', tenant.tenantId).where('trigger_source', '=', source).executeTakeFirstOrThrow());
      expect(row.active_step).toMatchObject({ node_id: 'one' });
      await withTenant(tenant.tenantId, trx => trx.updateTable('workflow_studio_runs')
        .set(invalidation === 'expiry' ? { worker_expires_at: new Date(Date.now() - 10000) } : { worker_token: '00000000-0000-0000-0000-000000000001' })
        .where('tenant_id', '=', tenant.tenantId).where('id', '=', row.id).execute());
      return { ok: true, detail: 'Effect completed after claim loss' };
    });
    try {
      await expect(executeAndRecord({ tenantId: tenant.tenantId, workflow: await fencingWorkflow(), payload: {}, entityId: null, domainEventId: null, simulate: false, triggerSource: source })).rejects.toThrow('claim expired or changed');
      expect(spy).toHaveBeenCalledTimes(1);
      const row = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').selectAll().where('tenant_id', '=', tenant.tenantId).where('trigger_source', '=', source).executeTakeFirstOrThrow());
      expect(row.status).toBe('RUNNING'); expect(row.active_step).toMatchObject({ node_id: 'one' });
      const steps = typeof row.step_results === 'string' ? JSON.parse(row.step_results) : row.step_results;
      expect(steps).toHaveLength(1); expect(steps[0].node_type).toBe('trigger');
    } finally { spy.mockRestore(); }
  });
  it('records one immutable review while preserving the failed execution', async () => {
    const { run, delivery } = await claimedRun('FAILED');
    const results = await Promise.all([review(run.id), review(run.id)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const detail = await (await getApp()).inject({ method: 'GET', url: `/v1/workflow-studio/runs/${run.id}`, headers: authHeaders(tenant.token) });
    expect(detail.json().data).toMatchObject({ status: 'FAILED', error_message: 'Original failure',
      reconciliation: { actor_id: tenant.userId, status_at_review: 'FAILED', outcome: 'effects_verified' } });
    expect((await retry(delivery.id)).statusCode).toBe(202);
    await withTenant(tenant.tenantId, trx => trx.updateTable('studio_event_outbox').set({ available_at: new Date(Date.now() + 3600_000) })
      .where('tenant_id', '=', tenant.tenantId).where('id', '!=', delivery.id).execute());
    const action = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockResolvedValue({ ok: true, detail: 'Test' });
    try { await runStudioOutboxJob(tenant.tenantId); expect(action).not.toHaveBeenCalled(); }
    finally { action.mockRestore(); }
  });
  it('refuses review of a recent executing run', async () => {
    const { run } = await claimedRun('RUNNING');
    expect((await review(run.id)).statusCode).toBe(409);
  });
  it('allows an old running-run review but continues blocking delivery retry', async () => {
    const { run, delivery } = await claimedRun('RUNNING', true);
    expect((await review(run.id)).statusCode).toBe(200);
    expect((await retry(delivery.id)).statusCode).toBe(409);
  });
  it('isolates run reviews and requires an administrator', async () => {
    const { run } = await claimedRun('PARTIAL'); const viewer = await tenant.addUser('JUNIOR');
    expect((await review(run.id, other.token)).statusCode).toBe(404);
    expect((await review(run.id, viewer.token)).statusCode).toBe(403);
    const detail = await (await getApp()).inject({ method: 'GET', url: `/v1/workflow-studio/runs/${run.id}`, headers: authHeaders(other.token) });
    expect(detail.statusCode).toBe(404);
  });

});
