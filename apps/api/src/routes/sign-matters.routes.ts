// ─── eSign — Matters (Phase S7, consultant/matter model) ───────────────────
// Prefix: /v1/sign (registered alongside sign.routes.ts). A "Matters" list
// is just a GROUP BY over sign_envelopes.matter_reference (migration 428) —
// there is no sign_matters table, no separate lifecycle to keep in sync,
// and nothing here can drift from the envelopes themselves because it's
// computed from them on every request. Deliberately its own small file
// rather than added to sign.routes.ts (the same pattern sign-versions.
// routes.ts/sign-stamps.routes.ts already use for this exact reason: a
// self-contained feature stays out of that file's own, much larger,
// active edit surface).
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}
function userRole(req: FastifyRequest): string {
  return (req.user as { role: string }).role;
}

// Same allow-list as sign.routes.ts's own DOCUMENT_ADMIN_ROLES (not
// exported from that file, so mirrored here) — a matter groups envelopes
// across every user in the tenant, the same cross-user disclosure shape as
// that file's `view=all`, so it gets the same gate rather than a new,
// looser one invented for this feature alone.
const DOCUMENT_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

export async function signMattersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (req, reply) => {
    if (!DOCUMENT_ADMIN_ROLES.includes(userRole(req))) {
      return reply.status(403).send({ error: 'Only a tenant admin can browse matters across every user’s documents.' });
    }
  });

  // ── List matters — grouped summary, newest activity first ───────────────
  fastify.get('/matters', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const rows = await sql<{
        matter_reference: string;
        envelope_count: number;
        last_updated: Date;
        client_names: string[] | null;
      }>`
        SELECT e.matter_reference,
               count(*)::int AS envelope_count,
               max(e.updated_at) AS last_updated,
               array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS client_names
        FROM sign_envelopes e
        LEFT JOIN customers c ON c.id = e.client_id
        WHERE e.tenant_id = ${tid} AND e.matter_reference IS NOT NULL
        GROUP BY e.matter_reference
        ORDER BY max(e.updated_at) DESC
      `.execute(trx);

      return { data: rows.rows };
    });
  });

  // ── One matter's envelopes ───────────────────────────────────────────────
  fastify.get('/matters/:reference/envelopes', async (req: FastifyRequest<{ Params: { reference: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const envelopes = await trx.selectFrom('sign_envelopes as e')
        .leftJoin('customers as c', 'c.id', 'e.client_id')
        .select(['e.id', 'e.title', 'e.status', 'e.execution_type', 'e.client_id', 'c.name as client_name', 'e.updated_at', 'e.created_at'])
        .where('e.tenant_id', '=', tid)
        .where('e.matter_reference', '=', req.params.reference)
        .orderBy('e.updated_at', 'desc')
        .execute();
      if (!envelopes.length) return reply.status(404).send({ error: 'No envelopes found for this matter reference' });
      return { data: envelopes };
    });
  });
}
