import { requireAnyEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

// CRM link — surfaces a customer's bonded-warehouse lots on their CRM
// record. Minimal, read-only, purpose-built (not a proxy to seal.routes.ts's
// full GET /lots, which stays 'seal'-only) so a CRM-only user can see this
// without needing SEAL access — same reasoning as lots-for-declaration and
// vehicles-for-assignment.
export async function sealCrmLinkRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['seal', 'crm']));

  fastify.get('/lots-for-customer', async (request: any, reply) => {
    try {
      const { owner_id } = request.query as { owner_id?: string };
      if (!owner_id) return reply.status(400).send({ error: 'owner_id is required' });
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_lots')
          .select([
            'id', 'description', 'customs_status', 'qty_on_hand', 'uom', 'entry_reference',
            'duty_at_risk', 'tax_at_risk', 'currency', 'warehoused_on', 'expires_on',
          ])
          .where('owner_id', '=', owner_id).where('tenant_id', '=', request.user.tenant_id)
          .orderBy('created_at', 'desc')
          .execute()
      );
      return rows.map(r => ({
        id: r.id, description: r.description, customsStatus: r.customs_status,
        qtyOnHand: Number(r.qty_on_hand), uom: r.uom, entryReference: r.entry_reference,
        dutyAtRisk: Number(r.duty_at_risk), taxAtRisk: Number(r.tax_at_risk), currency: r.currency,
        warehousedOn: r.warehoused_on, expiresOn: r.expires_on,
      }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
