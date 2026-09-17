import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { NotificationService } from '../services/notification.service.js';
import { toDateParam } from '../utils/dates.js';

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

  fastify.get('/documents', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('vehicle_documents').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('expiry_date').execute()
    );
  });

  fastify.post('/documents', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as {
      vehicle_id: string; doc_type?: string; doc_number?: string;
      issued_date?: string; expiry_date?: string; file_url?: string; notes?: string;
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
      const documents = await trx.selectFrom('vehicle_documents').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('expiry_date', 'is not', null)
        .where('expiry_date', '<=', toDateParam(horizon))
        .orderBy('expiry_date').execute();
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
