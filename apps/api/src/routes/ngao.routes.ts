import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

export async function ngaoRoutes(server: FastifyInstance) {
  // This file is registered on its own `server.register(...)` call in
  // index.ts, so a `fastify.authenticate` hook added anywhere else never
  // reaches it — without this, `requireEntitlement('ngao')` below always
  // sees an unset `request.user` and every route in this file 401s,
  // unconditionally, for every tenant. Found live while verifying the
  // Privacy P0 fix in ngao-crud.routes.ts's own copy of this same gap.
  server.addHook('preHandler', server.authenticate);
  server.addHook('preHandler', requireEntitlement('ngao'));

  server.get('/assessments', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('privacy_assessments')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { assessments: rows };
    });
  });

  server.get('/registers', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('processing_activities')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { activities: rows };
    });
  });

  server.get('/incidents', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('privacy_incidents')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('detected_at', 'desc')
        .limit(100)
        .execute();
      return { incidents: rows };
    });
  });

  server.get('/consent', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('consent_records')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('granted_at', 'desc')
        .limit(100)
        .execute();
      return { records: rows };
    });
  });

  server.get('/alerts', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('privacy_compliance_alerts')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('due_date', 'asc')
        .limit(100)
        .execute();
      return { alerts: rows };
    });
  });

  server.get('/vendors', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('privacy_vendors')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('name', 'asc')
        .execute();
      return { vendors: rows };
    });
  });

  server.get('/rights-requests', async (request) => {
    return withTenant(request.user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('privacy_rights_requests')
        .selectAll()
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      return { requests: rows };
    });
  });
}
