import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { requireEntitlement } from '../middleware/entitlement.js';
import { executeRightsRequestAction } from '../services/dsr.service.js';

const ASSESSMENT_TYPES = ['dpia', 'pia', 'tia', 'lia'] as const;
const ASSESSMENT_STATUSES = ['draft', 'in_progress', 'review', 'approved', 'rejected'] as const;
const INCIDENT_STATUSES = ['detected', 'investigating', 'contained', 'notified', 'remediated', 'closed'] as const;
const INCIDENT_CATEGORIES = ['unauthorized_access', 'data_loss', 'data_breach', 'system_compromise', 'human_error', 'third_party', 'other'] as const;

const INCIDENT_TRANSITIONS: Record<string, string[]> = {
  detected:      ['investigating'],
  investigating: ['contained', 'closed'],
  contained:     ['notified', 'remediated'],
  notified:      ['remediated'],
  remediated:    ['closed'],
  closed:        [],
};

const ASSESSMENT_TRANSITIONS: Record<string, string[]> = {
  draft:       ['in_progress'],
  in_progress: ['review'],
  review:      ['approved', 'rejected'],
  approved:    [],
  rejected:    ['draft'],
};

export async function ngaoCrudRoutes(fastify: FastifyInstance) {
  // Same gap as ngao.routes.ts's own copy of this comment: this file is
  // registered on its own `server.register(...)` call in index.ts, so a
  // `fastify.authenticate` hook added anywhere else never reaches it —
  // without this, `requireEntitlement('ngao')` below always sees an unset
  // `request.user` and every route in this file (DPIA assessments,
  // incidents, vendors, rights-requests — all of it) 401s unconditionally
  // for every tenant. Found live while verifying the Privacy P0 fix below.
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('ngao'));

  // Every `throw { statusCode, message }` in this file (DPIA "not found"/
  // "cannot edit", incident transitions, rights-request transitions) relied
  // on being caught as a real HTTP status — but this file never had its own
  // setErrorHandler, and index.ts's global one only reads `.statusCode` off
  // an actual `Error` instance, not a plain object literal. Every one of
  // those checks was silently returning HTTP 200 with an error-shaped JSON
  // body instead of the real 404/422. Found live while testing the Privacy
  // P0 concurrency fix on /rights-requests/:id/respond.
  fastify.setErrorHandler((error: any, _request, reply) => {
    const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.status(status).send({ error: status < 500 ? (error.message ?? 'Request failed.') : 'Unable to process the request.' });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  DPIA / Privacy Impact Assessments
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/assessments', async (request, reply) => {
    const schema = z.object({
      title: z.string().trim().min(1),
      assessment_type: z.enum(ASSESSMENT_TYPES).default('dpia'),
      activity_id: z.string().uuid().optional(),
      description: z.string().optional(),
      scope: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const [row] = await trx.insertInto('privacy_assessments')
        .values({
          tenant_id: request.user.tenant_id,
          title: body.title,
          assessment_type: body.assessment_type as any,
          activity_id: body.activity_id ?? null,
          description: body.description ?? null,
          scope: body.scope ?? null,
          assessor_id: request.user.sub,
          status: 'draft' as any,
        })
        .returningAll()
        .execute();
      reply.status(201);
      return row;
    });
  });

  fastify.get('/assessments/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('privacy_assessments')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll()
        .executeTakeFirst();
      if (!row) throw { statusCode: 404, message: 'Assessment not found' };
      return row;
    });
  });

  fastify.patch('/assessments/:id', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      title: z.string().trim().min(1).optional(),
      description: z.string().optional(),
      scope: z.string().optional(),
      necessity_assessment: z.string().optional(),
      proportionality_assessment: z.string().optional(),
      risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      risk_score: z.number().optional(),
      risks: z.any().optional(),
      mitigations: z.any().optional(),
      next_review_date: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const current = await trx.selectFrom('privacy_assessments')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Assessment not found' };
      if (current.status === 'approved') {
        throw { statusCode: 422, message: 'Cannot edit an approved assessment' };
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.scope !== undefined) updates.scope = body.scope;
      if (body.necessity_assessment !== undefined) updates.necessity_assessment = body.necessity_assessment;
      if (body.proportionality_assessment !== undefined) updates.proportionality_assessment = body.proportionality_assessment;
      if (body.risk_level !== undefined) updates.risk_level = body.risk_level;
      if (body.risk_score !== undefined) updates.risk_score = body.risk_score;
      if (body.risks !== undefined) updates.risks = JSON.stringify(body.risks);
      if (body.mitigations !== undefined) updates.mitigations = JSON.stringify(body.mitigations);
      if (body.next_review_date !== undefined) updates.next_review_date = body.next_review_date;

      const [updated] = await trx.updateTable('privacy_assessments')
        .set(updates as any)
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();
      return updated;
    });
  });

  fastify.patch('/assessments/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(ASSESSMENT_STATUSES),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const current = await trx.selectFrom('privacy_assessments')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Assessment not found' };
      if (!ASSESSMENT_TRANSITIONS[current.status]?.includes(body.status)) {
        throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${body.status}` };
      }

      const updates: Record<string, unknown> = {
        status: body.status,
        updated_at: new Date(),
      };
      if (body.status === 'review') updates.reviewer_id = request.user.sub;
      if (body.status === 'approved') {
        updates.approved_by = request.user.sub;
        updates.approved_at = new Date();
      }

      const [updated] = await trx.updateTable('privacy_assessments')
        .set(updates as any)
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Processing Activity Register
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/registers', async (request, reply) => {
    const schema = z.object({
      name: z.string().trim().min(1),
      purpose: z.string().trim().min(1),
      lawful_basis: z.enum(['CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTERESTS', 'PUBLIC_TASK', 'LEGITIMATE_INTERESTS']),
      data_categories: z.array(z.string()).optional(),
      data_domains: z.array(z.string()).optional(),
      recipients: z.array(z.string()).optional(),
      retention_days: z.number().int().positive().optional(),
      is_automated: z.boolean().optional(),
      dpia_required: z.boolean().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const values: Record<string, unknown> = {
        tenant_id: request.user.tenant_id,
        name: body.name,
        purpose: body.purpose,
        lawful_basis: body.lawful_basis,
        retention_days: body.retention_days ?? null,
      };
      if (body.data_categories) values.data_categories = body.data_categories;
      if (body.data_domains) values.data_domains = body.data_domains;
      if (body.recipients) values.recipients = body.recipients;
      if (body.is_automated !== undefined) values.is_automated = body.is_automated;
      if (body.dpia_required !== undefined) values.dpia_required = body.dpia_required;

      const [row] = await trx.insertInto('processing_activities')
        .values(values as any)
        .returningAll()
        .execute();
      reply.status(201);
      return row;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Incidents
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/incidents', async (request, reply) => {
    const schema = z.object({
      title: z.string().trim().min(1),
      severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
      category: z.enum(INCIDENT_CATEGORIES).optional(),
      description: z.string().optional(),
      data_subjects_affected: z.number().int().nonnegative().optional(),
      data_categories_affected: z.array(z.string()).optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const [{ count }] = await trx.selectFrom('privacy_incidents')
        .where('tenant_id', '=', request.user.tenant_id)
        .select(sql<number>`count(*)::int`.as('count'))
        .execute();
      const incidentNumber = `INC-${String(count + 1).padStart(5, '0')}`;

      const [row] = await trx.insertInto('privacy_incidents')
        .values({
          tenant_id: request.user.tenant_id,
          title: body.title,
          incident_number: incidentNumber,
          severity: body.severity as any,
          status: 'detected' as any,
          category: (body.category as any) ?? null,
          description: body.description ?? null,
          data_subjects_affected: body.data_subjects_affected ?? null,
          data_categories_affected: body.data_categories_affected ?? null,
          reported_by: request.user.sub,
        })
        .returningAll()
        .execute();
      reply.status(201);
      return row;
    });
  });

  fastify.get('/incidents/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('privacy_incidents')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .selectAll()
        .executeTakeFirst();
      if (!row) throw { statusCode: 404, message: 'Incident not found' };
      return row;
    });
  });

  fastify.patch('/incidents/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(INCIDENT_STATUSES),
      root_cause: z.string().optional(),
      remediation_actions: z.string().optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const current = await trx.selectFrom('privacy_incidents')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .select(['status'])
        .executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Incident not found' };
      if (!INCIDENT_TRANSITIONS[current.status]?.includes(body.status)) {
        throw { statusCode: 422, message: `Cannot transition from ${current.status} to ${body.status}` };
      }

      const updates: Record<string, unknown> = {
        status: body.status,
        updated_at: new Date(),
      };
      if (body.status === 'investigating') updates.lead_investigator_id = request.user.sub;
      if (body.status === 'contained') updates.contained_at = new Date();
      if (body.status === 'notified') updates.authority_notified_at = new Date();
      if (body.status === 'remediated') {
        if (body.root_cause) updates.root_cause = body.root_cause;
        if (body.remediation_actions) updates.remediation_actions = body.remediation_actions;
      }

      const [updated] = await trx.updateTable('privacy_incidents')
        .set(updates as any)
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Data Subject Rights Requests
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/rights-requests', async (request, reply) => {
    const schema = z.object({
      request_type: z.enum(['ACCESS', 'CORRECTION', 'ERASURE', 'OBJECTION', 'PORTABILITY']),
      subject_name: z.string().trim().min(1),
      subject_email: z.string().email(),
      subject_phone: z.string().optional(),
      description: z.string().trim().min(1),
      deadline_days: z.number().int().positive().default(30),
    });
    const body = schema.parse(request.body);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + body.deadline_days);

    return withTenant(request.user.tenant_id, async (trx) => {
      const [row] = await trx.insertInto('privacy_rights_requests')
        .values({
          tenant_id: request.user.tenant_id,
          request_type: body.request_type as any,
          subject_name: body.subject_name,
          subject_email: body.subject_email,
          subject_phone: body.subject_phone ?? null,
          description: body.description,
          status: 'PENDING' as any,
          deadline_at: deadline,
        })
        .returningAll()
        .execute();
      reply.status(201);
      return row;
    });
  });

  fastify.patch('/rights-requests/:id/respond', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      status: z.enum(['IN_PROGRESS', 'COMPLETED', 'REJECTED']),
      response_notes: z.string().optional(),
    });
    const body = schema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      // forUpdate() — this transaction may execute a real export/erasure
      // below, so a second concurrent /respond on the same request must
      // block here, not read a stale status and double-execute.
      const current = await trx.selectFrom('privacy_rights_requests')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .select(['status', 'request_type', 'subject_email', 'audit_log'])
        .forUpdate().executeTakeFirst();
      if (!current) throw { statusCode: 404, message: 'Rights request not found' };
      if (current.status === 'COMPLETED' || current.status === 'EXPIRED') {
        throw { statusCode: 422, message: `Cannot update a ${current.status} request` };
      }

      const auditLog = Array.isArray(current.audit_log) ? current.audit_log : [];

      // Privacy P0: a status flip was never proof that the export/erasure/
      // correction actually happened. Resolve the subject against a real
      // customer record and, when found, perform the real action — the
      // same shape as data_subject_requests' own real execution above, just
      // against a free-text-identified subject instead of a platform user.
      if (body.status === 'COMPLETED') {
        const result = await executeRightsRequestAction(trx, request.user.tenant_id, current.request_type as any, current.subject_email);
        if (result.matched) {
          auditLog.push({
            at: new Date().toISOString(), actor_id: request.user.sub, action: result.action,
            customer_id: result.customerId, download_key: result.downloadKey ?? null,
            erased_fields: result.erasedFields ?? null,
          });
        } else {
          // No automatic action was possible (no matching customer, or a
          // request type — CORRECTION/OBJECTION — the system can't execute
          // on its own). Completing it anyway is still allowed, since not
          // every legitimate subject has a record in this system, or every
          // correction can be automated — but it now REQUIRES the operator
          // to actually describe what was done, instead of an optional note
          // that could be left blank. That's the real line between
          // "tracked" and "executed": this system cannot prove the
          // execution itself, so it demands the human say what happened
          // instead of silently accepting a bare status change.
          if (!body.response_notes || !body.response_notes.trim()) {
            return reply.status(422).send({
              error: 'No matching customer record was found to execute this automatically. Describe what action was actually taken (response_notes) before marking this request completed.',
            });
          }
          auditLog.push({ at: new Date().toISOString(), actor_id: request.user.sub, action: 'manual_execution_described', notes: body.response_notes.trim() });
        }
      } else {
        auditLog.push({ at: new Date().toISOString(), actor_id: request.user.sub, action: `status_changed_to_${body.status.toLowerCase()}` });
      }

      const updates: Record<string, unknown> = {
        status: body.status, updated_at: new Date(), audit_log: JSON.stringify(auditLog),
      };
      if (body.response_notes) updates.response_notes = body.response_notes;
      if (body.status === 'COMPLETED' || body.status === 'REJECTED') {
        updates.responded_at = new Date();
      }

      const [updated] = await trx.updateTable('privacy_rights_requests')
        .set(updates as any)
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .execute();
      return updated;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Vendors
  // ═══════════════════════════════════════════════════════════════════

  fastify.post('/vendors', async (request, reply) => {
    const schema = z.object({
      name: z.string().trim().min(1),
      contact_name: z.string().optional(),
      contact_email: z.string().email().optional(),
      website: z.string().url().optional(),
      services: z.any().optional(),
      data_shared: z.any().optional(),
      has_dpa: z.boolean().optional(),
      risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    });
    const body = schema.parse(request.body);
    return withTenant(request.user.tenant_id, async (trx) => {
      const [row] = await trx.insertInto('privacy_vendors')
        .values({
          tenant_id: request.user.tenant_id,
          name: body.name,
          contact_name: body.contact_name ?? null,
          contact_email: body.contact_email ?? null,
          website: body.website ?? null,
          services: body.services ? JSON.stringify(body.services) : undefined,
          data_shared: body.data_shared ? JSON.stringify(body.data_shared) : undefined,
          has_dpa: body.has_dpa,
          risk_level: (body.risk_level as any) ?? undefined,
        } as any)
        .returningAll()
        .execute();
      reply.status(201);
      return row;
    });
  });
}
