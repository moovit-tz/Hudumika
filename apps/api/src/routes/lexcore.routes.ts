import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

export async function lexcoreRoutes(server: FastifyInstance) {
  server.addHook('preHandler', requireEntitlement('lexcore'));

  server.get('/matters', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_matters')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { matters: rows };
    });
  });

  server.get('/time-entries', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_time_entries')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('entry_date', 'desc')
        .limit(100)
        .execute();
      return { entries: rows };
    });
  });

  server.get('/trust-accounts', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_trust_accounts')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { accounts: rows };
    });
  });

  server.get('/conflicts', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_conflict_checks')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('checked_at', 'desc')
        .limit(100)
        .execute();
      return { checks: rows };
    });
  });

  server.get('/clients', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_clients')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('name', 'asc')
        .execute();
      return { clients: rows };
    });
  });

  server.get('/court-cases', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_court_cases')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { cases: rows };
    });
  });

  server.get('/court-events', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_court_events')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('scheduled_at', 'asc')
        .limit(100)
        .execute();
      return { events: rows };
    });
  });

  server.get('/deadlines', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_deadlines')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('due_date', 'asc')
        .limit(100)
        .execute();
      return { deadlines: rows };
    });
  });

  server.get('/disbursements', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_disbursements')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('entry_date', 'desc')
        .limit(100)
        .execute();
      return { disbursements: rows };
    });
  });

  server.get('/invoices', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_invoices')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('invoice_date', 'desc')
        .limit(100)
        .execute();
      return { invoices: rows };
    });
  });

  server.get('/fee-earners', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_fee_earner_profiles')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { feeEarners: rows };
    });
  });

  server.get('/documents', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('legal_matter_documents')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { documents: rows };
    });
  });
}
