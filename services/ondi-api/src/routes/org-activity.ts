import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, assertOrgSecurityPolicy } from '../lib/org-auth.js';

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const UI_TYPE: Record<string, string> = {
  AUTH: 'Auth', ACCESS: 'Access', ADMIN: 'Config', CONSENT: 'Config', CREDIT: 'Config',
  IDENTITY: 'Lifecycle', FRAUD: 'Access',
};

function summarize(action: string, metadata: any): string {
  const m = metadata || {};
  switch (action) {
    case 'ORG_CREATED':             return 'Organization created';
    case 'TEAM_INVITE_SENT':        return `Invite sent (role: ${m.roleName || 'Member'})`;
    case 'TEAM_MEMBER_JOINED':      return 'New member joined the organization';
    case 'ROLE_CHANGED':            return `Member role changed to ${m.roleName || '—'}`;
    case 'MEMBER_REMOVED':          return 'Member removed from the organization';
    case 'DIRECTOR_ADDED':          return `Director added${m.name ? `: ${m.name}` : ''}`;
    case 'DIRECTOR_VERIFIED':       return 'Director verified their identity';
    case 'KYB_SUBMITTED':           return 'KYB verification submitted';
    case 'KYB_VERIFIED':            return 'KYB verification approved';
    case 'KYB_REJECTED':            return 'KYB verification rejected';
    case 'ACCESS_REQUESTED':        return `Access requested: ${m.resource || '—'}`;
    case 'ACCESS_GRANTED':          return `Access granted: ${m.resource || '—'}`;
    case 'ACCESS_DENIED':           return `Access denied: ${m.resource || '—'}`;
    case 'AUTOMATION_RUN_TRIGGERED': return `Automation flow run ${m.status === 'FAILED' ? 'failed' : 'completed'}`;
    case 'ADMIN_UPDATE':            return 'Settings updated';
    default:                        return action.replace(/_/g, ' ').toLowerCase();
  }
}

async function resolveActors(app: FastifyInstance, performedByIds: string[]): Promise<Map<string, string>> {
  const uuidLike = performedByIds.filter(v => /^[0-9a-f-]{36}$/i.test(v));
  if (uuidLike.length === 0) return new Map();
  const users = await app.prisma.user.findMany({
    where: { id: { in: uuidLike } },
    select: { id: true, firstName: true, lastName: true, ondi: true },
  });
  return new Map(users.map(u => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.ondi]));
}

/**
 * Org-scoped audit trail — unlike GET /audit/logs (an internal/admin query
 * surface with no auth), this route is Bearer-authenticated and refuses to
 * return anything the caller isn't a member of.
 */
export async function orgActivityRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/activity
   * Query params: limit, offset, actor (userId — narrows to one member's
   * own trail, e.g. the Workforce Directory's "what have they accessed"
   * panel; still scoped to entityId: id first so an actor from a different
   * org can never be fished for here).
   */
  app.get('/:id/activity', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { limit = '50', offset = '0', actor } = req.query as { limit?: string; offset?: string; actor?: string };

    const where = {
      entityType: 'ORG' as const,
      entityId:   id,
      ...(actor ? { performedBy: actor } : {}),
    };

    const [logs, total] = await Promise.all([
      app.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take:    Math.min(parseInt(limit) || 50, 200),
        skip:    parseInt(offset) || 0,
      }),
      app.prisma.auditLog.count({ where }),
    ]);

    const actorNames = await resolveActors(app, logs.map(l => l.performedBy));
    const isFailure = (action: string) => /FAILED|DENIED|REJECTED/.test(action);

    return reply.send({
      total,
      logs: logs.map(l => ({
        id:        l.id,
        action:    l.action,
        type:      UI_TYPE[l.category] || 'Config',
        severity:  l.severity,
        status:    isFailure(l.action) ? 'Failed' : 'Success',
        actor:     actorNames.get(l.performedBy) || (l.performedBy === 'system' ? 'System' : l.performedBy),
        summary:   summarize(l.action, l.metadata),
        ipAddress: l.ipAddress,
        metadata:  l.metadata,
        timestamp: l.timestamp,
      })),
    });
  });

  /**
   * GET /organizations/:id/activity/export?format=csv
   */
  app.get('/:id/activity/export', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const logs = await app.prisma.auditLog.findMany({
      where:   { entityType: 'ORG', entityId: id },
      orderBy: { timestamp: 'desc' },
    });

    const header = ['timestamp', 'action', 'category', 'severity', 'performedBy', 'metadata'];
    const rows = logs.map(l => [
      l.timestamp.toISOString(),
      l.action,
      l.category,
      l.severity,
      l.performedBy,
      JSON.stringify(l.metadata ?? {}),
    ].map(csvEscape).join(','));
    const csv = [header.join(','), ...rows].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="ondi-org-activity.csv"');
    return reply.send(csv);
  });
}
