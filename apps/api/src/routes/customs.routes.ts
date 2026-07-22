import { requireAppEnabled } from '../middleware/appGate.js';
/**
 * Customs Intelligence Routes
 * API endpoints for HS code lookup, landed cost calculation,
 * compliance checking, penalty assessment, and vessel tracking.
 *
 * Free data sources:
 * - HS codes: Internal DB seeded with EAC CET 2022
 * - FX rates: open.er-api.com (no API key required)
 * - Vessel positions: AISstream.io (free WebSocket API)
 */

import type { FastifyInstance } from 'fastify';
import {
  searchHsCodes,
  getHsCode,
  calculateLandedCost,
  checkCompliance,
  calculatePenalty,
  getVesselPosition,
  getUsdToTzs,
} from '../services/customs.service.js';
import { db } from '../db/client.js';

export async function customsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAppEnabled('clearos'));

  // ── GET /v1/customs/hs-search?q=laptop ───────────────────────────────────────
  // Full-text + code-prefix search of HS code database
  fastify.get('/hs-search', async (request) => {
    const q = (request.query as any).q ?? '';
    const limit = parseInt((request.query as any).limit ?? '20');
    return searchHsCodes(q, limit);
  });

  // ── GET /v1/customs/hs/:code ──────────────────────────────────────────────────
  // Get full details for a specific HS code
  fastify.get('/hs/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const entry = await getHsCode(code);
    if (!entry) return reply.status(404).send({ error: `HS code ${code} not found` });
    return entry;
  });

  // ── GET /v1/customs/fx-rate ───────────────────────────────────────────────────
  // Live USD → TZS exchange rate from open.er-api.com (no key required)
  fastify.get('/fx-rate', async () => {
    const rate = await getUsdToTzs();
    return {
      from: 'USD',
      to: 'TZS',
      rate,
      source: 'open.er-api.com',
      cached: true,
    };
  });

  // ── POST /v1/customs/landed-cost ──────────────────────────────────────────────
  // Full landed cost calculator with live HS rates and FX rate
  fastify.post('/landed-cost', async (request, reply) => {
    const user = request.user as any;
    const body = request.body as any;

    if (!body.hs_code || !body.cif_usd) {
      return reply.status(400).send({ error: 'hs_code and cif_usd are required' });
    }

    const result = await calculateLandedCost({
      hs_code: body.hs_code,
      cif_usd: parseFloat(body.cif_usd),
      qty: parseInt(body.qty ?? '1'),
      icd_per_container: body.icd_per_container ? parseFloat(body.icd_per_container) : undefined,
      num_containers: body.num_containers ? parseInt(body.num_containers) : undefined,
      fx_rate_override: body.fx_rate_override ? parseFloat(body.fx_rate_override) : undefined,
      shipment_ref: body.shipment_ref,
      description: body.description,
    });

    // Optionally save to history
    if (body.save_to_history !== false) {
      await db.insertInto('landed_cost_records').values({
        tenant_id: user.tenant_id,
        shipment_ref: body.shipment_ref ?? null,
        hs_code: result.hs_code,
        description: result.description,
        cif_usd: result.cif_usd,
        fx_rate: result.fx_rate,
        cif_tzs: result.cif_tzs,
        duty_rate: result.duty_rate,
        duty_amount: result.duty,
        vat_amount: result.vat,
        rdl_amount: result.rdl,
        cpf_amount: result.cpf,
        icd_amount: result.icd,
        wharfage_amount: result.wharfage,
        total_tzs: result.total,
        qty: result.qty,
        per_unit_tzs: result.per_unit,
        source: 'calculator',
        created_by: user.sub ?? null,
      }).execute().catch(() => {}); // Non-blocking
    }

    return result;
  });

  // ── GET /v1/customs/landed-cost/history ───────────────────────────────────────
  // Get previous landed cost calculations for this tenant
  fastify.get('/landed-cost/history', async (request) => {
    const user = request.user as any;
    return db.selectFrom('landed_cost_records')
      .selectAll()
      .where('tenant_id', '=', user.tenant_id)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
  });

  // ── POST /v1/customs/compliance-check ────────────────────────────────────────
  // Check compliance requirements for an import
  fastify.post('/compliance-check', async (request, reply) => {
    const body = request.body as any;
    if (!body.hs_code || !body.origin_country) {
      return reply.status(400).send({ error: 'hs_code and origin_country are required' });
    }

    const checks = await checkCompliance({
      hs_code: body.hs_code,
      origin_country: body.origin_country,
      goods_value_usd: body.goods_value_usd,
      import_or_export: body.import_or_export ?? 'import',
    });

    const required = checks.filter(c => c.required);
    const optional = checks.filter(c => !c.required);

    return {
      hs_code: body.hs_code,
      origin_country: body.origin_country,
      summary: {
        total_checks: checks.length,
        required_count: required.length,
        compliant_count: optional.length,
        risk_level: required.filter(c => c.color === 'red').length > 2 ? 'HIGH'
          : required.length > 0 ? 'MEDIUM' : 'LOW',
      },
      checks,
    };
  });

  // ── POST /v1/customs/penalty-calc ────────────────────────────────────────────
  // Calculate customs penalties under CEMA CAP 403
  fastify.post('/penalty-calc', async (request, reply) => {
    const user = request.user as any;
    const body = request.body as any;

    if (!body.violation_type) {
      return reply.status(400).send({ error: 'violation_type is required' });
    }

    const result = await calculatePenalty({
      violation_type: body.violation_type,
      hs_code: body.hs_code,
      declared_value_usd: body.declared_value_usd ? parseFloat(body.declared_value_usd) : undefined,
      actual_value_usd: body.actual_value_usd ? parseFloat(body.actual_value_usd) : undefined,
      declared_hs: body.declared_hs,
      actual_hs: body.actual_hs,
      late_months: body.late_months ? parseInt(body.late_months) : undefined,
      fx_rate: body.fx_rate ? parseFloat(body.fx_rate) : undefined,
      shipment_ref: body.shipment_ref,
    });

    // Save penalty record to DB if significant
    if (result.total_penalty_tzs > 0 && body.save_record !== false) {
      await db.insertInto('customs_penalties').values({
        tenant_id: user.tenant_id,
        shipment_ref: body.shipment_ref ?? null,
        hs_code: body.hs_code ?? null,
        violation_type: body.violation_type,
        declared_value: body.declared_value_usd ? parseFloat(body.declared_value_usd) : null,
        actual_value: body.actual_value_usd ? parseFloat(body.actual_value_usd) : null,
        declared_hs: body.declared_hs ?? null,
        actual_hs: body.actual_hs ?? null,
        duty_shortfall: result.duty_shortfall_tzs,
        penalty_amount: result.total_penalty_tzs,
        late_months: body.late_months ? parseInt(body.late_months) : 0,
        currency: 'TZS',
        status: 'open',
        created_by: user.sub ?? null,
      }).execute().catch(() => {});
    }

    return result;
  });

  // ── GET /v1/customs/penalties ─────────────────────────────────────────────────
  // List saved penalty records for tenant
  fastify.get('/penalties', async (request) => {
    const user = request.user as any;
    return db.selectFrom('customs_penalties')
      .selectAll()
      .where('tenant_id', '=', user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
  });

  // ── PATCH /v1/customs/penalties/:id ──────────────────────────────────────────
  // Update status of a penalty record
  fastify.patch('/penalties/:id', async (request) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };
    const { status, notes } = request.body as any;

    return db.updateTable('customs_penalties')
      .set({ status: status ?? undefined, notes: notes ?? undefined, updated_at: new Date() })
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .returningAll()
      .executeTakeFirst();
  });

  // ── GET /v1/customs/vessel/:identifier ───────────────────────────────────────
  // Get vessel position from cache (populated by AIS tracking)
  fastify.get('/vessel/:identifier', async (request, reply) => {
    const { identifier } = request.params as { identifier: string };
    const position = await getVesselPosition(identifier);
    if (!position) {
      return reply.status(404).send({
        error: 'Vessel not found in tracking cache',
        hint: 'Ensure the vessel MMSI or IMO number is correct and has been tracked recently',
        aisstream_url: 'https://aisstream.io',
      });
    }
    return position;
  });

  // ── GET /v1/customs/vessels ───────────────────────────────────────────────────
  // List all tracked vessels (most recently updated first)
  fastify.get('/vessels', async (request) => {
    const q = (request.query as any).q ?? '';
    let query = db.selectFrom('vessel_positions').selectAll();
    if (q) {
      query = query.where('vessel_name', 'ilike', `%${q}%`);
    }
    return query.orderBy('last_updated', 'desc').limit(100).execute();
  });

  // ── GET /v1/customs/tariff-summary ────────────────────────────────────────────
  // Returns a summary of the Tanzania tariff schedule (chapter level)
  fastify.get('/tariff-summary', async () => {
    return db.selectFrom('hs_codes')
      .select(['code', 'description', 'import_duty_rate', 'vat_rate', 'excise_rate', 'pvoc_required', 'di_required', 'permits', 'notes'])
      .where('level', '=', 2)
      .orderBy('code', 'asc')
      .execute();
  });
}
