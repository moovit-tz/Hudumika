import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';

const DEFAULT_FLOWS: { name: string; trigger: 'ONBOARDING' | 'OFFBOARDING' | 'ROLE_CHANGE'; steps: string[] }[] = [
  { name: 'Employee Onboarding',  trigger: 'ONBOARDING',  steps: ['Send Ondi invite', 'Assign role', 'Log activity'] },
  { name: 'Employee Offboarding', trigger: 'OFFBOARDING', steps: ['Revoke active sessions', 'Remove org membership', 'Log activity'] },
  { name: 'Role Promotion',       trigger: 'ROLE_CHANGE', steps: ['Update member role', 'Log activity'] },
];

/** Idempotent — seeds the three built-in flows for an org the first time they're fetched. */
async function ensureDefaultFlows(app: FastifyInstance, organizationId: string) {
  const existing = await app.prisma.automationFlow.findMany({ where: { organizationId } });
  if (existing.length > 0) return existing;
  await app.prisma.$transaction(
    DEFAULT_FLOWS.map(f => app.prisma.automationFlow.create({
      data: { organizationId, name: f.name, trigger: f.trigger, steps: f.steps },
    })),
  );
  return app.prisma.automationFlow.findMany({ where: { organizationId } });
}

export async function orgAutomationRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/automation/flows
   */
  app.get('/:id/automation/flows', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    await ensureDefaultFlows(app, id);

    const flows = await app.prisma.automationFlow.findMany({
      where: { organizationId: id },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });

    const runCounts = await app.prisma.automationRun.groupBy({
      by: ['flowId'],
      where: { flow: { organizationId: id } },
      _count: { _all: true },
    });
    const countByFlow = new Map(runCounts.map(r => [r.flowId, r._count._all]));

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [runsThisMonth, completedRuns] = await Promise.all([
      app.prisma.automationRun.count({ where: { flow: { organizationId: id }, startedAt: { gte: monthAgo } } }),
      app.prisma.automationRun.findMany({
        where: { flow: { organizationId: id }, status: 'COMPLETED', durationMs: { not: null } },
        select: { durationMs: true },
      }),
    ]);
    const avgDurationMs = completedRuns.length
      ? Math.round(completedRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / completedRuns.length)
      : 0;

    return reply.send({
      stats: {
        activeFlows:   flows.filter(f => f.status === 'ACTIVE').length,
        pausedFlows:   flows.filter(f => f.status === 'PAUSED').length,
        runsThisMonth,
        avgDurationMs,
      },
      flows: flows.map(f => ({
        id:      f.id,
        name:    f.name,
        trigger: f.trigger,
        steps:   f.steps,
        status:  f.status,
        runs:    countByFlow.get(f.id) || 0,
        lastRunAt: f.runs[0]?.startedAt ?? null,
      })),
    });
  });

  /**
   * PATCH /organizations/:id/automation/flows/:flowId
   * Owner/Admin-only. Body: { status: 'ACTIVE' | 'PAUSED' }
   */
  app.patch('/:id/automation/flows/:flowId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, flowId } = req.params as { id: string; flowId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_automation')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { status } = req.body as { status?: string };
    if (status !== 'ACTIVE' && status !== 'PAUSED')
      return reply.code(400).send({ error: 'invalid_status' });

    const flow = await app.prisma.automationFlow.findFirst({ where: { id: flowId, organizationId: id } });
    if (!flow) return reply.code(404).send({ error: 'flow_not_found' });

    await app.prisma.automationFlow.update({ where: { id: flowId }, data: { status } });
    return reply.send({ updated: true });
  });

  /**
   * POST /organizations/:id/automation/flows/:flowId/run
   * Owner/Admin-only. Actually performs the flow's action — no fake progress
   * bar. Body shape depends on the flow's trigger:
   *   ONBOARDING:  { ondi, roleName }
   *   OFFBOARDING: { memberId }
   *   ROLE_CHANGE: { memberId, roleName }
   */
  app.post('/:id/automation/flows/:flowId/run', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, flowId } = req.params as { id: string; flowId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_automation')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const flow = await app.prisma.automationFlow.findFirst({ where: { id: flowId, organizationId: id } });
    if (!flow) return reply.code(404).send({ error: 'flow_not_found' });
    if (flow.status !== 'ACTIVE') return reply.code(409).send({ error: 'flow_paused' });

    const startedAt = new Date();
    let subjectLabel = '';
    let subjectUserId: string | undefined;
    let status: 'COMPLETED' | 'FAILED' = 'COMPLETED';
    let error: string | undefined;

    try {
      if (flow.trigger === 'ONBOARDING') {
        const { ondi, roleName } = req.body as { ondi?: string; roleName?: string };
        if (!ondi || !roleName) throw new Error('missing_fields');
        subjectLabel = ondi;

        const invitedUser = await app.prisma.user.findUnique({ where: { ondi } });
        if (!invitedUser) throw new Error('user_not_found');
        subjectUserId = invitedUser.id;

        const existingMembership = await app.prisma.userRole.findFirst({ where: { userId: invitedUser.id, organizationId: id } });
        if (existingMembership) throw new Error('already_a_member');

        const role = await app.prisma.role.findFirst({ where: { name: roleName, OR: [{ organizationId: null }, { organizationId: id }] } });
        if (!role) throw new Error('invalid_role');

        const existingInvite = await app.prisma.organizationInvite.findFirst({
          where: { organizationId: id, invitedUserId: invitedUser.id, acceptedAt: null, declinedAt: null },
        });
        if (existingInvite) throw new Error('invite_already_pending');

        await app.prisma.organizationInvite.create({
          data: { organizationId: id, invitedUserId: invitedUser.id, invitedBy: userId, roleId: role.id },
        });
        await app.audit.write({
          entityType: 'ORG', entityId: id, action: 'TEAM_INVITE_SENT', category: 'IDENTITY',
          performedBy: userId, metadata: { invitedUserId: invitedUser.id, roleName, viaFlow: flow.name }, severity: 'INFO', isRegulatory: false,
        });

      } else if (flow.trigger === 'OFFBOARDING') {
        const { memberId } = req.body as { memberId?: string };
        if (!memberId) throw new Error('missing_fields');

        const membership = await app.prisma.userRole.findFirst({
          where: { userId: memberId, organizationId: id },
          include: { role: true, user: { select: { firstName: true, lastName: true, ondi: true, email: true } } },
        });
        if (!membership) throw new Error('member_not_found');
        subjectUserId = memberId;
        subjectLabel = [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.ondi;

        if (membership.role.name === 'Owner') {
          const ownerRole = await app.prisma.role.findFirst({ where: { organizationId: null, name: 'Owner' } });
          const ownerCount = await app.prisma.userRole.count({ where: { organizationId: id, roleId: ownerRole!.id } });
          if (ownerCount <= 1) throw new Error('cannot_remove_last_owner');
        }

        await app.prisma.authSession.updateMany({
          where: { userId: memberId, expiresAt: { gt: new Date() } },
          data: { expiresAt: new Date() },
        });
        await app.prisma.userRole.delete({ where: { id: membership.id } });

        await app.audit.write({
          entityType: 'ORG', entityId: id, action: 'MEMBER_REMOVED', category: 'IDENTITY',
          performedBy: userId, metadata: { memberId, viaFlow: flow.name }, severity: 'WARNING', isRegulatory: false,
        });

        // Real JML deprovisioning — offboarding used to stop at Ondi's own
        // border; this reaches the connected-app side too. Same lookup-by-
        // email/employeeId pattern plugins/trust-engine.ts already uses,
        // since no authentikUserId is stored anywhere. Failure here doesn't
        // roll back the Ondi-side removal above — that's already committed
        // and is the source of truth regardless of Authentik reachability.
        try {
          const userPk = await app.authentik.getUserPkByEmailOrEmployeeId(membership.user.email ?? undefined, memberId);
          if (userPk) {
            await app.authentik.revokeSessions(membership.user.email || membership.user.ondi, userPk);
            await app.authentik.deprovisionUser(userPk);
            await app.audit.write({
              entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
              performedBy: 'system:jml', metadata: { action: 'authentik_deprovision', memberId, authentikUserId: userPk },
              severity: 'INFO', isRegulatory: false,
            });
          }
        } catch (authErr) {
          app.log.error(authErr, 'Failed to deprovision member from Authentik during offboarding');
        }

      } else {
        const { memberId, roleName } = req.body as { memberId?: string; roleName?: string };
        if (!memberId || !roleName) throw new Error('missing_fields');

        const membership = await app.prisma.userRole.findFirst({
          where: { userId: memberId, organizationId: id },
          include: { role: true, user: { select: { firstName: true, lastName: true, ondi: true } } },
        });
        if (!membership) throw new Error('member_not_found');
        subjectUserId = memberId;
        subjectLabel = [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.ondi;

        const role = await app.prisma.role.findFirst({ where: { name: roleName, OR: [{ organizationId: null }, { organizationId: id }] } });
        if (!role) throw new Error('invalid_role');

        if (membership.role.name === 'Owner' && roleName !== 'Owner') {
          const ownerRole = await app.prisma.role.findFirst({ where: { organizationId: null, name: 'Owner' } });
          const ownerCount = await app.prisma.userRole.count({ where: { organizationId: id, roleId: ownerRole!.id } });
          if (ownerCount <= 1) throw new Error('cannot_remove_last_owner');
        }

        await app.prisma.userRole.update({ where: { id: membership.id }, data: { roleId: role.id } });

        await app.audit.write({
          entityType: 'ORG', entityId: id, action: 'ROLE_CHANGED', category: 'IDENTITY',
          performedBy: userId, metadata: { memberId, roleName, viaFlow: flow.name }, severity: 'INFO', isRegulatory: false,
        });
      }
    } catch (e: any) {
      status = 'FAILED';
      error = e?.message || 'unknown_error';
    }

    const finishedAt = new Date();
    const run = await app.prisma.automationRun.create({
      data: {
        flowId,
        subjectLabel: subjectLabel || 'Unknown',
        subjectUserId,
        status,
        error,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'AUTOMATION_RUN_TRIGGERED', category: 'ADMIN',
      performedBy: userId, metadata: { flowId, runId: run.id, status }, severity: status === 'FAILED' ? 'WARNING' : 'INFO', isRegulatory: false,
    });

    if (status === 'FAILED') return reply.code(422).send({ id: run.id, status, error });
    return reply.code(201).send({ id: run.id, status });
  });

  /**
   * GET /organizations/:id/automation/runs
   */
  app.get('/:id/automation/runs', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const runs = await app.prisma.automationRun.findMany({
      where: { flow: { organizationId: id } },
      include: { flow: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    return reply.send({
      runs: runs.map(r => ({
        id:         r.id,
        flow:       r.flow.name,
        subject:    r.subjectLabel,
        status:     r.status,
        durationMs: r.durationMs,
        error:      r.error,
        startedAt:  r.startedAt,
      })),
    });
  });
}
