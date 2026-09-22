/**
 * Training & Development — confirmed entirely absent in the audit (no
 * catalogue, no enrollment, no certification-expiry tracking anywhere).
 * Course management is MGMT_ROLES; enrollment is real self-service, same
 * precedent as hr-benefits.routes.ts — an employee enrolls themself, and
 * MGMT can enroll anyone. Marking a course COMPLETED/FAILED is MGMT-only:
 * that asserts an objective outcome (and, for a certification course, a
 * real expiry date), not a preference the enrollee sets for themself.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireUuidParams } from '../middleware/uuid-params.js';

const MGMT = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const isMgmt = (role: string) => (MGMT as readonly string[]).includes(role);

const courseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(100).optional(),
  provider: z.string().trim().max(150).optional(),
  duration_hours: z.number().min(0).optional(),
  is_certification: z.boolean().default(false),
  validity_months: z.number().int().min(1).optional(),
});

export async function hrTrainingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));
  requireUuidParams(fastify);

  // ── Catalogue ────────────────────────────────────────────────
  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/courses', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('hr_training_courses')
      .selectAll().where('tenant_id', '=', user.tenant_id).where('active', '=', true)
      .orderBy('title').execute());
  });

  fastify.post('/courses', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const body = courseSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const created = await trx.insertInto('hr_training_courses').values({
        tenant_id: user.tenant_id, title: body.title, description: body.description ?? null,
        category: body.category ?? null, provider: body.provider ?? null,
        duration_hours: body.duration_hours != null ? String(body.duration_hours) : null,
        is_certification: body.is_certification, validity_months: body.validity_months ?? null,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return created;
    });
  });

  fastify.patch<{ Params: { id: string } }>('/courses/:id', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params;
    const body = courseSchema.partial().parse(req.body);
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description ?? null;
    if (body.category !== undefined) patch.category = body.category ?? null;
    if (body.provider !== undefined) patch.provider = body.provider ?? null;
    if (body.duration_hours !== undefined) patch.duration_hours = body.duration_hours != null ? String(body.duration_hours) : null;
    if (body.is_certification !== undefined) patch.is_certification = body.is_certification;
    if (body.validity_months !== undefined) patch.validity_months = body.validity_months ?? null;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_training_courses').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Course not found' });
      return updated;
    });
  });

  fastify.delete<{ Params: { id: string } }>('/courses/:id', { preHandler: requireRole(...MGMT) }, async (req) => {
    const user = req.user;
    const { id } = req.params;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('hr_training_courses').set({ active: false, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Enrollments ──────────────────────────────────────────────

  // All enrollments across the tenant, optionally filtered — MGMT view.
  fastify.get<{ Querystring: { user_id?: string; course_id?: string; status?: string } }>('/enrollments', { preHandler: requireRole(...MGMT) }, async (req) => {
    const user = req.user;
    const { user_id, course_id, status } = req.query;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('hr_training_enrollments as e')
        .innerJoin('hr_training_courses as c', 'c.id', 'e.course_id')
        .innerJoin('users as u', 'u.id', 'e.user_id')
        .select([
          'e.id', 'e.course_id', 'c.title as course_title', 'c.is_certification',
          'e.user_id', 'u.name as user_name', 'e.status', 'e.enrolled_at', 'e.completed_at',
          'e.score', 'e.notes', 'e.certificate_expiry_date',
        ])
        .where('e.tenant_id', '=', user.tenant_id)
        .orderBy('e.enrolled_at', 'desc');
      if (user_id) q = q.where('e.user_id', '=', user_id);
      if (course_id) q = q.where('e.course_id', '=', course_id);
      if (status) q = q.where('e.status', '=', status as any);
      return q.execute();
    });
  });

  // Self-scoped — same reasoning as GET /delete-requests/mine in hr.routes.ts:
  // the plain GET above returns every enrollment in the tenant, which would
  // leak other people's scores/notes if reused for "my training" too.
  fastify.get('/my-enrollments', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('hr_training_enrollments as e')
      .innerJoin('hr_training_courses as c', 'c.id', 'e.course_id')
      .select(['e.id', 'e.course_id', 'c.title as course_title', 'c.category', 'c.is_certification',
               'e.status', 'e.enrolled_at', 'e.completed_at', 'e.score', 'e.certificate_expiry_date'])
      .where('e.tenant_id', '=', user.tenant_id).where('e.user_id', '=', user.sub)
      .orderBy('e.enrolled_at', 'desc').execute());
  });

  const enrollSchema = z.object({ course_id: z.string().uuid(), user_id: z.string().uuid().optional() });
  fastify.post('/enrollments', async (req, reply) => {
    const user = req.user;
    const body = enrollSchema.parse(req.body);
    const targetId = body.user_id ?? user.sub;
    if (targetId !== user.sub && !isMgmt(user.role)) {
      return reply.status(403).send({ error: 'Only a manager can enroll someone else.' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const course = await trx.selectFrom('hr_training_courses').select('id')
        .where('id', '=', body.course_id).where('tenant_id', '=', user.tenant_id).where('active', '=', true).executeTakeFirst();
      if (!course) return reply.status(404).send({ error: 'Course not found or no longer offered.' });
      const person = await trx.selectFrom('users').select('id')
        .where('id', '=', targetId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!person) return reply.status(404).send({ error: 'Employee not found.' });

      const existing = await trx.selectFrom('hr_training_enrollments').select('id')
        .where('tenant_id', '=', user.tenant_id).where('course_id', '=', body.course_id).where('user_id', '=', targetId)
        .executeTakeFirst();
      if (existing) return reply.status(409).send({ error: 'Already enrolled in this course.' });

      const created = await trx.insertInto('hr_training_enrollments').values({
        tenant_id: user.tenant_id, course_id: body.course_id, user_id: targetId, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return created;
    });
  });

  // Withdraw — self, or MGMT on someone's behalf. Anything past ENROLLED
  // needs the MGMT-only outcome endpoint below instead.
  fastify.post<{ Params: { id: string } }>('/enrollments/:id/cancel', async (req, reply) => {
    const user = req.user;
    const { id } = req.params;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_training_enrollments').select(['id', 'user_id', 'status'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Enrollment not found' });
      if (existing.user_id !== user.sub && !isMgmt(user.role)) {
        return reply.status(403).send({ error: "Only a manager can cancel someone else's enrollment." });
      }
      if (['COMPLETED', 'FAILED'].includes(existing.status)) {
        return reply.status(409).send({ error: `A ${existing.status} enrollment cannot be cancelled.` });
      }
      return trx.updateTable('hr_training_enrollments').set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
    });
  });

  // Records an objective outcome — MGMT-only. Completing a certification
  // course stamps a real expiry date (course.validity_months from now),
  // stored on the enrollment so a later edit to the course's own
  // validity_months never rewrites what this person actually earned.
  fastify.post<{ Params: { id: string }; Body: { status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; score?: number; notes?: string } }>(
    '/enrollments/:id/outcome',
    { preHandler: requireRole(...MGMT) },
    async (req, reply) => {
      const user = req.user;
      const { id } = req.params;
      const { status, score, notes } = req.body;
      if (!['IN_PROGRESS', 'COMPLETED', 'FAILED'].includes(status)) return reply.status(400).send({ error: 'invalid status' });
      return withTenant(user.tenant_id, async (trx) => {
        const existing = await trx.selectFrom('hr_training_enrollments as e')
          .innerJoin('hr_training_courses as c', 'c.id', 'e.course_id')
          .select(['e.id', 'e.status', 'c.is_certification', 'c.validity_months'])
          .where('e.id', '=', id).where('e.tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!existing) return reply.status(404).send({ error: 'Enrollment not found' });

        const patch: Record<string, unknown> = { status, updated_at: new Date() };
        if (score !== undefined) patch.score = score;
        if (notes !== undefined) patch.notes = notes || null;
        if (status === 'COMPLETED') {
          const now = new Date();
          patch.completed_at = now;
          patch.certificate_expiry_date = existing.is_certification && existing.validity_months
            ? new Date(now.getFullYear(), now.getMonth() + existing.validity_months, now.getDate()).toISOString().slice(0, 10)
            : null;
        }
        return trx.updateTable('hr_training_enrollments').set(patch as any)
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).returningAll().executeTakeFirstOrThrow();
      });
    }
  );

  // Compliance link (per the audit brief): certifications approaching or
  // past expiry, same shape as HR Documents' own expiry-radar.
  fastify.get('/certifications/expiring', { preHandler: requireRole(...MGMT) }, async (req) => {
    const user = req.user;
    const days = Math.min(Math.max(Number((req.query as any)?.days) || 90, 1), 365);
    const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('hr_training_enrollments as e')
        .innerJoin('hr_training_courses as c', 'c.id', 'e.course_id')
        .innerJoin('users as u', 'u.id', 'e.user_id')
        .select(['e.id', 'c.title as course_title', 'u.id as user_id', 'u.name as user_name',
                 'e.certificate_expiry_date'])
        .where('e.tenant_id', '=', user.tenant_id)
        .where('e.status', '=', 'COMPLETED')
        .where('e.certificate_expiry_date', 'is not', null)
        .where('e.certificate_expiry_date', '<=', horizon)
        .where('u.active', '=', true)
        .orderBy('e.certificate_expiry_date', 'asc')
        .execute();
      const today = new Date().toISOString().slice(0, 10);
      return rows.map(r => {
        const daysLeft = Math.round((new Date(String(r.certificate_expiry_date)).getTime() - new Date(today).getTime()) / 86400000);
        return { ...r, days_left: daysLeft, already_expired: daysLeft < 0 };
      });
    });
  });
}
