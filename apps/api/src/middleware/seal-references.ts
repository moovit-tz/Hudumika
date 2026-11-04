import type { FastifyRequest, FastifyReply } from 'fastify';
import { withTenant } from '../db/client.js';

const references = {
  compartmentId:'seal_compartments',fromCompartmentId:'seal_compartments',toCompartmentId:'seal_compartments',
  ownerId:'customers',customerId:'customers',lotId:'seal_lots',locationId:'seal_locations',toLocationId:'seal_locations',
  zoneId:'seal_zones',assignedTo:'users',actionAssignee:'users',performedByUserId:'users',vehicleId:'vehicles',
  consignmentId:'seal_consignments',yardSlotId:'seal_yard_slots',guaranteeId:'seal_guarantees',
} as const;

// Foreign keys supplied in SEAL forms must resolve inside the signed-in workspace.
export async function validateSealReferences(request:FastifyRequest, reply:FastifyReply) {
  if (!request.body || typeof request.body !== 'object') return;
  const found:Array<{field:keyof typeof references;id:string}>=[];
  function visit(value:unknown,depth=0){
    if(depth>5||!value||typeof value!=='object')return;
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
    for(const [field,id]of Object.entries(value)){
      if(field in references && typeof id==='string'&&id)found.push({field:field as keyof typeof references,id});
      else if(field==='lines')visit(id,depth+1);
    }
  }
  visit(request.body);
  if(!found.length)return;
  if(found.some(ref=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.id)))return reply.code(404).send({error:'Referenced record not found.'});
  const tenantId=request.user.tenant_id;
  const invalid=await withTenant(tenantId,async trx=>{
    for(const {field,id}of found){
      const row=await trx.selectFrom(references[field]).select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
      if(!row)return field;
    }
    const body=request.body as Record<string,unknown>;
    if(typeof body.zoneId==='string'&&typeof body.compartmentId==='string'){
      const zone=await trx.selectFrom('seal_zones').select('id').where('tenant_id','=',tenantId).where('id','=',body.zoneId).where('compartment_id','=',body.compartmentId).executeTakeFirst();
      if(!zone)return 'zoneId';
    }
    return null;
  });
  if(invalid)return reply.code(404).send({error:`${invalid.replace(/Id$/,'')} not found in this workspace.`});
}
