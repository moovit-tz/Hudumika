import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { MILESTONE_ORDER, nextMilestone, assertCanAdvance, isMilestone, InvalidMilestoneTransitionError } from '../lib/anga-aog-milestones.js';
import { computeAogSla } from '../lib/anga-aog-sla.js';

/**
 * Gereji port, Milestone 4 — ANGA AOG (Aircraft On Ground) case & SLA
 * engine. Ported from the standalone Gereji app's aog-cases routes, which
 * already delegate the hard logic to pure, well-tested functions
 * (lib/anga-aog-milestones.ts, lib/anga-aog-sla.ts) — this route layer is a
 * close, deliberate port of that behaviour: advancing is blocked while a
 * pause is open, milestones are strictly linear (no skip, no backward),
 * and at most one open pause per case is now additionally enforced at the
 * database level (migration 746's partial unique index) — the source app
 * only checked this with a SELECT-then-INSERT, a real race under
 * concurrency that the DB constraint closes for good.
 */

const PAUSE_REASONS = ['AWAITING_CUSTOMER', 'PUBLIC_HOLIDAY', 'CARRIER_DELAY', 'CUSTOMS_QUERY'] as const;

export async function gerejiAngaAogRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('gereji.anga'));

  fastify.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return reply.status(400).send({ error: 'Validation failed', details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    }
    if (error instanceof InvalidMilestoneTransitionError) return reply.status(409).send({ error: error.message });
    const status = error && typeof error === 'object' && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.status(status).send({ error: status < 500 ? (error.message ?? 'Request failed.') : 'Unable to process the request.' });
  });

  async function slaFor(trx: Transaction<Database>, tenantId: string, caseRow: { opened_at: Date; target_resolution_at: Date | null }, caseId: string) {
    if (!caseRow.target_resolution_at) return null;
    const pauses = await trx.selectFrom('gereji_anga_aog_pause_events').select(['paused_at', 'resumed_at'])
      .where('tenant_id', '=', tenantId).where('case_id', '=', caseId).execute();
    return computeAogSla({
      openedAt: caseRow.opened_at, targetResolutionAt: caseRow.target_resolution_at,
      pauseEvents: pauses.map(p => ({ pausedAt: p.paused_at, resumedAt: p.resumed_at })),
      now: new Date(),
    });
  }

  fastify.get('/aog-cases', async (request) => {
    return withTenant(request.user.tenant_id, async trx => {
      const cases = await trx.selectFrom('gereji_anga_aog_cases').selectAll()
        .where('tenant_id', '=', request.user.tenant_id).orderBy('opened_at', 'desc').limit(200).execute();
      const withSla = await Promise.all(cases.map(async c => ({ ...c, sla: await slaFor(trx, request.user.tenant_id, c, c.id) })));
      return { cases: withSla };
    });
  });

  fastify.post('/aog-cases', async (request, reply) => {
    const body = z.object({
      rfq_id: z.string().uuid().optional(), customer_id: z.string().uuid().optional(),
      aircraft_reg: z.string().optional(), aircraft_type: z.string().optional(), operator: z.string().optional(),
      station: z.string().optional(), pn_required: z.string().optional(),
      criticality: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
      assigned_officer_id: z.string().uuid().optional(), target_resolution_at: z.string().optional(), notes: z.string().optional(),
    }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const [row] = await trx.insertInto('gereji_anga_aog_cases').values({
        tenant_id: request.user.tenant_id, rfq_id: body.rfq_id ?? null, customer_id: body.customer_id ?? null,
        aircraft_reg: body.aircraft_reg ?? null, aircraft_type: body.aircraft_type ?? null, operator: body.operator ?? null,
        station: body.station ?? null, pn_required: body.pn_required ?? null, criticality: body.criticality,
        assigned_officer_id: body.assigned_officer_id ?? null,
        target_resolution_at: body.target_resolution_at ? new Date(body.target_resolution_at) : null,
        notes: body.notes ?? null, created_by: request.user.sub,
      } as any).returningAll().execute();

      await trx.insertInto('gereji_anga_aog_milestone_events').values({
        tenant_id: request.user.tenant_id, case_id: row.id, milestone: 'REQUEST_RECEIVED', reached_at: row.opened_at,
      }).execute();
      reply.status(201);
      return row;
    });
  });

  fastify.get('/aog-cases/:id', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const aogCase = await trx.selectFrom('gereji_anga_aog_cases').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!aogCase) throw { statusCode: 404, message: 'Case not found' };
      const milestoneHistory = await trx.selectFrom('gereji_anga_aog_milestone_events').selectAll()
        .where('case_id', '=', id).where('tenant_id', '=', request.user.tenant_id).orderBy('reached_at', 'asc').execute();
      const pauseHistory = await trx.selectFrom('gereji_anga_aog_pause_events').selectAll()
        .where('case_id', '=', id).where('tenant_id', '=', request.user.tenant_id).orderBy('paused_at', 'asc').execute();
      const sla = await slaFor(trx, request.user.tenant_id, aogCase, id);
      return { ...aogCase, milestone_history: milestoneHistory, pause_history: pauseHistory, sla };
    });
  });

  fastify.post('/aog-cases/:id/advance', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const aogCase = await trx.selectFrom('gereji_anga_aog_cases').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!aogCase) throw { statusCode: 404, message: 'Case not found' };

      const openPause = await trx.selectFrom('gereji_anga_aog_pause_events').select('id')
        .where('case_id', '=', id).where('tenant_id', '=', request.user.tenant_id).where('resumed_at', 'is', null).executeTakeFirst();
      if (openPause) throw { statusCode: 409, message: 'Case is paused — resume it before advancing' };

      if (!isMilestone(aogCase.current_milestone)) throw { statusCode: 500, message: 'Case has an invalid milestone state' };
      const target = nextMilestone(aogCase.current_milestone);
      if (!target) throw { statusCode: 409, message: 'Case is already at the terminal milestone (DELIVERED)' };
      assertCanAdvance(aogCase.current_milestone, target);

      const now = new Date();
      await trx.insertInto('gereji_anga_aog_milestone_events').values({
        tenant_id: request.user.tenant_id, case_id: id, milestone: target, reached_at: now,
      }).execute();
      const [updated] = await trx.updateTable('gereji_anga_aog_cases').set({ current_milestone: target as any, updated_at: now })
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();
      return updated;
    });
  });

  fastify.post('/aog-cases/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.enum(PAUSE_REASONS) }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const aogCase = await trx.selectFrom('gereji_anga_aog_cases').select('id')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!aogCase) throw { statusCode: 404, message: 'Case not found' };

      const openPause = await trx.selectFrom('gereji_anga_aog_pause_events').select('id')
        .where('case_id', '=', id).where('tenant_id', '=', request.user.tenant_id).where('resumed_at', 'is', null).executeTakeFirst();
      if (openPause) throw { statusCode: 409, message: 'Case already has an open pause' };

      try {
        const [pause] = await trx.insertInto('gereji_anga_aog_pause_events')
          .values({ tenant_id: request.user.tenant_id, case_id: id, reason })
          .returningAll().execute();
        reply.status(201);
        return pause;
      } catch (e: any) {
        // The partial unique index (migration 746) is the real guard under
        // concurrency; the SELECT above just gives a fast, friendly 409 in
        // the common case.
        if (e?.code === '23505') throw { statusCode: 409, message: 'Case already has an open pause' };
        throw e;
      }
    });
  });

  fastify.post('/aog-cases/:id/resume', async (request) => {
    const { id } = request.params as { id: string };
    return withTenant(request.user.tenant_id, async trx => {
      const openPause = await trx.selectFrom('gereji_anga_aog_pause_events').select('id')
        .where('case_id', '=', id).where('tenant_id', '=', request.user.tenant_id).where('resumed_at', 'is', null).executeTakeFirst();
      if (!openPause) throw { statusCode: 409, message: 'Case has no open pause' };

      const [resumed] = await trx.updateTable('gereji_anga_aog_pause_events').set({ resumed_at: new Date() })
        .where('id', '=', openPause.id).where('tenant_id', '=', request.user.tenant_id).returningAll().execute();
      return resumed;
    });
  });
}
