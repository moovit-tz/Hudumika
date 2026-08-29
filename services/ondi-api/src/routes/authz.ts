/**
 * routes/authz.ts
 *
 * Ondi Policy Engine — Attribute-Based Access Control (ABAC).
 *
 * A Policy defines the minimum bar for a (resource, action) pair:
 *   - minTrustScore        — e.g. 600
 *   - minVerificationLevel — e.g. L2_GOV_VERIFIED
 *   - requireTrustedDevice — if true, token's device must be trusted
 *
 * POST /authz/check  ← called by every Hudumika service before sensitive ops
 * Returns: ALLOW | DENY | STEP_UP
 *
 * STEP_UP is returned when the user would be allowed after completing a step-up
 * challenge (their trust score / verification level is close but not yet met).
 */

import { FastifyInstance } from 'fastify';
import { JWT_SECRET, JWT_ISSUER, ADMIN_KEY } from '../lib/env.js';

const LEVEL_ORDER = ['L0_UNVERIFIED', 'L1_BASIC_KYC', 'L2_GOV_VERIFIED', 'L3_FINANCIAL_VERIFIED'];

function levelIndex(level: string) {
  return LEVEL_ORDER.indexOf(level);
}

async function extractUserId(req: any, reply: any): Promise<string | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  try {
    const jwt = await import('jsonwebtoken');
    const payload: any = jwt.default.verify(
      authHeader.slice(7),
      JWT_SECRET,
      { issuer: JWT_ISSUER },
    );
    return payload.sub as string;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

export async function authzRoutes(app: FastifyInstance) {

  /**
   * POST /authz/check
   * Ask the policy engine: can this user perform action on resource?
   * Body: { resource, action, deviceId? }
   * Auth: Bearer token (the user's access token)
   */
  app.post('/check', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { resource, action, deviceId } = req.body as {
      resource?: string;
      action?:   string;
      deviceId?: string;
    };
    if (!resource || !action)
      return reply.code(400).send({ error: 'resource_and_action_required' });

    // Look up the policy for this (resource, action)
    const policy = await app.prisma.policy.findUnique({
      where: { resource_action: { resource, action } },
    });

    // No policy = open access
    if (!policy) return reply.send({ decision: 'ALLOW', reason: 'no_policy_defined' });

    const user = await app.prisma.user.findUnique({
      where:   { id: userId },
      include: { trustProfile: true, devices: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const trustScore      = user.trustProfile?.currentScore ?? 300;
    const verificationLvl = user.verificationLevel;

    // Check trusted device requirement
    if (policy.requireTrustedDevice) {
      const device = deviceId
        ? user.devices.find(d => d.id === deviceId || d.deviceId === deviceId)
        : user.devices.find(d => d.isTrusted);

      if (!device?.isTrusted) {
        await app.audit.write({
          entityType: 'USER', entityId: userId,
          action: 'ACCESS_DENIED', category: 'ACCESS', performedBy: userId,
          metadata: { resource, action, reason: 'untrusted_device' },
          severity: 'WARNING', isRegulatory: false,
        });
        return reply.send({
          decision: 'DENY',
          reason:   'trusted_device_required',
          policy:   { resource, action },
        });
      }
    }

    // Check verification level
    if (policy.minVerificationLevel) {
      const required = levelIndex(policy.minVerificationLevel);
      const current  = levelIndex(verificationLvl);

      if (current < required) {
        // STEP_UP if only one level below
        const decision = required - current === 1 ? 'STEP_UP' : 'DENY';
        await app.audit.write({
          entityType: 'USER', entityId: userId,
          action: decision === 'STEP_UP' ? 'STEP_UP_TRIGGERED' : 'ACCESS_DENIED',
          category: 'ACCESS', performedBy: userId,
          metadata: { resource, action, required: policy.minVerificationLevel, current: verificationLvl },
          severity: decision === 'DENY' ? 'WARNING' : 'INFO', isRegulatory: false,
        });
        return reply.send({
          decision,
          reason:   `requires_${policy.minVerificationLevel.toLowerCase()}`,
          policy:   { resource, action, minVerificationLevel: policy.minVerificationLevel },
        });
      }
    }

    // Check trust score
    if (policy.minTrustScore && trustScore < policy.minTrustScore) {
      const gap      = policy.minTrustScore - trustScore;
      const decision = gap <= 50 ? 'STEP_UP' : 'DENY';
      await app.audit.write({
        entityType: 'USER', entityId: userId,
        action: decision === 'STEP_UP' ? 'STEP_UP_TRIGGERED' : 'ACCESS_DENIED',
        category: 'ACCESS', performedBy: userId,
        metadata: { resource, action, required: policy.minTrustScore, current: trustScore, gap },
        severity: decision === 'DENY' ? 'WARNING' : 'INFO', isRegulatory: false,
      });
      return reply.send({
        decision,
        reason:   `trust_score_below_${policy.minTrustScore}`,
        policy:   { resource, action, minTrustScore: policy.minTrustScore, currentScore: trustScore },
      });
    }

    // All checks passed
    await app.audit.write({
      entityType: 'USER', entityId: userId,
      action: 'ACCESS_GRANTED', category: 'ACCESS', performedBy: userId,
      metadata: { resource, action },
      severity: 'INFO', isRegulatory: false,
    });
    return reply.send({ decision: 'ALLOW', policy: { resource, action } });
  });

  // ─── Policy Management ───────────────────────────────────────────────────────

  /**
   * POST /authz/policies
   * Create or update a policy for a (resource, action) pair.
   * Body: { resource, action, minTrustScore?, minVerificationLevel?, requireTrustedDevice? }
   */
  app.post('/policies', async (req: any, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== (ADMIN_KEY))
      return reply.code(403).send({ error: 'forbidden' });

    const { name, resource, action, minTrustScore, minVerificationLevel, requireTrustedDevice = false } = req.body;
    if (!resource || !action) return reply.code(400).send({ error: 'resource_and_action_required' });
    const policyName = name || `${resource}:${action}`;

    const policy = await app.prisma.policy.upsert({
      where:  { resource_action: { resource, action } },
      create: { name: policyName, resource, action, minTrustScore, minVerificationLevel, requireTrustedDevice },
      update: { minTrustScore, minVerificationLevel, requireTrustedDevice },
    });

    return reply.code(201).send(policy);
  });

  /**
   * GET /authz/policies
   * List all defined policies.
   */
  app.get('/policies', async (_req, reply) => {
    const policies = await app.prisma.policy.findMany({ orderBy: { resource: 'asc' } });
    return reply.send({ policies });
  });

  /**
   * DELETE /authz/policies/:id
   * Remove a policy.
   */
  app.delete('/policies/:id', async (req: any, reply) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== (ADMIN_KEY))
      return reply.code(403).send({ error: 'forbidden' });

    await app.prisma.policy.delete({ where: { id: req.params.id } });
    return reply.send({ deleted: true });
  });
}
