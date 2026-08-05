import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import {
  hsMemory, chargePriors, shipmentVariance, wizardAccuracy, complianceAccuracy,
  CHARGE_HEADS, MIN_SAMPLE,
} from '../services/intelligence.service.js';

/**
 * Capture and read-back for the feedback loop.
 *
 * The write endpoints are deliberately forgiving: a failed observation must
 * never break the thing the user was actually doing. Recording that an HS code
 * was accepted is worth having, but not at the cost of failing the
 * classification itself — so callers fire these and ignore the result, and
 * these handlers never throw on a merely-unusable payload.
 *
 * The read endpoints are the opposite: they refuse to answer rather than
 * answer thinly. Everything returns its sample size.
 */
export async function intelligenceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── POST /v1/intel/hs-classifications ─────────────────────────────────────
  // One row per line whose HS code was settled. Written on acceptance *and*
  // on "took none of them", because a rejection is as informative as a hit.
  fastify.post<{
    Body: {
      events: {
        description: string;
        suggested?: { code: string; matchPct?: number; duty_rate?: number | null }[];
        accepted_code?: string | null;
        source?: 'suggested' | 'ai' | 'manual' | 'none';
        record_id?: string | null;
        shipment_id?: string | null;
      }[];
    };
  }>('/hs-classifications', async (request, reply) => {
    const user = request.user as any;
    const events = Array.isArray(request.body?.events) ? request.body.events.slice(0, 500) : [];
    const rows = events
      .filter(e => typeof e?.description === 'string' && e.description.trim())
      .map(e => {
        const suggested = Array.isArray(e.suggested) ? e.suggested.slice(0, 5) : null;
        const accepted = typeof e.accepted_code === 'string' && e.accepted_code.trim() ? e.accepted_code.trim() : null;
        return {
          tenant_id: user.tenant_id,
          description: e.description.trim().slice(0, 500),
          suggested: suggested ? JSON.stringify(suggested) : null,
          accepted_code: accepted,
          source: ['suggested', 'ai', 'manual', 'none'].includes(e.source ?? '') ? e.source! : (accepted ? 'suggested' : 'none'),
          // The correction signal: the user was shown a ranked list and did
          // not take the top of it.
          overrode_top: !!(accepted && suggested?.length && suggested[0].code !== accepted),
          record_id: typeof e.record_id === 'string' ? e.record_id : null,
          shipment_id: typeof e.shipment_id === 'string' ? e.shipment_id : null,
          created_by: user.sub ?? null,
        };
      });
    if (rows.length === 0) return reply.status(400).send({ error: 'events[] is required' });
    await db.insertInto('hs_classification_events').values(rows).execute();
    return { recorded: rows.length };
  });

  // ── GET /v1/intel/hs-memory?text= ─────────────────────────────────────────
  // What this tenant has declared before for goods described like this.
  fastify.get<{ Querystring: { text?: string; limit?: string } }>('/hs-memory', async (request) => {
    const user = request.user as any;
    const text = String(request.query?.text ?? '');
    const limit = Math.min(Math.max(parseInt(String(request.query?.limit ?? '3')) || 3, 1), 5);
    return { data: await hsMemory(user.tenant_id, text, limit) };
  });

  // ── POST /v1/intel/hs-memory/bulk ─────────────────────────────────────────
  // The same lookup for a whole invoice. A 200-line consignment would
  // otherwise be 200 round trips.
  fastify.post<{ Body: { items: { id: string; text: string }[] } }>('/hs-memory/bulk', async (request, reply) => {
    const user = request.user as any;
    const items = Array.isArray(request.body?.items) ? request.body.items.slice(0, 400) : [];
    if (items.length === 0) return reply.status(400).send({ error: 'items[] is required' });
    const out: Record<string, any[]> = {};
    for (const it of items) {
      if (!it?.id || typeof it.text !== 'string') continue;
      const hits = await hsMemory(user.tenant_id, it.text, 3);
      if (hits.length) out[it.id] = hits;
    }
    return { data: out };
  });

  // ── GET /v1/intel/charge-priors ───────────────────────────────────────────
  // What this tenant actually paid per charge head. Never includes a statutory
  // head — see SOURCED_HEADS.
  fastify.get<{ Querystring: { window_days?: string } }>('/charge-priors', async (request) => {
    const user = request.user as any;
    const w = Math.min(Math.max(parseInt(String(request.query?.window_days ?? '180')) || 180, 30), 730);
    return { data: await chargePriors(user.tenant_id, w), min_sample: MIN_SAMPLE, heads: CHARGE_HEADS };
  });

  // ── GET /v1/intel/variance/:shipmentId ────────────────────────────────────
  fastify.get<{ Params: { shipmentId: string } }>('/variance/:shipmentId', async (request) => {
    const user = request.user as any;
    return await shipmentVariance(user.tenant_id, request.params.shipmentId);
  });

  // ── POST /v1/intel/trade-wizard-outcomes ──────────────────────────────────
  fastify.post<{
    Body: {
      procedure_id: string; procedure_name?: string; goal?: string;
      predicted?: unknown; outcome?: 'selected' | 'completed' | 'wrong';
      search_id?: string | null; shipment_id?: string | null; note?: string;
    };
  }>('/trade-wizard-outcomes', async (request, reply) => {
    const user = request.user as any;
    const b = request.body ?? ({} as any);
    if (!b.procedure_id) return reply.status(400).send({ error: 'procedure_id is required' });
    const row = await db.insertInto('trade_wizard_outcomes').values({
      tenant_id: user.tenant_id,
      search_id: typeof b.search_id === 'string' ? b.search_id : null,
      procedure_id: String(b.procedure_id).slice(0, 120),
      procedure_name: b.procedure_name ? String(b.procedure_name).slice(0, 300) : null,
      goal: b.goal ? String(b.goal).slice(0, 60) : null,
      predicted: b.predicted ? JSON.stringify(b.predicted) : null,
      outcome: ['selected', 'completed', 'wrong'].includes(b.outcome ?? '') ? b.outcome! : 'selected',
      note: b.note ? String(b.note).slice(0, 1000) : null,
      shipment_id: typeof b.shipment_id === 'string' ? b.shipment_id : null,
      created_by: user.sub ?? null,
    }).returning(['id']).executeTakeFirstOrThrow();
    reply.status(201);
    return row;
  });

  // ── POST /v1/intel/compliance-outcomes ────────────────────────────────────
  // What actually happened to each flagged requirement. 'unexpected' is the
  // one that matters most: a requirement enforced that was never predicted.
  fastify.post<{
    Body: {
      outcomes: {
        requirement: string; predicted: boolean;
        actual: 'applied' | 'not_applied' | 'unexpected';
        hs_code?: string; origin_country?: string;
        check_id?: string | null; shipment_id?: string | null; note?: string;
      }[];
    };
  }>('/compliance-outcomes', async (request, reply) => {
    const user = request.user as any;
    const list = Array.isArray(request.body?.outcomes) ? request.body.outcomes.slice(0, 60) : [];
    const rows = list
      .filter(o => o?.requirement && ['applied', 'not_applied', 'unexpected'].includes(o.actual))
      .map(o => ({
        tenant_id: user.tenant_id,
        check_id: typeof o.check_id === 'string' ? o.check_id : null,
        hs_code: o.hs_code ? String(o.hs_code).slice(0, 20) : null,
        origin_country: o.origin_country ? String(o.origin_country).slice(0, 80) : null,
        requirement: String(o.requirement).slice(0, 40),
        predicted: !!o.predicted,
        actual: o.actual,
        shipment_id: typeof o.shipment_id === 'string' ? o.shipment_id : null,
        note: o.note ? String(o.note).slice(0, 1000) : null,
        created_by: user.sub ?? null,
      }));
    if (rows.length === 0) return reply.status(400).send({ error: 'outcomes[] is required' });
    await db.insertInto('compliance_outcomes').values(rows).execute();
    reply.status(201);
    return { recorded: rows.length };
  });

  // ── GET /v1/intel/accuracy ────────────────────────────────────────────────
  // How well the Trade Wizard and the compliance rules are doing, for this
  // tenant. The platform-wide view lives under /v1/superadmin.
  fastify.get('/accuracy', async (request) => {
    const user = request.user as any;
    const [wizard, compliance] = await Promise.all([
      wizardAccuracy(user.tenant_id),
      complianceAccuracy(user.tenant_id),
    ]);
    return { wizard, compliance, min_sample: MIN_SAMPLE };
  });

  // ── GET /v1/intel/platform-accuracy ───────────────────────────────────────
  // Cross-tenant, SUPER_ADMIN only: which procedures and rules are wrong
  // everywhere rather than just here. No tenant is named in the response.
  fastify.get('/platform-accuracy', { preHandler: requireRole('SUPER_ADMIN') }, async () => {
    const [wizard, compliance, hs] = await Promise.all([
      wizardAccuracy(null),
      complianceAccuracy(null),
      // Where the HS ranker is most often overruled — a direct, aggregated
      // quality signal for the suggester, carrying no tenant's goods text.
      db.selectFrom('hs_classification_events')
        .select(['accepted_code'])
        .select(eb => eb.fn.countAll<string>().as('accepted'))
        .select(eb => eb.fn.sum<string>(eb.case().when('overrode_top', '=', true).then(1).else(0).end()).as('overrode_top'))
        .where('accepted_code', 'is not', null)
        .groupBy('accepted_code')
        .orderBy(eb => eb.fn.countAll(), 'desc')
        .limit(50)
        .execute(),
    ]);
    return {
      wizard,
      compliance,
      hs_codes: hs.map(r => ({
        code: r.accepted_code,
        accepted: Number((r as any).accepted) || 0,
        overrodeTop: Number((r as any).overrode_top) || 0,
      })),
      min_sample: MIN_SAMPLE,
    };
  });
}
