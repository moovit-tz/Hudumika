// ─── eSign — Jurisdiction engine (Phase S5) ─────────────────────────────────
// Prefix: /v1/sign. Platform-level reference data (sign_jurisdiction_rules,
// migration 430) — no tenant_id, no RLS, same shape as metric_definitions
// (411). Its own small file for the same reason sign-versions.routes.ts/
// sign-matters.routes.ts are: self-contained, out of sign.routes.ts's own
// much larger active edit surface.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbPlatform } from '../db/client.js';

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}

export async function signJurisdictionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── This tenant's own rules — resolves tenants.country server-side so
  // the editor never needs a second round trip just to learn its own
  // tenant's jurisdiction. ───────────────────────────────────────────────
  fastify.get('/jurisdiction-rules/mine', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenant = await dbPlatform.selectFrom('tenants').select('country')
      .where('id', '=', tenantId(req)).executeTakeFirst();
    if (!tenant?.country) {
      return { jurisdiction_code: null, rules: [] };
    }
    const rules = await dbPlatform.selectFrom('sign_jurisdiction_rules').selectAll()
      .where('jurisdiction_code', '=', tenant.country)
      .execute();
    return { jurisdiction_code: tenant.country, rules };
  });

  // ── Any jurisdiction's rules — for the small set the table actually
  // has rows for; not a general country lookup. ───────────────────────────
  fastify.get('/jurisdiction-rules', async (req: FastifyRequest<{ Querystring: { jurisdiction?: string } }>) => {
    let q = dbPlatform.selectFrom('sign_jurisdiction_rules').selectAll();
    if (req.query.jurisdiction) q = q.where('jurisdiction_code', '=', req.query.jurisdiction.toUpperCase());
    const rules = await q.orderBy('jurisdiction_code', 'asc').orderBy('execution_type', 'asc').execute();
    return { data: rules };
  });
}
