import type { FastifyInstance } from 'fastify';
import type { Updateable } from 'kysely';
import { z } from 'zod';
import { withTenant, type SealLotsTable } from '../db/client.js';
import { SealService, DgSegregationViolation } from '../services/seal.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.').nullable().optional();
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const updateSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
  description: z.string().trim().min(1).max(2000).optional(),
  productId: z.string().trim().min(1).max(64).nullable().optional(),
  hsCode: text(20), countryOfOrigin: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  marksAndNumbers: text(2000), batch: text(100), serial: text(200),
  expiryDate: date, expiresOn: date,
  volumeCbm: z.number().finite().positive().nullable().optional(),
  grossWeightKg: z.number().finite().nonnegative().nullable().optional(),
  destinationLabel: text(200), isDangerousGoods: z.boolean().optional(),
  unNumber: text(20), imdgClass: text(20), requiresReefer: z.boolean().optional(),
  reeferSetpointC: z.number().finite().min(-100).max(100).nullable().optional(),
}).strict();

const columns = {
  description: 'description', productId: 'product_id', hsCode: 'hs_code', countryOfOrigin: 'country_of_origin',
  marksAndNumbers: 'marks_and_numbers', batch: 'batch', serial: 'serial', expiryDate: 'expiry_date', expiresOn: 'expires_on',
  volumeCbm: 'volume_cbm', grossWeightKg: 'gross_weight_kg', destinationLabel: 'destination_label',
  isDangerousGoods: 'is_dangerous_goods', unNumber: 'un_number', imdgClass: 'imdg_class', requiresReefer: 'requires_reefer', reeferSetpointC: 'reefer_setpoint_c',
} as const;
const numeric = new Set(['volumeCbm', 'grossWeightKg', 'reeferSetpointC']);
const dates = new Set(['expiryDate', 'expiresOn']);

// Inherits SEAL authentication, entitlement and customer-role exclusion.
export async function registerSealLotEditing(app: FastifyInstance) {
  app.patch('/lots/:id', async (request: any, reply) => {
    if (!z.string().uuid().safeParse(request.params.id).success) return reply.code(404).send({error:'Lot not found.'});
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({error:parsed.error.issues.map(i=>`${i.path.join('.') || 'Update'}: ${i.message}`).join(' ')});
    const input = parsed.data;
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const lot = await trx.selectFrom('seal_lots').selectAll().where('tenant_id','=',request.user.tenant_id).where('id','=',request.params.id).forUpdate().executeTakeFirst();
        if (!lot) return reply.code(404).send({error:'Lot not found.'});
        if (new Date(input.expectedUpdatedAt).getTime() !== new Date(lot.updated_at).getTime()) return reply.code(409).send({error:'This lot changed while you were editing. Reload its latest details before saving.'});
        if (input.productId && !await trx.selectFrom('products').select('id').where('tenant_id','=',request.user.tenant_id).where('id','=',input.productId).executeTakeFirst()) return reply.code(404).send({error:'Product not found in this workspace.'});
        const dg = input.isDangerousGoods ?? lot.is_dangerous_goods;
        const imdg = input.imdgClass === undefined ? lot.imdg_class : input.imdgClass;
        const un = input.unNumber === undefined ? lot.un_number : input.unNumber;
        if (dg && (!imdg || !un)) return reply.code(400).send({error:'Dangerous goods require a UN number and IMDG class.'});
        if (dg && lot.current_location_id) await SealService.checkDgSegregation(trx, request.user.tenant_id, lot.current_location_id, {isDangerousGoods:dg,imdgClass:imdg}, lot.id);
        const reefer = input.requiresReefer ?? lot.requires_reefer;
        const setpoint = input.reeferSetpointC === undefined ? lot.reefer_setpoint_c : input.reeferSetpointC;
        if (reefer && setpoint == null) return reply.code(400).send({error:'Refrigerated goods require a temperature setpoint.'});
        if (input.expiresOn && lot.warehoused_on && new Date(input.expiresOn) < new Date(lot.warehoused_on)) return reply.code(400).send({error:'The storage deadline cannot be before the receipt date.'});
        const changes: Record<string,{before:unknown;after:unknown}> = {};
        const patch: Record<string,unknown> = {};
        for (const field of Object.keys(columns) as Array<keyof typeof columns>) {
          if (input[field] === undefined) continue;
          const column = columns[field];
          const raw = lot[column];
          const before = numeric.has(field) ? raw == null ? null : Number(raw) : dates.has(field) ? raw == null ? null : new Date(String(raw)).toISOString().slice(0,10) : raw;
          const after = input[field];
          if (before === after) continue;
          changes[field] = {before,after};
          patch[column] = numeric.has(field) ? after == null ? null : String(after) : after;
        }
        if (!Object.keys(changes).length) return {id:lot.id,updatedAt:lot.updated_at,changed:false};
        const updatedAt = new Date(Math.max(Date.now(), new Date(lot.updated_at).getTime()+1));
        patch.updated_at = updatedAt;
        await trx.updateTable('seal_lots').set(patch as Updateable<SealLotsTable>).where('tenant_id','=',request.user.tenant_id).where('id','=',lot.id).execute();
        await trx.insertInto('seal_lot_revisions').values({tenant_id:request.user.tenant_id,lot_id:lot.id,actor_id:request.user.sub,reason:input.reason,changes:JSON.stringify(changes)}).execute();
        return {id:lot.id,updatedAt,changed:true};
      });
    } catch(e:any) {
      if(e instanceof DgSegregationViolation) return reply.code(422).send({error:e.message});
      return reply.code(500).send({error:e.message});
    }
  });

  app.get('/lots/:id/revisions', async (request:any,reply) => {
    if (!z.string().uuid().safeParse(request.params.id).success) return reply.code(404).send({error:'Lot not found.'});
    return withTenant(request.user.tenant_id, async trx => {
      const lot=await trx.selectFrom('seal_lots').select('id').where('tenant_id','=',request.user.tenant_id).where('id','=',request.params.id).executeTakeFirst();
      if(!lot)return reply.code(404).send({error:'Lot not found.'});
      const rows=await trx.selectFrom('seal_lot_revisions').leftJoin('users',join=>join.onRef('users.id','=','seal_lot_revisions.actor_id').on('users.tenant_id','=',request.user.tenant_id))
        .select(['seal_lot_revisions.id','seal_lot_revisions.actor_id','users.name as actor_name','seal_lot_revisions.reason','seal_lot_revisions.changes','seal_lot_revisions.created_at'])
        .where('seal_lot_revisions.tenant_id','=',request.user.tenant_id).where('lot_id','=',lot.id).orderBy('seal_lot_revisions.created_at','desc').execute();
      return rows.map(r=>({id:r.id,actorId:r.actor_id,actorName:r.actor_name,reason:r.reason,changes:r.changes,createdAt:r.created_at}));
    });
  });
}
