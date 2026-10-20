import { readFleetDocuments } from '../services/fleet-documents.service.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { NotificationService } from '../services/notification.service.js';
import { toDateParam } from '../utils/dates.js';
import { z } from 'zod';
import { requireRoleOrOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;
const FLEET_MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

async function notifyFleetManagers(tenantId: string, title: string, message: string, link: string) {
  const managers = await withTenant(tenantId, (trx) =>
    trx.selectFrom('users').select('id')
      .where('tenant_id', '=', tenantId)
      .where('role', 'in', [...FLEET_MGMT_ROLES])
      .execute()
  );
  await Promise.all(managers.map((m) =>
    NotificationService.createNotification({
      tenantId, userId: m.id, app: 'tracking', type: 'fleet_alert', title, message, link,
    })
  ));
}

export async function fleetComplianceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  // ── Vehicle Documents ────────────────────────────────────────

  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  const date = z.string().refine(value => Number.isFinite(Date.parse(value)), 'Enter a valid date');
  const documentFields = z.object({ doc_type: z.string().trim().min(1).max(100).optional(), doc_number: z.string().max(200).optional(), issued_date: date.optional(), expiry_date: date.optional(), file_url: z.string().max(2000).refine(value => value === '' || /^https?:\/\//i.test(value) || /^\/v1\/files\/[0-9a-f-]+\/download$/i.test(value), 'Use an HTTP document URL or a Drive file').optional(), notes: z.string().max(5000).optional(), comply_certificate_id: z.string().uuid().nullable().optional() });
  const reminderFields = z.object({ title: z.string().trim().min(1).max(500), reminder_type: z.string().max(100).optional(), due_date: date, notes: z.string().max(5000).optional() });
  fastify.addHook('preHandler', async (req, reply) => {
    if (!['POST', 'PATCH'].includes(req.method)) return;
    const path = req.routeOptions.url || '';
    let schema: z.ZodTypeAny | undefined;
    if (path.endsWith('/documents')) schema = documentFields.extend({ vehicle_id: z.string().uuid() });
    if (path.endsWith('/documents/:id')) schema = documentFields;
    if (path.endsWith('/reminders')) schema = reminderFields.extend({ vehicle_id: z.string().uuid().optional(), driver_id: z.string().uuid().optional() });
    if (path.endsWith('/reminders/:id')) schema = reminderFields.partial().extend({ status: z.enum(['PENDING', 'DONE', 'DISMISSED']).optional() });
    if (schema) {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map(i => i.message).join('; ') });
      req.body = parsed.data;
    }
    const body = req.body as Record<string, unknown>;
    if (!body) return;
    if (body.comply_certificate_id) {
      await requireEntitlement('complyos')(req, reply);
      if (reply.sent) return;
      await requireRoleOrOrgPermission(ORG_PERMISSIONS.COMPLY_MANAGE, ...FLEET_MGMT_ROLES)(req, reply);
      if (reply.sent) return;
    }
    return withTenant(req.user.tenant_id, async trx => {
      const fileMatch = typeof body.file_url === 'string' ? body.file_url.match(/^\/v1\/files\/([0-9a-f-]+)\/download$/i) : null;
      if (fileMatch && !await trx.selectFrom('cloud_files').select('id').where('id', '=', fileMatch[1]).where('tenant_id', '=', req.user.tenant_id).executeTakeFirst()) return reply.status(404).send({ error: 'Drive file not found' });
      for (const [key, table] of [['vehicle_id', 'vehicles'], ['driver_id', 'drivers'], ['comply_certificate_id', 'comply_certificates']] as const) {
        if (!body[key]) continue;
        if (!z.string().uuid().safeParse(body[key]).success) return reply.status(400).send({ error: `Invalid ${key}` });
        if (!await trx.selectFrom(table).select('id').where('id', '=', body[key] as string).where('tenant_id', '=', req.user.tenant_id).executeTakeFirst()) return reply.status(404).send({ error: `${key} not found` });
      }
      if (body.issued_date && body.expiry_date && Date.parse(String(body.expiry_date)) < Date.parse(String(body.issued_date))) return reply.status(400).send({ error: 'Expiry must be on or after the issue date.' });
    });
  });

  fastify.get('/documents', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, trx => readFleetDocuments(trx, user.tenant_id));
  });

  fastify.post('/documents', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      vehicle_id: string; doc_type?: string; doc_number?: string;
      issued_date?: string; expiry_date?: string; file_url?: string; notes?: string; comply_certificate_id?: string;
    };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('vehicle_documents').values({
        tenant_id: user.tenant_id,
        vehicle_id: body.vehicle_id,
        doc_type: body.doc_type ?? 'OTHER',
        doc_number: body.doc_number ?? null,
        issued_date: body.issued_date ? new Date(body.issued_date) : null,
        expiry_date: body.expiry_date ? new Date(body.expiry_date) : null,
        file_url: body.file_url ?? null,
        notes: body.notes ?? null,
        comply_certificate_id: body.comply_certificate_id ?? null,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  // HUD-0097 (addendum): all three PATCH routes below crashed on a
  // wrong/stale id instead of 404ing — multi-line-chain misses from the
  // original sweep, found by hand while tracing this file.
  fastify.patch('/documents/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{
      doc_type: string; doc_number: string; issued_date: string; expiry_date: string;
      file_url: string; notes: string;
    }>;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('vehicle_documents').set({
        ...body,
        issued_date: body.issued_date ? new Date(body.issued_date) : undefined,
        expiry_date: body.expiry_date ? new Date(body.expiry_date) : undefined,
        updated_at: new Date(),
      } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Document not found' });
      return updated;
    });
  });

  fastify.delete('/documents/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('vehicle_documents').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Reminders ────────────────────────────────────────────────

  fastify.get('/reminders', async (req) => {
    const user = req.user;
    const { status } = req.query as { status?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('fleet_reminders').selectAll().where('tenant_id', '=', user.tenant_id);
      if (status) q = q.where('status', '=', status);
      return q.orderBy('due_date').execute();
    });
  });

  fastify.post('/reminders', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      vehicle_id?: string; driver_id?: string; title: string;
      reminder_type?: string; due_date: string; notes?: string;
    };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('fleet_reminders').values({
        tenant_id: user.tenant_id,
        vehicle_id: body.vehicle_id ?? null,
        driver_id: body.driver_id ?? null,
        title: body.title,
        reminder_type: body.reminder_type ?? 'CUSTOM',
        due_date: new Date(body.due_date),
        notes: body.notes ?? null,
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.patch('/reminders/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{ title: string; due_date: string; status: string; notes: string }>;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('fleet_reminders').set({
        ...body,
        ...(body.due_date ? { notified_at: null } : {}),
        due_date: body.due_date ? new Date(body.due_date) : undefined,
        updated_at: new Date(),
      } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Reminder not found' });
      return updated;
    });
  });

  fastify.delete('/reminders/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('fleet_reminders').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Expiring (documents + reminders due within N days) ──────

  fastify.get('/expiring', async (req) => {
    const user = req.user;
    const { days } = req.query as { days?: string };
    const horizon = new Date(Date.now() + (Number(days) || 30) * 86_400_000);
    return withTenant(user.tenant_id, async (trx) => {
      const documents = (await readFleetDocuments(trx, user.tenant_id)).filter(doc => doc.expiry_date && new Date(doc.expiry_date) <= horizon);
      const reminders = await trx.selectFrom('fleet_reminders').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'PENDING')
        .where('due_date', '<=', toDateParam(horizon))
        .orderBy('due_date').execute();
      return { documents, reminders };
    });
  });

  // ── Alerts ───────────────────────────────────────────────────

  fastify.get('/alerts', async (req) => {
    const user = req.user;
    const { acknowledged } = req.query as { acknowledged?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('fleet_alerts').selectAll().where('tenant_id', '=', user.tenant_id);
      if (acknowledged !== undefined) q = q.where('acknowledged', '=', acknowledged === 'true');
      return q.orderBy('created_at', 'desc').limit(200).execute();
    });
  });

  fastify.post('/alerts', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      vehicle_id?: string; alert_type: string; severity?: string; message: string;
    };
    const alert = await withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('fleet_alerts').values({
        tenant_id: user.tenant_id,
        vehicle_id: body.vehicle_id ?? null,
        alert_type: body.alert_type,
        severity: body.severity ?? 'INFO',
        message: body.message,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
    notifyFleetManagers(user.tenant_id, 'Fleet alert', body.message, '/tracking/alerts').catch(console.error);
    return alert;
  });

  // POST /alerts (above) already requires FLEET_ROLES — acknowledging one
  // had no role check at all, so any authenticated user with tracking
  // access, including a role outside fleet staff entirely, could dismiss a
  // fleet alert.
  fastify.patch('/alerts/:id/acknowledge', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('fleet_alerts').set({ acknowledged: true })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Alert not found' });
      return updated;
    });
  });
}
