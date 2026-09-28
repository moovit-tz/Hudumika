/**
 * Data Subject Request (DSR) API — GDPR Articles 15, 16, 17, 18, 20, 21.
 *
 * User-facing routes (authenticated, own DSRs):
 *   GET    /v1/privacy/dsr            — list own requests
 *   POST   /v1/privacy/dsr            — submit a new request
 *   GET    /v1/privacy/dsr/:id        — get status + download info
 *   DELETE /v1/privacy/dsr/:id        — cancel a pending request
 *
 * Admin routes (ADMIN/TENANT_ADMIN only):
 *   GET    /v1/admin/privacy/dsr         — all DSRs for the tenant
 *   GET    /v1/admin/privacy/dsr/overdue — DSRs past the 25-day warning
 *   PATCH  /v1/admin/privacy/dsr/:id     — update status / reject with reason
 *   POST   /v1/admin/privacy/dsr/:id/process — trigger automated processing
 */

import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import {
  submitDsr,
  processAccessRequest,
  processErasureRequest,
  rejectDsr,
} from '../services/dsr.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function dsrRoutes(fastify: FastifyInstance) {
  // ── User routes ────────────────────────────────────────────────────────────

  fastify.get('/privacy/dsr', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const rows = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('data_subject_requests')
        .select(['id', 'request_type', 'status', 'created_at', 'due_at', 'processed_at', 'result_file_key'])
        .where('requester_id', '=', user.id ?? user.sub)
        .orderBy('created_at', 'desc')
        .execute(),
    );
    return reply.send(rows);
  });

  fastify.post('/privacy/dsr', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const body = req.body as { request_type: string; details?: Record<string, unknown> };
    const VALID_TYPES = ['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION', 'RESTRICTION', 'OBJECTION'];
    if (!VALID_TYPES.includes(body.request_type)) {
      return reply.status(400).send({ error: 'invalid request_type' });
    }
    const result = await submitDsr(
      user.tenant_id,
      user.id ?? user.sub,
      user.email,
      body.request_type as any,
      body.details ?? {},
    );
    return reply.status(201).send(result);
  });

  fastify.get('/privacy/dsr/:id', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(400).send({ error: 'invalid id' });
    const row = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('data_subject_requests')
        .selectAll()
        .where('id', '=', id)
        .where('requester_id', '=', user.id ?? user.sub)
        .executeTakeFirst(),
    );
    if (!row) return reply.status(404).send({ error: 'not found' });

    const logs = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('dsr_processing_log')
        .select(['step', 'notes', 'created_at'])
        .where('request_id', '=', id)
        .orderBy('created_at', 'asc')
        .execute(),
    );

    return reply.send({ ...row, processing_steps: logs });
  });

  fastify.delete('/privacy/dsr/:id', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(400).send({ error: 'invalid id' });
    const result = await withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('data_subject_requests')
        .set({ status: 'CANCELLED' })
        .where('id', '=', id)
        .where('requester_id', '=', user.id ?? user.sub)
        .where('status', '=', 'PENDING')
        .executeTakeFirst(),
    );
    if (!result?.numUpdatedRows) return reply.status(400).send({ error: 'Cannot cancel — request is not pending or does not belong to you.' });
    return reply.send({ cancelled: true });
  });

  // ── Admin routes ───────────────────────────────────────────────────────────

  fastify.get('/admin/privacy/dsr', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { status, type } = req.query as { status?: string; type?: string };

    const rows = await withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('data_subject_requests')
        .select(['id', 'requester_id', 'requester_email', 'request_type', 'status', 'created_at', 'due_at', 'processed_at', 'identity_verified', 'rejection_reason'])
        .orderBy('created_at', 'desc');
      if (status) q = q.where('status', '=', status as any);
      if (type) q = q.where('request_type', '=', type as any);
      return q.execute();
    });
    return reply.send(rows);
  });

  fastify.get('/admin/privacy/dsr/overdue', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const warnDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5-day warning
    const rows = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('data_subject_requests')
        .selectAll()
        .where('due_at', '<=', warnDate)
        .where('status', 'in', ['PENDING', 'IN_REVIEW', 'PROCESSING'])
        .orderBy('due_at', 'asc')
        .execute(),
    );
    return reply.send(rows);
  });

  fastify.patch('/admin/privacy/dsr/:id', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(400).send({ error: 'invalid id' });
    const body = req.body as { status?: string; rejection_reason?: string; identity_verified?: boolean };

    if (body.rejection_reason && body.status === 'REJECTED') {
      await rejectDsr(user.tenant_id, id, user.id ?? user.sub, body.rejection_reason);
      return reply.send({ updated: true });
    }

    const validStatuses = ['IN_REVIEW', 'PROCESSING', 'COMPLETED', 'REJECTED', 'PARTIALLY_COMPLETED'];
    if (body.status && !validStatuses.includes(body.status)) {
      return reply.status(400).send({ error: 'invalid status' });
    }

    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (body.identity_verified !== undefined) updates.identity_verified = body.identity_verified;
    if (body.status === 'COMPLETED' || body.status === 'REJECTED') {
      updates.processed_at = new Date();
      updates.processed_by = user.id ?? user.sub;
    }

    await withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('data_subject_requests').set(updates as any).where('id', '=', id).execute(),
    );
    return reply.send({ updated: true });
  });

  fastify.post('/admin/privacy/dsr/:id/process', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(400).send({ error: 'invalid id' });
    const operatorId: string = user.id ?? user.sub;

    const dsr = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('data_subject_requests').selectAll().where('id', '=', id).executeTakeFirst(),
    );
    if (!dsr) return reply.status(404).send({ error: 'not found' });

    if (dsr.request_type === 'ACCESS' || dsr.request_type === 'PORTABILITY') {
      const result = await processAccessRequest(user.tenant_id, id, operatorId);
      return reply.send({ processed: true, download_key: result.downloadKey });
    }

    if (dsr.request_type === 'ERASURE') {
      const result = await processErasureRequest(user.tenant_id, id, operatorId);
      return reply.send({ processed: true, ...result });
    }

    // RECTIFICATION / RESTRICTION / OBJECTION — mark as in_review for manual handling.
    await withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('data_subject_requests').set({ status: 'IN_REVIEW' }).where('id', '=', id).execute(),
    );
    return reply.send({ processed: false, message: 'Request moved to IN_REVIEW for manual processing.' });
  });
}
