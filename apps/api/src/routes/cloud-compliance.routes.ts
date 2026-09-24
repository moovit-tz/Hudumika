import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { env } from '../config/env.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { DEFAULT_RETENTION_DAYS } from '../lib/cloud-retention.js';

/**
 * Retention policy, legal hold and the compliance report for Cloud
 * (migration 504). Registered under /v1/files alongside files.routes.ts;
 * the paths here never collide with its `/:id` routes (`/:id/legal-hold` is
 * a distinct suffix, the rest are static). Enforcement itself — refusing to
 * permanently delete a locked file — lives in files.routes.ts and
 * jobs/cloud-trash-expiry.job.ts via lib/cloud-retention.ts.
 */
const COMPLIANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

export async function cloudComplianceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('cloud'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (!COMPLIANCE_ROLES.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Only workspace admins can manage retention and legal holds.' });
    }
  });

  // Effective retention per class: the built-in default, or this tenant's override.
  fastify.get('/retention-policies', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const overrides = await trx.selectFrom('cloud_retention_policies').select(['retention_class', 'retain_days'])
        .where('tenant_id', '=', user.tenant_id).execute();
      const map = new Map(overrides.map(o => [o.retention_class, o.retain_days]));
      const classes = new Set([...Object.keys(DEFAULT_RETENTION_DAYS), ...map.keys()]);
      return [...classes].map(c => ({
        retention_class: c,
        retain_days: map.has(c) ? map.get(c)! : (DEFAULT_RETENTION_DAYS[c] ?? 0),
        is_default: !map.has(c),
        default_days: DEFAULT_RETENTION_DAYS[c] ?? 0,
      }));
    });
  });

  // Applies to files filed after the change; already-filed files keep the
  // retain_until they were stamped with (shortening a policy must never
  // retroactively unlock records that were filed under a longer one).
  fastify.put('/retention-policies/:retentionClass', async (req, reply) => {
    const user = req.user;
    const { retentionClass } = req.params as { retentionClass: string };
    const days = Number((req.body as any)?.retain_days);
    if (!/^[a-z_]{1,40}$/.test(retentionClass)) return reply.status(400).send({ error: 'Invalid retention class' });
    if (!Number.isInteger(days) || days < 0 || days > 36500) return reply.status(400).send({ error: 'retain_days must be a whole number of days between 0 and 36500' });
    return withTenant(user.tenant_id, async (trx) => {
      await trx.insertInto('cloud_retention_policies')
        .values({ tenant_id: user.tenant_id, retention_class: retentionClass, retain_days: days, updated_by: user.sub })
        .onConflict(oc => oc.columns(['tenant_id', 'retention_class']).doUpdateSet({ retain_days: days, updated_by: user.sub, updated_at: new Date() }))
        .execute();
      return { retention_class: retentionClass, retain_days: days };
    });
  });

  // Place or release a legal hold on a file, or on every file under a folder.
  fastify.put('/:id/legal-hold', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { hold, reason } = (req.body ?? {}) as { hold?: boolean; reason?: string };
    if (typeof hold !== 'boolean') return reply.status(400).send({ error: 'hold (boolean) is required' });
    if (hold && !reason?.trim()) return reply.status(400).send({ error: 'A reason is required to place a legal hold.' });
    return withTenant(user.tenant_id, async (trx) => {
      const item = await trx.selectFrom('cloud_files').select(['id', 'name']).where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!item) return reply.status(404).send({ error: 'Not found' });
      const res = await sql<{ id: string }>`
        WITH RECURSIVE subtree AS (
          SELECT id FROM cloud_files WHERE id = ${id} AND tenant_id = ${user.tenant_id}
          UNION ALL
          SELECT c.id FROM cloud_files c JOIN subtree s ON c.parent_id = s.id WHERE c.tenant_id = ${user.tenant_id}
        )
        UPDATE cloud_files SET legal_hold = ${hold}, legal_hold_reason = ${hold ? reason!.trim() : null}, updated_at = now()
        WHERE tenant_id = ${user.tenant_id} AND id IN (SELECT id FROM subtree) AND type <> 'folder'
        RETURNING id`.execute(trx);
      await emitDomainEvent(trx, user.tenant_id, {
        type: hold ? 'cloud.legal_hold.placed' : 'cloud.legal_hold.released', sourceApp: 'cloud', entityType: 'document', entityId: id,
        payload: { name: item.name, files_affected: res.rows.length, reason: hold ? reason!.trim() : null }, actorId: user.sub,
      });
      return { ok: true, legal_hold: hold, files_affected: res.rows.length };
    });
  });

  // What is retained, held, unscanned, quarantined, or missing from storage.
  fastify.get('/compliance/report', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const base = () => trx.selectFrom('cloud_files').where('tenant_id', '=', user.tenant_id).where('type', '!=', 'folder');
      const count = async (q: ReturnType<typeof base>) =>
        Number((await q.select(({ fn }) => fn.countAll<string>().as('n')).executeTakeFirst())?.n ?? 0);
      const [files, legalHold, underRetention, infected, unscanned, missing, byClass] = await Promise.all([
        count(base()),
        count(base().where('legal_hold', '=', true)),
        count(base().where('retain_until', '>', new Date())),
        count(base().where('scan_status', '=', 'infected')),
        count(base().where(eb => eb.or([eb('scan_status', 'is', null), eb('scan_status', '=', 'skipped')]))),
        count(base().where('storage_missing', '=', true)),
        base().select('retention_class').select(({ fn }) => fn.countAll<string>().as('n')).groupBy('retention_class').execute(),
      ]);
      return {
        generated_at: new Date().toISOString(),
        scanner_configured: !!env.CLAMAV_HOST,
        totals: { files, legal_hold: legalHold, under_retention: underRetention, infected, unscanned, missing_from_storage: missing },
        by_retention_class: byClass.map(r => ({ retention_class: r.retention_class ?? 'none', files: Number(r.n) })),
      };
    });
  });
}
