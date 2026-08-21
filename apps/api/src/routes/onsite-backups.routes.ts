import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { snapshotTenant, restoreSnapshot, type OnsiteConfigSnapshot } from '../services/onsite-backup.service.js';
import { emitDomainEvent } from '../services/domain-events.service.js';

const DEFAULT_RETENTION_DAYS = 30;
const retentionSchema = z.object({ retention_days: z.number().int().min(1).max(365) });

function actorId(request: FastifyRequest): string | null {
  const sub = request.user?.sub ?? '';
  return sub.startsWith('apikey:') ? null : sub;
}

export async function onsiteBackupsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('onsite'));

  fastify.get('/', async (request: FastifyRequest) => {
    const tenantId = request.user.tenant_id;
    const backups = await withTenant(tenantId, trx => trx.selectFrom('onsite_backups')
      .select(['id', 'trigger', 'status', 'size_bytes', 'error_message', 'created_by', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .execute());
    return { data: backups };
  });

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    try {
      const { snapshot, sizeBytes } = await snapshotTenant(tenantId);
      const row = await withTenant(tenantId, async (trx) => {
        const created = await trx.insertInto('onsite_backups').values({
          tenant_id: tenantId,
          trigger: 'manual',
          status: 'completed',
          snapshot: JSON.stringify(snapshot),
          size_bytes: sizeBytes,
          created_by: actorId(request),
        }).returning(['id', 'trigger', 'status', 'size_bytes', 'created_by', 'created_at']).executeTakeFirstOrThrow();
        emitDomainEvent(trx, tenantId, {
          type: 'onsite.backup.created', sourceApp: 'onsite', entityType: 'onsite_backup', entityId: created.id,
          payload: { trigger: 'manual', size_bytes: sizeBytes }, actorId: actorId(request),
        }).catch(console.error);
        return created;
      });
      return reply.status(201).send(row);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to create backup: ${err?.message ?? err}` });
    }
  });

  fastify.post('/:id/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;
    const backup = await withTenant(tenantId, trx => trx.selectFrom('onsite_backups').selectAll()
      .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!backup) return reply.status(404).send({ error: 'Backup not found' });
    if (backup.status !== 'completed') return reply.status(400).send({ error: 'This backup did not complete successfully and cannot be restored' });

    const snapshot = (typeof backup.snapshot === 'string' ? JSON.parse(backup.snapshot) : backup.snapshot) as OnsiteConfigSnapshot;
    await restoreSnapshot(tenantId, snapshot);

    await withTenant(tenantId, trx => emitDomainEvent(trx, tenantId, {
      type: 'onsite.backup.restored', sourceApp: 'onsite', entityType: 'onsite_backup', entityId: backup.id,
      payload: { created_at: backup.created_at }, actorId: actorId(request),
    })).catch(console.error);

    return { success: true };
  });

  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;
    const res = await withTenant(tenantId, trx => trx.deleteFrom('onsite_backups')
      .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Backup not found' });
    return { success: true };
  });

  fastify.get('/retention', async (request: FastifyRequest) => {
    const tenantId = request.user.tenant_id;
    const row = await withTenant(tenantId, trx => trx.selectFrom('tenant_settings')
      .select('settings').where('tenant_id', '=', tenantId).executeTakeFirst());
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return { retention_days: settings['onsite-backup-retention-days'] ?? DEFAULT_RETENTION_DAYS };
  });

  fastify.put('/retention', { preHandler: [requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN')] }, async (request: FastifyRequest) => {
    const tenantId = request.user.tenant_id;
    const { retention_days } = retentionSchema.parse(request.body);
    await withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', tenantId).executeTakeFirst();
      const current = existing ? (typeof existing.settings === 'string' ? JSON.parse(existing.settings) : existing.settings) : {};
      const merged = { ...current, 'onsite-backup-retention-days': retention_days };
      if (existing) {
        await trx.updateTable('tenant_settings').set({ settings: JSON.stringify(merged), updated_at: new Date() })
          .where('tenant_id', '=', tenantId).execute();
      } else {
        await trx.insertInto('tenant_settings').values({ tenant_id: tenantId, settings: JSON.stringify(merged) }).execute();
      }
    });
    return { retention_days };
  });
}
