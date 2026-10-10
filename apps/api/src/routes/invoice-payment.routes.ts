import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { invoicePaymentSummary } from '../services/invoice-payment-link.service.js';
import { renderInvoicePdf } from '../services/invoice-pdf.service.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
export async function invoicePaymentRoutes(server:FastifyInstance) {
 server.addHook('preHandler',server.authenticate);
 server.addHook('preHandler',requireAnyEntitlement(['finops','seal']));
 server.addHook('preHandler',requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','FINANCE','SALES','CUSTOMER'));
 server.addHook('onSend',async(_request,reply,payload)=>{reply.header('Cache-Control','no-store');return payload;});
 async function summary(request:any) {
  const id=z.string().uuid().safeParse(request.params.id);if(!id.success)return null;
  const customerId=request.user.role==='CUSTOMER'?await resolveCustomerId(request.user):undefined;
  if(request.user.role==='CUSTOMER'&&!customerId)return null;
  return invoicePaymentSummary(request.user.tenant_id,id.data,customerId || undefined);
 }
 server.get('/:id',async(request,reply)=>{const data=await summary(request);return data || reply.status(404).send({error:'Invoice not available for this account.'});});
 server.get('/:id/pdf',async(request,reply)=>{
  if(!await summary(request))return reply.status(404).send({error:'Invoice not available for this account.'});
  const pdf=await renderInvoicePdf(request.user.tenant_id,(request.params as {id:string}).id);
  return reply.header('Content-Type','application/pdf').header('Content-Disposition','attachment; filename="invoice.pdf"').send(pdf);
 });
}
