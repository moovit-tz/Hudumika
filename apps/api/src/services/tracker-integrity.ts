import { z } from 'zod';
import { validateContainerNumber } from '@hudumika/types';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export const lifecycleStages = ['AVAILABLE_AT_DEPOT','DEPOT_ALLOCATED','GATE_IN_ORIGIN','VESSEL_LOADED','OCEAN_TRANSIT','PORT_DISCHARGED','CUSTOMS_RELEASE','GATE_OUT_PORT','ONLAND_TRANSIT','AT_CONSIGNEE','DEVANNED','EMPTY_RETURNED'] as const;
export async function requireTrackerAccess(req: FastifyRequest, reply: FastifyReply) {
  const operations = ['SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','SENIOR','JUNIOR','OFFICER'];
  if (!operations.includes(req.user.role)) return reply.code(403).send({ error: 'Operations permission required' });
}
export async function validateTrackerReferences(trx: Transaction<Database>, tenantId: string, body: any) {
  for (const [key, table] of [['customer_id','customers'],['shipment_id','shipment_cases'],['carrier_id','carriers'],['rate_card_id','freight_rate_cards']] as const) {
    if (body[key] == null || body[key] === '') continue;
    const id = z.string().uuid().parse(body[key]);
    let row: { id: string } | undefined;
    if (table === 'customers') row = await trx.selectFrom('customers').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (table === 'shipment_cases') row = await trx.selectFrom('shipment_cases').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (table === 'carriers') row = await trx.selectFrom('carriers').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (table === 'freight_rate_cards') row = await trx.selectFrom('freight_rate_cards').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (!row) throw Object.assign(new Error(`Invalid ${key} for this workspace`), { statusCode: 400 });
  }
}
const obj = z.record(z.string(), z.unknown());
const dimensions = z.object({height_m:z.number().finite().nonnegative().optional(),width_m:z.number().finite().nonnegative().optional(),length_m:z.number().finite().nonnegative().optional(),tare_weight_kg:z.number().finite().nonnegative().optional(),max_gross_weight_kg:z.number().finite().nonnegative().optional(),gross_weight_kg:z.number().finite().nonnegative().optional(),payload_capacity_kg:z.number().finite().nonnegative().optional(),payload_kg:z.number().finite().nonnegative().optional(),cubic_capacity_cbm:z.number().finite().nonnegative().optional()}).passthrough();
export const containerWriteSchema = z.object({
  container_number: z.string().transform(s => s.trim().toUpperCase().replace(/\s/g,'')).refine(s => validateContainerNumber(s).valid, 'Invalid ISO 6346 container number or check digit'),
  iso_code: z.string().max(30).optional(), size_type: z.string().max(200).optional(), ownership: z.string().max(100).optional(), condition: z.string().max(100).optional(),
  carrier: z.string().max(200).optional(), carrier_name: z.string().max(200).nullable().optional(), carrier_code: z.string().max(30).nullable().optional(), color_hex: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  lifecycle_stage: z.enum(lifecycleStages).optional(), customer_id: z.string().uuid().nullable().optional(), shipment_id: z.string().uuid().nullable().optional(),
  dimensions: dimensions.optional(), compliance: obj.optional(), current_depot: obj.optional(), classification: obj.optional(), cargo_breakdown: z.array(z.object({description:z.string().max(4000),quantity:z.number().finite().nonnegative()}).passthrough()).optional(), notes: z.string().max(10000).nullable().optional(),
  tare_weight_kg: z.number().nonnegative().optional(), max_gross_weight_kg: z.number().nonnegative().optional(), payload_capacity_kg: z.number().nonnegative().optional(), cubic_capacity_cbm: z.number().nonnegative().optional(),
  floor_type: z.string().max(200).optional(), manufacture_year: z.number().int().min(0).max(2200).optional(), manufacturer: z.string().max(200).optional(), design_validity_years: z.number().nonnegative().optional(),
});
