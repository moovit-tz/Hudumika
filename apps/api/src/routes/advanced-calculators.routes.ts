/**
 * Routes for the three additional landed-cost calculators (LCL, Air Freight,
 * Transit) — see advanced-calculators.service.ts for why these are separate
 * from customs.service.ts's existing sea_fcl/sea_lcl/air engine.
 *
 * History is NOT a separate table — every save reuses landed_cost_records
 * (the same table customs.routes.ts's /landed-cost and /landed-cost/multi-item
 * already write to), tagged with a distinct `shipment_mode` and the full
 * result stashed in `payload`. This is what gives the existing History page
 * a single combined view across every calculator without a new UI.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import {
  calculateLclAdvanced, calculateAirAdvanced, calculateTransit,
  listTransitRoutes, upsertTransitRoute, deleteTransitRoute,
  type AdvancedCalcResult,
} from '../services/advanced-calculators.service.js';

const MAX_PAYLOAD_BYTES = 4_000_000;

// landed_cost_records.source is VARCHAR(20) — 'calculator-sea_lcl_advanced'
// (27 chars) and 'calculator-air_advanced' (24 chars) both overflow it and
// fail the whole insert (silently, since saveToHistory is non-blocking by
// design like the existing calculators' own save). Short, explicit codes
// instead of deriving from `result.mode`.
const SOURCE_BY_MODE: Record<string, string> = {
  sea_lcl_advanced: 'calc-lcl-adv',
  air_advanced: 'calc-air-adv',
  transit: 'calc-transit',
};

const rateOverridesSchema = z.object({
  duty_rate: z.number().nonnegative().optional(),
  vat_rate: z.number().nonnegative().optional(),
  rdl_rate: z.number().nonnegative().optional(),
  cpf_rate: z.number().nonnegative().optional(),
}).optional();

const lclSchema = z.object({
  hs_code: z.string().min(1),
  description: z.string().optional(),
  fob_usd: z.number().nonnegative(),
  freight_usd: z.number().nonnegative(),
  insurance_usd: z.number().nonnegative().optional(),
  cbm: z.number().nonnegative(),
  weight_mt: z.number().nonnegative().optional(),
  num_bills: z.number().int().positive().optional(),
  num_units: z.number().positive().optional(),
  transportation_usd: z.number().nonnegative().optional(),
  tbs_inspection_usd: z.number().nonnegative().optional(),
  fx_rate_override: z.number().positive().optional(),
  rate_overrides: rateOverridesSchema,
  shipment_ref: z.string().optional(),
  customer_name: z.string().optional(),
  destination: z.string().optional(),
  title: z.string().optional(),
  save_to_history: z.boolean().optional(),
});

const airSchema = z.object({
  hs_code: z.string().min(1),
  description: z.string().optional(),
  currency: z.string().optional(),
  fob: z.number().nonnegative(),
  freight: z.number().nonnegative().optional(),
  insurance: z.number().nonnegative().optional(),
  weight_kg: z.number().nonnegative(),
  num_awbs: z.number().int().positive().optional(),
  num_units: z.number().positive().optional(),
  transportation_tzs: z.number().nonnegative().optional(),
  storage_applicable: z.boolean().optional(),
  fx_rate_override: z.number().positive().optional(),
  rate_overrides: rateOverridesSchema,
  shipment_ref: z.string().optional(),
  customer_name: z.string().optional(),
  destination: z.string().optional(),
  title: z.string().optional(),
  save_to_history: z.boolean().optional(),
});

const transitSchema = z.object({
  hs_code: z.string().optional(),
  description: z.string().optional(),
  fob_usd: z.number().nonnegative().optional(),
  freight_usd: z.number().nonnegative().optional(),
  insurance_usd: z.number().nonnegative().optional(),
  destination: z.string().min(1),
  distance_km_override: z.number().nonnegative().optional(),
  weighbridge_count_override: z.number().int().nonnegative().optional(),
  container_size: z.enum(['20ft', '40ft']),
  num_containers: z.number().int().positive().optional(),
  cbm: z.number().nonnegative().optional(),
  num_bills: z.number().int().positive().optional(),
  escort_fee_usd: z.number().nonnegative().optional(),
  fx_rate_override: z.number().positive().optional(),
  shipment_ref: z.string().optional(),
  customer_name: z.string().optional(),
  title: z.string().optional(),
  save_to_history: z.boolean().optional(),
});

const routeSchema = z.object({
  id: z.string().optional(),
  destination: z.string().min(1),
  border_post: z.string().optional(),
  distance_km: z.number().nonnegative(),
  transport_20ft_usd: z.number().nonnegative(),
  transport_40ft_usd: z.number().nonnegative(),
  weighbridge_count: z.number().int().nonnegative(),
});

export async function advancedCalculatorRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  /** Saves an advanced-calculator result into the shared landed_cost_records
   *  history table — same shape historyExtras() in customs.routes.ts builds
   *  for the existing calculators, kept local since that helper isn't
   *  exported (it's a closure inside customsRoutes). */
  async function saveToHistory(tenantId: string, userId: string | undefined, body: any, result: AdvancedCalcResult) {
    let payload: string | null = null;
    try {
      const json = JSON.stringify({ input: body, result });
      if (json.length <= MAX_PAYLOAD_BYTES) payload = json;
    } catch { /* payload stays null */ }

    await withTenant(tenantId, trx => trx.insertInto('landed_cost_records').values({
      tenant_id: tenantId,
      shipment_ref: body.shipment_ref ?? null,
      hs_code: result.hs_code || null,
      description: result.description || null,
      cif_usd: result.currency === 'USD' ? result.cif : null,
      fx_rate: result.fx_rate,
      cif_tzs: result.cif_tzs,
      duty_rate: result.duty_rate,
      duty_amount: result.breakdown.find(b => b.label === 'Import Duty')?.amount_tzs ?? 0,
      vat_amount: result.breakdown.find(b => b.label === 'VAT')?.amount_tzs ?? 0,
      rdl_amount: result.breakdown.find(b => b.label === 'Railway Development Levy')?.amount_tzs ?? 0,
      cpf_amount: result.breakdown.find(b => b.label === 'Customs Processing Fee')?.amount_tzs ?? 0,
      icd_amount: result.charges_total_tzs,
      wharfage_amount: result.breakdown.find(b => b.label.includes('Wharfage'))?.amount_tzs ?? 0,
      total_tzs: result.grand_total_tzs,
      qty: result.per_unit?.qty ?? 1,
      per_unit_tzs: result.per_unit?.cost_incl_vat != null ? result.per_unit.cost_incl_vat * result.fx_rate : null,
      source: SOURCE_BY_MODE[result.mode] ?? 'calculator',
      created_by: userId ?? null,
      shipment_mode: result.mode,
      customer_name: body.customer_name?.trim() || null,
      destination: body.destination?.trim() || null,
      title: body.title?.trim().slice(0, 160) || null,
      item_count: 1,
      payload,
    } as any).execute()).catch(() => {}); // non-blocking, same as the existing calculators
  }

  // ── POST /v1/customs/lcl-advanced ─────────────────────────────────────
  fastify.post('/lcl-advanced', async (request) => {
    const user = request.user as any;
    const body = lclSchema.parse(request.body);
    const result = await calculateLclAdvanced(body);
    if (body.save_to_history !== false) await saveToHistory(user.tenant_id, user.sub, body, result);
    return result;
  });

  // ── POST /v1/customs/air-advanced ─────────────────────────────────────
  fastify.post('/air-advanced', async (request) => {
    const user = request.user as any;
    const body = airSchema.parse(request.body);
    const result = await calculateAirAdvanced(body);
    if (body.save_to_history !== false) await saveToHistory(user.tenant_id, user.sub, body, result);
    return result;
  });

  // ── POST /v1/customs/transit ───────────────────────────────────────────
  fastify.post('/transit', async (request) => {
    const user = request.user as any;
    const body = transitSchema.parse(request.body);
    const result = await calculateTransit(user.tenant_id, body);
    if (body.save_to_history !== false) await saveToHistory(user.tenant_id, user.sub, body, result);
    return result;
  });

  // ── Transit route reference table (editable per tenant) ────────────────
  fastify.get('/transit-routes', async (request) => {
    const user = request.user as any;
    return { data: await listTransitRoutes(user.tenant_id) };
  });

  fastify.post('/transit-routes', async (request) => {
    const user = request.user as any;
    const body = routeSchema.parse(request.body);
    return upsertTransitRoute(user.tenant_id, body);
  });

  fastify.patch<{ Params: { id: string } }>('/transit-routes/:id', async (request) => {
    const user = request.user as any;
    const body = routeSchema.parse(request.body);
    return upsertTransitRoute(user.tenant_id, { ...body, id: request.params.id });
  });

  fastify.delete<{ Params: { id: string } }>('/transit-routes/:id', async (request, reply) => {
    const user = request.user as any;
    await deleteTransitRoute(user.tenant_id, request.params.id);
    reply.status(204);
    return null;
  });
}
