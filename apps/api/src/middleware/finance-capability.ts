import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FinanceCapabilityKey } from '@hudumika/types';
import { tenantHasEntitlement } from './entitlement.js';
import { tenantHasEnabledFinanceCapability } from '../services/finance-capability.service.js';

export function requireFinanceCapability(capability: FinanceCapabilityKey, options: { preserveReadAccess?: boolean } = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    if (request.apiKeyScopes && !request.apiKeyScopes.includes(capability)) {
      return reply.status(403).send({
        error: `This API key is not scoped for ${capability}.`,
        code: 'SCOPE_INSUFFICIENT',
        capability,
      });
    }
    if (options.preserveReadAccess && (request.method === 'GET' || request.method === 'HEAD')) return;
    if (!(await tenantHasEntitlement(request.user.tenant_id, capability))) {
      return reply.status(403).send({ error: 'Your current workspace package does not include this Finance capability.', code: 'PLAN_UPGRADE_REQUIRED', capability });
    }
    if (!(await tenantHasEnabledFinanceCapability(request.user.tenant_id, capability))) {
      return reply.status(403).send({ error: 'This Finance capability is read-only or disabled for this workspace. Existing records are preserved, but new changes require the capability to be enabled.', code: 'CAPABILITY_READ_ONLY', capability });
    }
  };
}
