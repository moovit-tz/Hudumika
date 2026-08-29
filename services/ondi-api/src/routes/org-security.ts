import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';
import { ensureDefaultPolicies } from './org-policies.js';
import { buildAuditCsv, buildAuditPdf } from '../lib/audit-export.js';

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function orgSecurityRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/security/overview
   * Every metric here is computed from real rows for the org's current
   * members — no fabricated alerts or coverage numbers.
   */
  app.get('/:id/security/overview', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    await ensureDefaultPolicies(app, id);

    const members = await app.prisma.userRole.findMany({
      where: { organizationId: id },
      select: { userId: true, user: { select: { firstName: true, lastName: true, ondi: true } } },
    });
    const memberIds = members.map(m => m.userId);
    const nameByUserId = new Map(members.map(m => [m.userId, [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.ondi]));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [mfaCount, staleSessions, openAlerts, resolvedAlerts, liveAlerts, securityPolicies] = await Promise.all([
      app.prisma.credential.count({ where: { userId: { in: memberIds }, type: 'MFA_APP', verified: true } }),
      app.prisma.authSession.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIds } },
        _max: { lastActivityAt: true },
      }),
      app.prisma.fraudAlert.count({ where: { userId: { in: memberIds }, status: 'OPEN' } }),
      app.prisma.fraudAlert.findMany({
        where: { userId: { in: memberIds }, status: 'RESOLVED', resolvedAt: { not: null }, createdAt: { gte: ninetyDaysAgo } },
        select: { createdAt: true, resolvedAt: true },
      }),
      app.prisma.fraudAlert.findMany({
        where: { userId: { in: memberIds } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      app.prisma.orgPolicy.findMany({ where: { organizationId: id, category: 'Security' }, orderBy: { createdAt: 'asc' } }),
    ]);

    const staleCount = memberIds.length
      ? staleSessions.filter(s => !s._max.lastActivityAt || s._max.lastActivityAt < thirtyDaysAgo).length
        + Math.max(0, memberIds.length - staleSessions.length) // members with no session at all
      : 0;

    const avgResponseMins = resolvedAlerts.length
      ? Math.round(resolvedAlerts.reduce((sum, a) => sum + (a.resolvedAt!.getTime() - a.createdAt.getTime()), 0) / resolvedAlerts.length / 60000)
      : null;

    return reply.send({
      metrics: {
        mfaCoveragePct: memberIds.length ? Math.round((mfaCount / memberIds.length) * 100) : 0,
        mfaEnrolled: mfaCount,
        totalMembers: memberIds.length,
        staleAccounts: staleCount,
        openAlerts,
        avgResponseMins,
      },
      alerts: liveAlerts.map(a => ({
        id:          a.id,
        title:       a.type,
        description: a.description,
        severity:    a.severity,
        status:      a.status,
        user:        nameByUserId.get(a.userId) || 'Unknown',
        time:        timeAgo(a.createdAt),
        createdAt:   a.createdAt,
      })),
      policies: securityPolicies.map(p => ({
        id: p.id, name: p.name, status: p.status, coverage: p.coverage,
      })),
    });
  });

  /**
   * GET /organizations/:id/security/settings
   */
  app.get('/:id/security/settings', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const settings = await app.prisma.orgSecuritySettings.upsert({
      where: { organizationId: id },
      create: { organizationId: id },
      update: {},
    });

    return reply.send({
      mfaRequired:        settings.mfaRequired,
      sessionTimeoutMins: settings.sessionTimeoutMins,
      ipAllowlist:        settings.ipAllowlist,
    });
  });

  /**
   * PATCH /organizations/:id/security/settings
   * Owner/Admin-only.
   */
  app.patch('/:id/security/settings', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { mfaRequired, sessionTimeoutMins, ipAllowlist } = req.body as {
      mfaRequired?: boolean; sessionTimeoutMins?: number; ipAllowlist?: string[];
    };
    const data: any = {};
    if (mfaRequired !== undefined) data.mfaRequired = mfaRequired;
    if (sessionTimeoutMins !== undefined) data.sessionTimeoutMins = sessionTimeoutMins;
    if (ipAllowlist !== undefined) data.ipAllowlist = ipAllowlist;

    await app.prisma.orgSecuritySettings.upsert({
      where: { organizationId: id },
      create: { organizationId: id, ...data },
      update: data,
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { securitySettings: data }, severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ updated: true });
  });

  // ─── Conditional / adaptive access policies ─────────────────────────────

  /**
   * GET /organizations/:id/security/access-policies
   */
  app.get('/:id/security/access-policies', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const policies = await app.prisma.accessPolicy.findMany({
      where: { organizationId: id },
      orderBy: { priority: 'asc' },
    });
    return reply.send({ policies });
  });

  /**
   * POST /organizations/:id/security/access-policies
   * Requires org:manage_security. Body: { name, priority?, clientId?, conditions, action }
   * conditions: { minTrustTier?, requireTrustedDevice?, blockOnNewDevice?, matchRiskFactors? }
   * action: 'FLAG' | 'BLOCK' | 'STEP_UP'
   */
  app.post('/:id/security/access-policies', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, priority, clientId, conditions, action } = req.body as {
      name?: string; priority?: number; clientId?: string; conditions?: Record<string, unknown>; action?: string;
    };
    if (!name?.trim() || !conditions || typeof conditions !== 'object')
      return reply.code(400).send({ error: 'missing_fields' });
    if (action !== 'FLAG' && action !== 'BLOCK' && action !== 'STEP_UP')
      return reply.code(400).send({ error: 'invalid_action' });

    if (clientId) {
      const client = await app.prisma.oAuthClient.findUnique({ where: { clientId } });
      if (!client) return reply.code(400).send({ error: 'invalid_client_id' });
    }

    const policy = await app.prisma.accessPolicy.create({
      data: {
        organizationId: id,
        name: name.trim(),
        priority: priority ?? 100,
        clientId: clientId || null,
        conditions: conditions as any,
        action: action as any,
      },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'access_policy_created', policyId: policy.id, name: policy.name }, severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send(policy);
  });

  /**
   * PATCH /organizations/:id/security/access-policies/:policyId
   */
  app.patch('/:id/security/access-policies/:policyId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, policyId } = req.params as { id: string; policyId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const policy = await app.prisma.accessPolicy.findFirst({ where: { id: policyId, organizationId: id } });
    if (!policy) return reply.code(404).send({ error: 'policy_not_found' });

    const { name, priority, clientId, conditions, action, isEnabled } = req.body as {
      name?: string; priority?: number; clientId?: string | null; conditions?: Record<string, unknown>; action?: string; isEnabled?: boolean;
    };
    const data: any = {};
    if (name !== undefined) data.name = name.trim();
    if (priority !== undefined) data.priority = priority;
    if (clientId !== undefined) data.clientId = clientId || null;
    if (conditions !== undefined) data.conditions = conditions;
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    if (action !== undefined) {
      if (action !== 'FLAG' && action !== 'BLOCK' && action !== 'STEP_UP')
        return reply.code(400).send({ error: 'invalid_action' });
      data.action = action;
    }
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'no_fields_to_update' });

    await app.prisma.accessPolicy.update({ where: { id: policyId }, data });
    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/security/access-policies/:policyId
   */
  app.delete('/:id/security/access-policies/:policyId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, policyId } = req.params as { id: string; policyId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const policy = await app.prisma.accessPolicy.findFirst({ where: { id: policyId, organizationId: id } });
    if (!policy) return reply.code(404).send({ error: 'policy_not_found' });

    await app.prisma.accessPolicy.delete({ where: { id: policyId } });
    return reply.send({ removed: true });
  });

  // ─── SIEM / webhook export ────────────────────────────────────────────────

  /**
   * GET /organizations/:id/security/siem
   * Secrets are never returned — only a masked hint.
   */
  app.get('/:id/security/siem', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const configs = await app.prisma.orgWebhookConfig.findMany({ where: { organizationId: id } });
    return reply.send({
      configs: configs.map(c => ({
        id: c.id, url: c.url, eventTypes: c.eventTypes, isEnabled: c.isEnabled,
        lastDeliveryAt: c.lastDeliveryAt, lastDeliveryStatus: c.lastDeliveryStatus,
        secretHint: `••••${c.secret.slice(-4)}`,
      })),
    });
  });

  /**
   * POST /organizations/:id/security/siem
   * Body: { url, eventTypes?: string[] }. Generates the HMAC secret server-side.
   */
  app.post('/:id/security/siem', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { url, eventTypes } = req.body as { url?: string; eventTypes?: string[] };
    if (!url?.trim()) return reply.code(400).send({ error: 'missing_fields' });
    try { new URL(url); } catch { return reply.code(400).send({ error: 'invalid_url' }); }

    const secret = crypto.randomBytes(32).toString('hex');
    const config = await app.prisma.orgWebhookConfig.create({
      data: { organizationId: id, url: url.trim(), secret, eventTypes: eventTypes ?? [] },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'siem_webhook_registered', configId: config.id, url: config.url }, severity: 'INFO', isRegulatory: false,
    });

    // Secret is only ever returned once, at creation time.
    return reply.code(201).send({ id: config.id, url: config.url, eventTypes: config.eventTypes, secret });
  });

  /**
   * PATCH /organizations/:id/security/siem/:configId
   */
  app.patch('/:id/security/siem/:configId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, configId } = req.params as { id: string; configId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const config = await app.prisma.orgWebhookConfig.findFirst({ where: { id: configId, organizationId: id } });
    if (!config) return reply.code(404).send({ error: 'config_not_found' });

    const { url, eventTypes, isEnabled } = req.body as { url?: string; eventTypes?: string[]; isEnabled?: boolean };
    const data: any = {};
    if (url !== undefined) {
      try { new URL(url); } catch { return reply.code(400).send({ error: 'invalid_url' }); }
      data.url = url.trim();
    }
    if (eventTypes !== undefined) data.eventTypes = eventTypes;
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'no_fields_to_update' });

    await app.prisma.orgWebhookConfig.update({ where: { id: configId }, data });
    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/security/siem/:configId
   */
  app.delete('/:id/security/siem/:configId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, configId } = req.params as { id: string; configId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const config = await app.prisma.orgWebhookConfig.findFirst({ where: { id: configId, organizationId: id } });
    if (!config) return reply.code(404).send({ error: 'config_not_found' });

    await app.prisma.orgWebhookConfig.delete({ where: { id: configId } });
    return reply.send({ removed: true });
  });

  /**
   * POST /organizations/:id/security/siem/:configId/test
   * Sends a synthetic event through the exact same delivery worker/signature
   * path as a real audit event — lets an admin verify their endpoint + secret
   * work before relying on it.
   */
  app.post('/:id/security/siem/:configId/test', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, configId } = req.params as { id: string; configId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const config = await app.prisma.orgWebhookConfig.findFirst({ where: { id: configId, organizationId: id } });
    if (!config) return reply.code(404).send({ error: 'config_not_found' });

    await app.queues.webhookDelivery.add('deliver', {
      configId: config.id, url: config.url, secret: config.secret,
      payload: {
        id: 'test', entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
        performedBy: userId, metadata: { test: true }, severity: 'INFO', timestamp: new Date().toISOString(),
      },
    }, { attempts: 1 });

    return reply.send({ queued: true });
  });

  /**
   * GET /organizations/:id/audit/export?format=csv|pdf
   * Org-scoped equivalent of the personal-only GET /audit/export — every
   * AuditLog row this org's events were tagged with (organizationId set by
   * the writing route, see plugins/audit.ts).
   */
  app.get('/:id/audit/export', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const format = (req.query.format as string) || 'csv';
    if (format !== 'csv' && format !== 'pdf')
      return reply.code(400).send({ error: 'invalid_format' });

    const logs = await app.prisma.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { timestamp: 'desc' },
    });

    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="ondi-org-audit-report.csv"');
      return reply.send(buildAuditCsv(logs));
    }

    const pdfBuffer = await buildAuditPdf(logs, 'Ondi Organization Audit Report');
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="ondi-org-audit-report.pdf"');
    return reply.send(pdfBuffer);
  });

  // ─── Authentik provisioning visibility ────────────────────────────────────
  // SCIM provisioning (plugins/authentik.ts) already runs on real lifecycle
  // events — invite-accept (organizations.ts), account deletion (auth.ts),
  // access-review revocation and offboarding automation — but none of it was
  // visible to an org admin. Rather than a live per-member Authentik API call
  // on every page load (slow, and needless load on Authentik itself), this
  // derives status from this org's own audit trail, since every one of those
  // call sites already writes an ADMIN_UPDATE entry tagged
  // authentik_provision/authentik_deprovision.

  /**
   * GET /organizations/:id/security/authentik-status
   */
  app.get('/:id/security/authentik-status', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const [members, events] = await Promise.all([
      app.prisma.userRole.findMany({
        where: { organizationId: id },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true } } },
      }),
      app.prisma.auditLog.findMany({
        where: { organizationId: id, action: 'ADMIN_UPDATE' },
        orderBy: { timestamp: 'desc' },
        take: 500,
      }),
    ]);

    // Most-recent-first scan, first hit per member wins — resolves to
    // whichever of provision/deprovision actually happened last for them.
    const latestByMember = new Map<string, { status: 'provisioned' | 'deprovisioned'; at: Date }>();
    for (const log of events) {
      const meta = log.metadata as any;
      const memberId: string | undefined = meta?.userId || meta?.memberId;
      if (!memberId || latestByMember.has(memberId)) continue;
      if (meta.action === 'authentik_provision') {
        latestByMember.set(memberId, { status: 'provisioned', at: log.timestamp });
      } else if (meta.action === 'authentik_deprovision') {
        latestByMember.set(memberId, { status: 'deprovisioned', at: log.timestamp });
      }
    }

    return reply.send({
      connected: app.authentik.isConnected,
      members: members.map(m => {
        const latest = latestByMember.get(m.user.id);
        return {
          userId: m.user.id,
          name: [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email || m.user.phoneNumber,
          status: latest?.status ?? 'never_provisioned',
          lastEventAt: latest?.at ?? null,
        };
      }),
    });
  });

  /**
   * POST /organizations/:id/security/authentik-status/:memberId/reprovision
   * Manual re-run of the same call invite-accept already makes automatically
   * — for a member whose provisioning failed, drifted, or predates this
   * being wired up.
   */
  app.post('/:id/security/authentik-status/:memberId/reprovision', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, memberId } = req.params as { id: string; memberId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_security')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const membership = await app.prisma.userRole.findFirst({
      where: { userId: memberId, organizationId: id },
      include: { user: true },
    });
    if (!membership) return reply.code(404).send({ error: 'member_not_found' });

    const provisioned = await app.authentik.provisionUser(
      {
        id: membership.user.id,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
        phoneNumber: membership.user.phoneNumber,
      },
      id,
    );

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId,
      metadata: { action: 'authentik_provision', userId: memberId, authentikUserId: provisioned?.id ?? null, manual: true },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ provisioned: !!provisioned, connected: app.authentik.isConnected });
  });
}
