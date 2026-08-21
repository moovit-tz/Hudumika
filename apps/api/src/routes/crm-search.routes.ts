import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

// Whoever can run a landed-cost calculator (OPS_ROLES on the frontend) needs
// to be able to search for who the estimate is for — same reasoning as the
// LEAD_ROLES widening in leads.routes.ts. FINANCE included too since it can
// already read /v1/customers.
const SEARCH_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE'] as const;

export async function crmSearchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...SEARCH_ROLES));

  /**
   * Combined customer + lead search backing CustomerLeadPicker.tsx (the
   * "Company / Customer Name" field on every landed-cost calculator). Real
   * search happens here rather than the picker fetching every customer and
   * lead and filtering in the browser — doesn't scale, and can't be logged
   * meaningfully. Every non-empty query is recorded to crm_search_history,
   * the same "log every real search" precedent
   * comply_brela_search_history.sql already established for BRELA lookups.
   */
  fastify.get('/search', async (request: any, reply) => {
    const { q, source } = request.query as { q?: string; source?: string };
    const query = (q || '').trim();
    const tenantId = request.user.tenant_id;

    try {
      const results = await withTenant(tenantId, async (trx) => {
        let customerQuery = trx.selectFrom('customers')
          .select(['id', 'name', 'email', 'phone', 'phone_wa'])
          .where('tenant_id', '=', tenantId)
          .where('is_customer', '=', true);
        if (query) customerQuery = customerQuery.where('name', 'ilike', `%${query}%`);

        let leadQuery = trx.selectFrom('leads')
          .select(['id', 'company', 'contact_name', 'contact_email', 'contact_phone'])
          .where('tenant_id', '=', tenantId);
        if (query) {
          leadQuery = leadQuery.where((eb) => eb.or([
            eb('company', 'ilike', `%${query}%`),
            eb('contact_name', 'ilike', `%${query}%`),
          ]));
        }

        const [customers, leads] = await Promise.all([
          customerQuery.orderBy('name', 'asc').limit(15).execute(),
          leadQuery.orderBy('created_at', 'desc').limit(15).execute(),
        ]);

        return [
          ...customers.map(c => ({
            kind: 'customer' as const, id: c.id, name: c.name,
            email: c.email ?? undefined, phone: c.phone_wa || c.phone || undefined,
          })),
          ...leads.map(l => ({
            kind: 'lead' as const, id: l.id, name: l.company, contactName: l.contact_name,
            email: l.contact_email ?? undefined, phone: l.contact_phone ?? undefined,
          })),
        ];
      });

      // Best-effort — a logging failure must never take down the search
      // itself. Only real, deliberate queries are logged; the picker's own
      // "list everything" call on focus (empty q) isn't a search.
      if (query) {
        await withTenant(tenantId, (trx) =>
          trx.insertInto('crm_search_history').values({
            tenant_id: tenantId,
            searched_by: request.user.sub,
            query,
            result_count: results.length,
            source: source || null,
          }).execute()
        ).catch((err) => fastify.log.warn({ err: (err as Error).message }, '[CRM Search History] Failed to log search — not fatal to the search itself.'));
      }

      return results;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/search-history', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, (trx) =>
        trx.selectFrom('crm_search_history as h')
          .leftJoin('users as u', 'u.id', 'h.searched_by')
          .select(['h.id', 'h.searched_by', 'u.name as searched_by_name', 'h.query', 'h.result_count', 'h.source', 'h.created_at'])
          .where('h.tenant_id', '=', request.user.tenant_id)
          .orderBy('h.created_at', 'desc')
          .limit(200)
          .execute()
      );
      return rows.map(r => ({
        id: r.id, searched_by: r.searched_by, searched_by_name: r.searched_by_name,
        query: r.query, result_count: r.result_count, source: r.source,
        created_at: (r.created_at as Date).toISOString(),
      }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
