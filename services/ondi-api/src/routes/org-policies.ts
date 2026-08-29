import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';

const DEFAULT_POLICIES = [
  { name: 'Multi-Factor Authentication', category: 'Security',   description: 'MFA required for all admin and privileged user accounts.' },
  { name: 'Password Policy',             category: 'Security',   description: 'Minimum length, complexity, and rotation requirements.' },
  { name: 'Data Retention',              category: 'Data',       description: 'How long user data is retained and when it is purged.' },
  { name: 'Acceptable Use Policy',       category: 'Governance', description: 'Guidelines for acceptable use of company systems and data.' },
];

/** Idempotent — seeds honest DRAFT/0% rows so admins have a starting point, not fabricated "Enforced" status. */
export async function ensureDefaultPolicies(app: FastifyInstance, organizationId: string) {
  const existing = await app.prisma.orgPolicy.findMany({ where: { organizationId } });
  if (existing.length > 0) return;
  await app.prisma.$transaction(
    DEFAULT_POLICIES.map(p => app.prisma.orgPolicy.create({
      data: { organizationId, name: p.name, category: p.category, description: p.description },
    })),
  );
}

export async function orgPoliciesRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/policies?category=Security
   */
  app.get('/:id/policies', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    await ensureDefaultPolicies(app, id);

    const { category } = req.query as { category?: string };
    const policies = await app.prisma.orgPolicy.findMany({
      where: { organizationId: id, ...(category && category !== 'All' ? { category } : {}) },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      summary: {
        enforced: policies.filter(p => p.status === 'ENFORCED').length,
        partial:  policies.filter(p => p.status === 'PARTIAL').length,
        draft:    policies.filter(p => p.status === 'DRAFT').length,
      },
      policies: policies.map(p => ({
        id:          p.id,
        name:        p.name,
        description: p.description,
        category:    p.category,
        status:      p.status,
        coverage:    p.coverage,
        updatedAt:   p.updatedAt,
      })),
    });
  });

  /**
   * POST /organizations/:id/policies
   * Owner/Admin-only. Body: { name, description?, category }
   */
  app.post('/:id/policies', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_policies')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, description, category } = req.body as { name?: string; description?: string; category?: string };
    if (!name || !category) return reply.code(400).send({ error: 'missing_fields' });

    const policy = await app.prisma.orgPolicy.create({
      data: { organizationId: id, name, description, category },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { policyId: policy.id, name, action: 'created' }, severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send({ id: policy.id });
  });

  /**
   * PATCH /organizations/:id/policies/:policyId
   * Owner/Admin-only. Body: { status?, coverage?, description? }
   */
  app.patch('/:id/policies/:policyId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, policyId } = req.params as { id: string; policyId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_policies')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const policy = await app.prisma.orgPolicy.findFirst({ where: { id: policyId, organizationId: id } });
    if (!policy) return reply.code(404).send({ error: 'policy_not_found' });

    const { status, coverage, description } = req.body as { status?: string; coverage?: number; description?: string };
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (coverage !== undefined) data.coverage = Math.max(0, Math.min(100, coverage));
    if (description !== undefined) data.description = description;

    await app.prisma.orgPolicy.update({ where: { id: policyId }, data });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { policyId, ...data }, severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/policies/:policyId
   * Owner/Admin-only.
   */
  app.delete('/:id/policies/:policyId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, policyId } = req.params as { id: string; policyId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_policies')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const policy = await app.prisma.orgPolicy.findFirst({ where: { id: policyId, organizationId: id } });
    if (!policy) return reply.code(404).send({ error: 'policy_not_found' });

    await app.prisma.orgPolicy.delete({ where: { id: policyId } });
    return reply.send({ removed: true });
  });
}
