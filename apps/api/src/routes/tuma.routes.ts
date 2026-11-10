import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

export async function tumaRoutes(server: FastifyInstance) {
  // Missing until now: every route below reads request.user directly
  // (tenant_id in particular) but nothing populated it — requireEntitlement()
  // itself checks `if (!request.user)` first and 401s, so this whole plugin
  // was unreachable by any real authenticated caller, not just ungated.
  server.addHook('preHandler', server.authenticate);
  server.addHook('preHandler', requireEntitlement('tuma'));

  // GET /parcels moved to tuma-parcels.routes.ts (full CRUD with filters/pagination)

  server.get('/agents', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('tuma_agents')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { agents: rows };
    });
  });

  server.get('/fleet', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('tuma_vehicles')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { vehicles: rows };
    });
  });

  server.get('/offices', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('tuma_booking_offices')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('name', 'asc')
        .execute();
      return { offices: rows };
    });
  });

  server.get('/float', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('tuma_float_accounts')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { accounts: rows };
    });
  });

  server.get('/settlement', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('tuma_beneficiaries')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
      return { beneficiaries: rows };
    });
  });
}
