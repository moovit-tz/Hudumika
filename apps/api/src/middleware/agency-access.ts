import type { FastifyRequest, FastifyReply } from 'fastify';
import { dbPlatform } from '../db/client.js';

/**
 * AgencyHost M2 — gates every /v1/onsite/agency/clients/:clientTenantId/*
 * route. Deliberately not the same check as entitlement.ts's
 * agencyManagedOnsiteGrant(), which only confirms a client is managed by
 * *some* active agency — that's right for a client checking its own
 * inherited entitlement, but insufficient here: it wouldn't stop a
 * different agency from reaching a client they don't manage. This pins
 * both sides of the relationship to the caller's own tenant.
 */
export async function verifyAgencyClientAccess(request: FastifyRequest, reply: FastifyReply) {
  const { clientTenantId } = request.params as { clientTenantId: string };
  const rel = await dbPlatform.selectFrom('agency_managed_tenants')
    .select('id')
    .where('agency_tenant_id', '=', request.user.tenant_id)
    .where('client_tenant_id', '=', clientTenantId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  // 404, not 403 — doesn't confirm to a prober whether clientTenantId
  // exists at all.
  if (!rel) return reply.status(404).send({ error: 'Client not found' });
}
