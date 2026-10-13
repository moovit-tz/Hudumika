import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { runStudioOutboxJob } from '../jobs/studio-outbox.job.js';
import { deliverStudioEvent } from '../subscribers/studio.subscribers.js';
import { ACTIONS_BY_ID } from '../studio/actions.js';
import { createTestTenant, type TestTenant } from './helpers.js';

describe('Studio transactional delivery', () => {
  let tenant: TestTenant;
  const event = { type: 'onsite.domain.created', sourceApp: 'onsite', entityType: 'onsite_domain', entityId: null, payload: { domain: 'example.tz' } };
  beforeAll(async () => {
    tenant = await createTestTenant();
    await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { studio: true } }) }).execute();
  }, 120000);
  afterAll(async () => { await tenant?.cleanup(); }, 120000);
  it('rolls the event and delivery back with the business transaction', async () => {
    await expect(withTenant(tenant.tenantId, async trx => {
      await emitDomainEvent(trx, tenant.tenantId, event, { deferDispatch: true });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await dbPlatform.selectFrom('studio_event_outbox').select('id').where('tenant_id', '=', tenant.tenantId).execute()).toHaveLength(0);
  });
  it('executes after commit once even with concurrent delivery workers', async () => {
    const nodes = [{ id: 'start', type: 'trigger', eventOrAction: event.type },
      { id: 'notify', type: 'action', eventOrAction: 'notification.send_in_app', config: { input: { userId: tenant.userId, title: 'Test' } } }];
    await dbPlatform.insertInto('workflow_studio_apps').values({ tenant_id: tenant.tenantId, name: 'Outbox test', status: 'ACTIVE', trigger_event: event.type,
      nodes: JSON.stringify(nodes), edges: JSON.stringify([{ source: 'start', target: 'notify' }]) }).execute();
    const action = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockResolvedValue({ ok: true, detail: 'Test' });
    try {
      await withTenant(tenant.tenantId, trx => emitDomainEvent(trx, tenant.tenantId, event));
      expect(action).not.toHaveBeenCalled();
      await Promise.all([runStudioOutboxJob(tenant.tenantId), runStudioOutboxJob(tenant.tenantId)]);
      expect(action).toHaveBeenCalledTimes(1);
      const rows = await dbPlatform.selectFrom('studio_event_outbox').select('status').where('tenant_id', '=', tenant.tenantId).execute();
      expect(rows).toEqual([{ status: 'delivered' }]);
      await runStudioOutboxJob(tenant.tenantId);
      expect(action).toHaveBeenCalledTimes(1);
    } finally { action.mockRestore(); }
  });
  it('rejects a snapshot from another tenant before executing actions', async () => {
    await expect(deliverStudioEvent(tenant.tenantId, event, [{ id: tenant.userId, tenant_id: 'other-tenant', trigger_event: event.type }]))
      .rejects.toThrow('Invalid queued workflow snapshots');
  });
  it('keeps the queued graph when its workflow is edited', async () => {
    const action = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockResolvedValue({ ok: true, detail: 'Test' });
    try {
      const queued = await withTenant(tenant.tenantId, trx => emitDomainEvent(trx, tenant.tenantId, event, { deferDispatch: true }));
      await withTenant(tenant.tenantId, trx => trx.updateTable('workflow_studio_apps').set({ nodes: '[]' })
        .where('tenant_id', '=', tenant.tenantId).execute());
      await runStudioOutboxJob(tenant.tenantId);
      expect(action).toHaveBeenCalledTimes(1);
      const run = await withTenant(tenant.tenantId, trx => trx.selectFrom('workflow_studio_runs').select(['status', 'workflow_snapshot'])
        .where('tenant_id', '=', tenant.tenantId).where('domain_event_id', '=', queued.id!).executeTakeFirstOrThrow());
      expect(run.status).toBe('SUCCESS');
      expect((run.workflow_snapshot as any).nodes).toHaveLength(2);
    } finally { action.mockRestore(); }
  });
  it('honours pause even when the event has a frozen graph', async () => {
    await withTenant(tenant.tenantId, trx => emitDomainEvent(trx, tenant.tenantId, event, { deferDispatch: true }));
    await withTenant(tenant.tenantId, trx => trx.updateTable('workflow_studio_apps').set({ status: 'PAUSED' })
      .where('tenant_id', '=', tenant.tenantId).execute());
    const action = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockResolvedValue({ ok: true, detail: 'Test' });
    try {
      await runStudioOutboxJob(tenant.tenantId);
      expect(action).not.toHaveBeenCalled();
    } finally { action.mockRestore(); }
  });
  it('recovers an expired delivery lease without repeating the completed workflow', async () => {
    await dbPlatform.updateTable('studio_event_outbox').set({ status: 'processing', available_at: new Date(0), lease_id: '00000000-0000-0000-0000-000000000001' })
      .where('tenant_id', '=', tenant.tenantId).execute();
    const action = vi.spyOn(ACTIONS_BY_ID.get('notification.send_in_app')!, 'execute').mockResolvedValue({ ok: true, detail: 'Test' });
    try {
      await runStudioOutboxJob(tenant.tenantId);
      expect(action).not.toHaveBeenCalled();
      const row = await dbPlatform.selectFrom('studio_event_outbox').select(['status', 'attempts', 'lease_id']).where('tenant_id', '=', tenant.tenantId).orderBy('created_at').executeTakeFirstOrThrow();
      expect(row).toEqual({ status: 'delivered', attempts: 2, lease_id: null });
    } finally { action.mockRestore(); }
  });
});
