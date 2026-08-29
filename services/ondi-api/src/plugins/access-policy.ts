import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export type PolicyAction = 'ALLOW' | 'FLAG' | 'BLOCK' | 'STEP_UP';

export interface PolicySignals {
  trustTier: 'LOW' | 'MEDIUM' | 'HIGH';
  isNewDevice: boolean;
  deviceTrusted: boolean;
  riskFactors: string[]; // subset of the risk engine's factor vocabulary (new_device|unusual_location|failed_attempts)
}

const TIER_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const ACTION_RANK: Record<PolicyAction, number> = { ALLOW: 0, FLAG: 1, STEP_UP: 2, BLOCK: 3 };

/**
 * Conditional/adaptive access — evaluates an org's AccessPolicy rows against
 * real login-time signals (durable TrustProfile tier, Device.isTrusted, the
 * risk engine's per-login factors). Every matching policy's action is
 * considered; the most restrictive one wins (BLOCK > STEP_UP > FLAG > ALLOW)
 * rather than "first match" — a looser rule can never override a stricter one
 * that also matched. A FLAG result writes a FraudAlert so it surfaces on the
 * org security dashboard even though it doesn't block the caller.
 */
export const accessPolicyPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('accessPolicy', {
    async evaluate(
      organizationIds: string[], userId: string, signals: PolicySignals, clientId?: string,
    ): Promise<{ action: PolicyAction; matchedPolicyId?: string }> {
      if (organizationIds.length === 0) return { action: 'ALLOW' };

      const policies = await app.prisma.accessPolicy.findMany({
        where: {
          organizationId: { in: organizationIds },
          isEnabled: true,
          ...(clientId ? { OR: [{ clientId: null }, { clientId }] } : { clientId: null }),
        },
        orderBy: { priority: 'asc' },
      });

      let best: PolicyAction = 'ALLOW';
      let matchedPolicyId: string | undefined;

      for (const p of policies) {
        const c = (p.conditions ?? {}) as {
          minTrustTier?: 'MEDIUM' | 'HIGH';
          requireTrustedDevice?: boolean;
          blockOnNewDevice?: boolean;
          matchRiskFactors?: string[];
        };

        const matches =
          (!!c.minTrustTier && TIER_RANK[signals.trustTier] < TIER_RANK[c.minTrustTier]) ||
          (!!c.requireTrustedDevice && !signals.deviceTrusted) ||
          (!!c.blockOnNewDevice && signals.isNewDevice) ||
          (Array.isArray(c.matchRiskFactors) && c.matchRiskFactors.some(f => signals.riskFactors.includes(f)));

        if (!matches) continue;

        const action = p.action as PolicyAction;
        if (ACTION_RANK[action] > ACTION_RANK[best]) {
          best = action;
          matchedPolicyId = p.id;
        }
      }

      if (best === 'FLAG' && matchedPolicyId) {
        const policy = policies.find(p => p.id === matchedPolicyId)!;
        await app.prisma.fraudAlert.create({
          data: {
            userId,
            type: 'ACCESS_POLICY_FLAGGED',
            severity: 'MEDIUM',
            description: `Conditional access policy "${policy.name}" flagged this login`,
            metadata: { policyId: policy.id, organizationId: policy.organizationId, signals } as any,
          },
        });
      }

      return { action: best, matchedPolicyId };
    },
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    accessPolicy: {
      evaluate: (
        organizationIds: string[], userId: string, signals: PolicySignals, clientId?: string,
      ) => Promise<{ action: PolicyAction; matchedPolicyId?: string }>;
    };
  }
}
