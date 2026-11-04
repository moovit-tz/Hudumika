import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

export async function gerejiRoutes(server: FastifyInstance) {
  server.addHook('preHandler', requireEntitlement('gereji'));

  server.get('/job-cards', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('finance_job_cards')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { jobCards: rows };
    });
  });

  server.get('/vehicles', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('finance_vehicle_records')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { vehicles: rows };
    });
  });

  server.get('/estimates', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('gereji_estimates')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { estimates: rows };
    });
  });

  server.get('/warranty', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('gereji_warranty_claims')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { claims: rows };
    });
  });
}
