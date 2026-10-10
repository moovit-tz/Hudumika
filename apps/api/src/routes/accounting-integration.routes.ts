import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AccountingIntegrationService, type AccountingProvider } from '../services/accounting-integration.service.js';
import { requireRole } from '../middleware/rbac.js';
import { withTenant } from '../db/client.js';
import { reconcileXeroInvoice } from '../services/accounting-outbox.service.js';

const PROVIDERS: AccountingProvider[] = ['QUICKBOOKS', 'XERO'];
const marketplaceRequestSchema = z.object({ providerName: z.string().trim().min(1).max(200) });

export async function accountingIntegrationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/accounting-integrations
  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const status = await AccountingIntegrationService.getIntegrations(tenantId);
      return status;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/deliveries', { preHandler: requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','FINANCE','SALES') }, async (request, reply) => {
    const parsed=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),page_size:z.coerce.number().int().min(1).max(100).default(25),status:z.enum(['PENDING','RUNNING','SUCCESS','RETRY','RECONCILE','FAILED']).optional(),provider:z.enum(['QUICKBOOKS','XERO']).optional()}).safeParse(request.query);
    if(!parsed.success)return reply.status(400).send({error:'Invalid delivery filters.'});
    const {page,page_size,status,provider}=parsed.data;const tenantId=request.user.tenant_id;
    return withTenant(tenantId,async trx=>{
      let query=trx.selectFrom('finance_accounting_outbox').where('tenant_id','=',tenantId);
      if(status)query=query.where('status','=',status);if(provider)query=query.where('provider','=',provider);
      const total=await query.select(trx.fn.countAll().as('count')).executeTakeFirstOrThrow();
      const items=await query.selectAll().orderBy('created_at','desc').orderBy('id','desc').limit(page_size).offset((page-1)*page_size).execute();
      return {items,total:Number(total.count),page,page_size};
    });
  });

  fastify.post('/deliveries/:id/retry', { preHandler: requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','FINANCE') }, async (request, reply) => {
    const parsed=z.object({id:z.string().uuid()}).safeParse(request.params);
    if(!parsed.success)return reply.status(400).send({error:'Invalid delivery ID.'});
    const tenantId=request.user.tenant_id;
    return withTenant(tenantId,async trx=>{
      const row=await trx.selectFrom('finance_accounting_outbox').selectAll().where('tenant_id','=',tenantId).where('id','=',parsed.data.id).forUpdate().executeTakeFirst();
      if(!row)return reply.status(404).send({error:'Delivery not found.'});
      if(row.status!=='FAILED')return reply.status(409).send({error:'Only failed preflight deliveries can be retried. Uncertain writes require provider reconciliation.'});
      if(row.provider==='QUICKBOOKS'&&['BILL','BILL_PAYMENT'].includes(row.entity_type))return reply.status(409).send({error:'This provider export is not implemented.'});
      const connection=await trx.selectFrom('accounting_integrations').select(['status','provider_org_id']).where('tenant_id','=',tenantId).where('provider','=',row.provider).executeTakeFirst();
      if(!row.provider_org_id||connection?.status!=='CONNECTED'||connection.provider_org_id!==row.provider_org_id)return reply.status(409).send({error:'Restore the original provider connection before retrying.'});
      const detail=`Accounting sync retry: ${row.provider}, delivery ${row.id}, ${row.attempts} previous attempts.`;
      if(row.entity_type==='INVOICE'||row.entity_type==='INVOICE_PAYMENT'){
        const payment=row.entity_type==='INVOICE_PAYMENT'?await trx.selectFrom('invoice_payments').select('invoice_id').where('tenant_id','=',tenantId).where('id','=',row.entity_id).executeTakeFirst():null;
        const invoiceId=row.entity_type==='INVOICE'?row.entity_id:payment?.invoice_id;
        if(!invoiceId||!await trx.selectFrom('sales_invoices').select('id').where('tenant_id','=',tenantId).where('id','=',invoiceId).executeTakeFirst())return reply.status(409).send({error:'The source document is no longer available.'});
        await trx.insertInto('invoice_activity_log').values({tenant_id:tenantId,invoice_id:invoiceId,actor_id:request.user.sub,actor_name:request.user.name||request.user.email,action:'accounting_sync_retry',detail}).execute();
      }else{
        const payment=row.entity_type==='BILL_PAYMENT'?await trx.selectFrom('bill_payments').select('bill_id').where('tenant_id','=',tenantId).where('id','=',row.entity_id).executeTakeFirst():null;
        const billId=row.entity_type==='BILL'?row.entity_id:payment?.bill_id;
        if(!billId||!await trx.selectFrom('supplier_bills').select('id').where('tenant_id','=',tenantId).where('id','=',billId).executeTakeFirst())return reply.status(409).send({error:'The source document is no longer available.'});
        await trx.insertInto('bill_activity_log').values({tenant_id:tenantId,bill_id:billId,actor_id:request.user.sub,actor_name:request.user.name||request.user.email,action:'accounting_sync_retry',detail}).execute();
      }
      return trx.updateTable('finance_accounting_outbox').set({status:'PENDING',attempts:0,next_attempt_at:new Date(),last_error:null,updated_at:new Date()}).where('tenant_id','=',tenantId).where('id','=',row.id).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.post('/deliveries/:id/reconcile', { preHandler: requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','FINANCE') }, async (request, reply) => {
    const params=z.object({id:z.string().uuid()}).safeParse(request.params);
    const body=z.object({external_id:z.string().uuid()}).strict().safeParse(request.body);
    if(!params.success||!body.success)return reply.status(400).send({error:'Valid delivery and Xero invoice IDs are required.'});
    try { return await reconcileXeroInvoice(request.user.tenant_id,params.data.id,body.data.external_id,request.user); }
    catch(cause) { return reply.status(409).send({error:cause instanceof Error?cause.message:'Unable to reconcile delivery.'}); }
  });

  // POST /v1/accounting-integrations/:provider/disconnect
  fastify.post('/:provider/disconnect', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.disconnect(tenantId, upperProvider as AccountingProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/test-connection — a real
  // call to the provider's own company-info/organisation endpoint, proving
  // the stored token actually works. Replaces the old Connect flow, which
  // validated nothing at all (it just stored whatever JSON was posted).
  fastify.post('/:provider/test-connection', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.testConnection(tenantId, upperProvider as AccountingProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/sync — pulls the provider's
  // REAL chart of accounts as a read-only mirror. No longer writes
  // anything into the tenant's own chart_of_accounts.
  fastify.post('/:provider/sync', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.syncCOA(tenantId, upperProvider as AccountingProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/marketplace/:providerId/request
  // No real integration exists for any of these providers (Wave, FreshBooks,
  // Zoho, NetSuite, MYOB, Odoo, Stripe, Square, Flutterwave, M-Pesa, PayPal,
  // Airtel, and now also Sage/Tally — downgraded here from a fake connect
  // flow that never called anything real) — this just records the interest
  // so a real person can follow up.
  fastify.post('/marketplace/:providerId/request', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { providerId } = request.params as { providerId: string };
    const { providerName } = marketplaceRequestSchema.parse(request.body);

    const row = await withTenant(tenantId, trx => trx.insertInto('accounting_marketplace_requests').values({
      tenant_id: tenantId,
      provider_id: providerId,
      provider_name: providerName,
      requested_by: request.user.sub,
    }).returningAll().executeTakeFirstOrThrow());
    reply.status(201);
    return row;
  });
}
