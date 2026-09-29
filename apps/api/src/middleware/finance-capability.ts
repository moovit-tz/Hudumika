import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FinanceCapabilityKey } from '@hudumika/types';
import { tenantHasEntitlement } from './entitlement.js';
import { tenantHasEnabledFinanceCapability } from '../services/finance-capability.service.js';

export function requireFinanceCapability(capability: FinanceCapabilityKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    if (request.user.role === 'SUPER_ADMIN') return;
    if (!(await tenantHasEntitlement(request.user.tenant_id, capability))) {
      return reply.status(403).send({ error: 'Your current workspace package does not include this Finance capability.', code: 'PLAN_UPGRADE_REQUIRED', capability });
    }
    if (!(await tenantHasEnabledFinanceCapability(request.user.tenant_id, capability))) {
      return reply.status(403).send({ error: 'This Finance capability is available but disabled for your workspace.', code: 'CAPABILITY_DISABLED', capability });
    }
  };
}
