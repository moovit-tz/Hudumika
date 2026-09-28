/**
 * Consent management API — processing activities register and per-user consent records.
 *
 * User routes:
 *   GET    /v1/privacy/consent            — list processing activities + my consent status
 *   POST   /v1/privacy/consent/:activityId — grant consent
 *   DELETE /v1/privacy/consent/:activityId — withdraw consent
 *
 * Admin routes (ADMIN/TENANT_ADMIN):
 *   GET    /v1/admin/privacy/processing-activities      — GDPR Art. 30 register
 *   POST   /v1/admin/privacy/processing-activities      — create activity
 *   PATCH  /v1/admin/privacy/processing-activities/:id  — update activity
 *   GET    /v1/admin/privacy/consent-analytics          — consent rates per activity
 */

import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

export async function consentRoutes(fastify: FastifyInstance) {
  // ── User — list activities + my consent status ─────────────────────────────

  fastify.get('/privacy/consent', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = (req as any).user;

    const activities = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('processing_activities')
        .select(['id', 'name', 'purpose', 'lawful_basis', 'data_categories', 'data_domains', 'retention_days'])
        .where('is_active', '=', true)
        .execute(),
    );

    const myConsents = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('consent_records')
        .select(['activity_id', 'status', 'granted_at', 'withdrawn_at'])
        .where('user_id', '=', user.id ?? user.sub)
        .execute(),
    );

    const consentMap = new Map(myConsents.map(c => [c.activity_id, c]));

    const result = activities.map(a => ({
      ...a,
      my_consent: consentMap.get(a.id) ?? null,
    }));

    return reply.send(result);
  });

  // ── User — grant consent ───────────────────────────────────────────────────

  fastify.post('/privacy/consent/:activityId', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { activityId } = req.params as { activityId: string };
    if (!UUID_RE.test(activityId)) return reply.status(400).send({ error: 'invalid activityId' });

    const activity = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('processing_activities')
        .select(['id', 'lawful_basis'])
        .where('id', '=', activityId)
        .where('is_active', '=', true)
        .executeTakeFirst(),
    );

    if (!activity) return reply.status(404).send({ error: 'activity not found' });
    if (activity.lawful_basis !== 'CONSENT') {
      return reply.status(400).send({ error: 'This activity does not use CONSENT as its lawful basis.' });
    }

    await withTenant(user.tenant_id, async (trx) => {
      // Find the latest version for this activity.
      const latest = await trx.selectFrom('consent_records')
        .select(['version'])
        .where('user_id', '=', user.id ?? user.sub)
        .where('activity_id', '=', activityId)
        .orderBy('version', 'desc')
        .executeTakeFirst();

      const version = (latest?.version ?? 0) + 1;

      await trx.insertInto('consent_records').values({
        tenant_id: user.tenant_id,
        user_id: user.id ?? user.sub,
        activity_id: activityId,
        status: 'ACTIVE' as any,
        version,
        evidence: JSON.stringify({
          ip: (req as any).ip ?? null,
          user_agent: req.headers?.['user-agent'] ?? null,
          method: 'api',
          locale: req.headers?.['accept-language']?.split(',')[0] ?? 'en',
        }) as any,
      }).execute();
    });

    return reply.status(201).send({ consented: true });
  });

  // ── User — withdraw consent ────────────────────────────────────────────────

  fastify.delete('/privacy/consent/:activityId', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { activityId } = req.params as { activityId: string };
    if (!UUID_RE.test(activityId)) return reply.status(400).send({ error: 'invalid activityId' });
    const body = req.body as { reason?: string } | undefined;

    const updated = await withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('consent_records')
        .set({
          status: 'WITHDRAWN',
          withdrawn_at: new Date(),
          withdrawal_reason: body?.reason ?? null,
        })
        .where('user_id', '=', user.id ?? user.sub)
        .where('activity_id', '=', activityId)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirst(),
    );

    if (!updated?.numUpdatedRows) {
      return reply.status(400).send({ error: 'No active consent found for this activity.' });
    }
    return reply.send({ withdrawn: true });
  });

  // ── Admin — GDPR Art. 30 processing activities register ───────────────────

  fastify.get('/admin/privacy/processing-activities', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const rows = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('processing_activities')
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute(),
    );
    return reply.send(rows);
  });

  fastify.post('/admin/privacy/processing-activities', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const body = req.body as {
      name: string; purpose: string; lawful_basis: string;
      data_categories?: string[]; data_domains?: string[];
      recipients?: string[]; retention_days?: number;
      is_automated?: boolean; dpia_required?: boolean;
    };

    const VALID_BASIS = ['CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTERESTS', 'PUBLIC_TASK', 'LEGITIMATE_INTERESTS'];
    if (!VALID_BASIS.includes(body.lawful_basis)) {
      return reply.status(400).send({ error: 'invalid lawful_basis' });
    }

    const row = await withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('processing_activities').values({
        tenant_id: user.tenant_id,
        name: body.name,
        purpose: body.purpose,
        lawful_basis: body.lawful_basis as any,
        data_categories: JSON.stringify(body.data_categories ?? []) as any,
        data_domains: JSON.stringify(body.data_domains ?? []) as any,
        recipients: JSON.stringify(body.recipients ?? []) as any,
        retention_days: body.retention_days ?? null,
        is_automated: body.is_automated ?? false,
        dpia_required: body.dpia_required ?? false,
      }).returning('id').executeTakeFirstOrThrow(),
    );

    return reply.status(201).send({ id: row.id });
  });

  fastify.patch('/admin/privacy/processing-activities/:id', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const allowed = ['name', 'purpose', 'retention_days', 'is_automated', 'dpia_required', 'dpia_completed_at', 'is_active', 'recipients', 'data_categories', 'data_domains'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) updates[k] = body[k];
    }
    updates.updated_at = new Date();
    await withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('processing_activities').set(updates as any).where('id', '=', id).execute(),
    );
    return reply.send({ updated: true });
  });

  // ── Admin — consent analytics ──────────────────────────────────────────────

  fastify.get('/admin/privacy/consent-analytics', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;

    const rows = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('consent_records as cr')
        .innerJoin('processing_activities as pa', 'pa.id', 'cr.activity_id')
        .select([
          'pa.id as activity_id',
          'pa.name as activity_name',
          'cr.status',
          (trx.fn.count as any)('cr.id').as('count'),
        ])
        .groupBy(['pa.id', 'pa.name', 'cr.status'])
        .execute(),
    );

    return reply.send(rows);
  });
}
