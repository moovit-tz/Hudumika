import { z } from 'zod';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';

const optionalId=z.string().uuid().nullable().optional();
export const signRecipientSchema=z.object({
  name:z.string().trim().min(1).max(200),email:z.string().trim().email().max(320),phone:z.string().max(60).nullable().optional(),
  user_id:optionalId,certifier_id:optionalId,role_label:z.string().max(200).nullable().optional(),sign_order:z.number().int().min(1).max(1000).optional(),
  execution_role:z.enum(['SIGNER','WITNESS','AFFIANT','CERTIFIER']).optional(),is_certifier:z.boolean().optional(),
  certifier_title:z.string().max(200).nullable().optional(),certifier_roll_number:z.string().max(200).nullable().optional(),certifier_firm:z.string().max(300).nullable().optional(),
}).passthrough();
export const signEditorFieldSchema=z.object({
  recipient_index:z.number().int().min(0),field_type:z.enum(['signature','initials','text','date','checkbox','stamp','certification_stamp']),
  page:z.number().int().min(1).max(10000),x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),
  width:z.number().finite().positive().max(1),height:z.number().finite().positive().max(1),required:z.boolean().optional(),placeholder:z.string().max(1000).nullable().optional(),
}).passthrough().superRefine((field,ctx)=>{if(field.x+field.width>1.000001 || field.y+field.height>1.000001)ctx.addIssue({code:'custom',message:'Signing fields must fit inside their page'});});
export const signEditorPayloadSchema=z.object({
  title:z.string().trim().min(1).max(250).optional(),message:z.string().max(10000).nullable().optional(),
  order_mode:z.enum(['sequential','parallel']).optional(),require_otp:z.boolean().optional(),
  execution_type:z.enum(['NORMAL_SIGN','WITNESSED_SIGNATURE','AFFIDAVIT','NOTARIAL_CERTIFICATION']).optional(),
  expires_at:z.string().datetime({offset:true}).nullable().optional(),file_name:z.string().max(500).nullable().optional(),
  file_id:optionalId,client_id:optionalId,bliss_meeting_id:optionalId,generated_document_id:optionalId,
  recipients:z.array(signRecipientSchema).min(1).max(100).optional(),fields:z.array(signEditorFieldSchema).max(2000).optional(),
}).passthrough();

/** Foreign IDs are checked before writes so an invalid replacement leaves the saved draft intact. */
export async function validateSignEditorReferences(db: Kysely<Database>|Transaction<Database>,tenantId:string,body:z.infer<typeof signEditorPayloadSchema>) {
  if(body.file_id && !await db.selectFrom('cloud_files').select('id').where('id','=',body.file_id).where('tenant_id','=',tenantId).executeTakeFirst()) return 'Document file not found';
  if(body.client_id && !await db.selectFrom('customers').select('id').where('id','=',body.client_id).where('tenant_id','=',tenantId).executeTakeFirst()) return 'Customer not found';
  if(body.bliss_meeting_id && !await db.selectFrom('bliss_meetings').select('id').where('id','=',body.bliss_meeting_id).where('tenant_id','=',tenantId).executeTakeFirst()) return 'Meeting not found';
  const users=[...new Set(body.recipients?.flatMap(r=>r.user_id?[r.user_id]:[]) || [])];
  if(users.length && (await db.selectFrom('users').select('id').where('id','in',users).where('tenant_id','=',tenantId).execute()).length!==users.length) return 'Recipient user not found';
  const certifiers=[...new Set(body.recipients?.flatMap(r=>r.certifier_id?[r.certifier_id]:[]) || [])];
  if(certifiers.length && (await db.selectFrom('sign_certifiers').select('id').where('id','in',certifiers).where('tenant_id','=',tenantId).execute()).length!==certifiers.length) return 'Certifier not found';
  return null;
}

export function validateFieldAssignments(fields: {recipient_index:number}[]|undefined,recipientCount:number) {
  return fields?.some(field=>field.recipient_index>=recipientCount) ? 'A signing field references an unknown recipient' : null;
}
