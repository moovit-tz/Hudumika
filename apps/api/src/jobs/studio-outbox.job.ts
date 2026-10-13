import { randomUUID } from 'node:crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { deliverStudioEvent } from '../subscribers/studio.subscribers.js';

export async function runStudioOutboxJob(onlyTenantId?: string): Promise<void> {
  // Audited cross-tenant discovery only; claims, event reads and updates use tenant scope.
  const due = await dbPlatform.selectFrom('studio_event_outbox').select(['id', 'tenant_id'])
    .$if(Boolean(onlyTenantId), query => query.where('tenant_id', '=', onlyTenantId!))
    .where('status', 'in', ['pending', 'processing']).where('available_at', '<=', new Date())
    .orderBy('available_at').limit(50).execute();
  for (const item of due) {
    const lease = randomUUID();
    const claimed = await withTenant(item.tenant_id, async trx => {
      const row = await trx.selectFrom('studio_event_outbox').selectAll().where('tenant_id', '=', item.tenant_id)
        .where('id', '=', item.id).where('status', 'in', ['pending', 'processing']).where('available_at', '<=', new Date())
        .forUpdate().skipLocked().executeTakeFirst();
      if (!row) return null;
      await trx.updateTable('studio_event_outbox').set({ status: 'processing', lease_id: lease, attempts: row.attempts + 1,
        available_at: new Date(Date.now() + 5 * 60_000) }).where('tenant_id', '=', item.tenant_id).where('id', '=', row.id).execute();
      const event = await trx.selectFrom('domain_events').selectAll().where('tenant_id', '=', item.tenant_id).where('id', '=', row.event_id).executeTakeFirstOrThrow();
      return { row, event };
    });
    if (!claimed) continue;
    let failure = false;
    try {
      const event = claimed.event;
      await deliverStudioEvent(item.tenant_id, { id: event.id, type: event.event_type, sourceApp: event.source_app,
        entityType: event.entity_type, entityId: event.entity_id, actorId: event.actor_id,
        payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload as Record<string, unknown> },
        typeof claimed.row.workflow_snapshots === 'string' ? JSON.parse(claimed.row.workflow_snapshots) : claimed.row.workflow_snapshots);
    } catch { failure = true; }
    await withTenant(item.tenant_id, trx => trx.updateTable('studio_event_outbox').set({
      status: failure ? claimed.row.attempts >= 7 ? 'dead' : 'pending' : 'delivered',
      available_at: new Date(Date.now() + Math.min(60, 2 ** (claimed.row.attempts + 1)) * 60_000),
      error_message: failure ? 'Studio delivery failed; inspect workflow runs before recovery' : null,
      lease_id: null,
    }).where('tenant_id', '=', item.tenant_id).where('id', '=', item.id).where('lease_id', '=', lease).execute());
  }
}
