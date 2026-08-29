import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, assertOrgSecurityPolicy } from '../lib/org-auth.js';

function classifyDeviceType(userAgent: string | null | undefined): string {
  const ua = (userAgent || '').toLowerCase();
  if (/iphone|android.*mobile/.test(ua)) return 'Mobile';
  if (/ipad|tablet/.test(ua)) return 'Tablet';
  if (/macintosh|windows|linux/.test(ua)) return 'Desktop';
  return 'Unknown';
}

function riskFor(device: { isTrusted: boolean; isLocked: boolean }): 'Low' | 'Medium' | 'High' {
  if (device.isLocked) return 'High';
  if (!device.isTrusted) return 'Medium';
  return 'Low';
}

function statusFor(device: { isTrusted: boolean; isLocked: boolean }): 'Trusted' | 'Review' | 'Blocked' {
  if (device.isLocked) return 'Blocked';
  if (!device.isTrusted) return 'Review';
  return 'Trusted';
}

/**
 * Org-scoped device inventory — real Device rows for every current member,
 * not a fabricated MDM feed. There's no separate "org asset" concept in the
 * schema, so this is genuinely the same Device data the personal dashboard
 * shows, just aggregated across the org's roster.
 */
export async function orgAssetsRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/assets
   */
  app.get('/:id/assets', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const members = await app.prisma.userRole.findMany({
      where: { organizationId: id },
      select: { userId: true, user: { select: { firstName: true, lastName: true, ondi: true } } },
    });
    const nameByUserId = new Map(members.map(m => [m.userId, [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.ondi]));

    const devices = await app.prisma.device.findMany({
      where: { userId: { in: members.map(m => m.userId) } },
      orderBy: { lastUsedAt: 'desc' },
    });

    const assets = devices.map(d => ({
      id:       d.id,
      name:     d.deviceName || 'Unnamed device',
      type:     classifyDeviceType(d.userAgent),
      user:     nameByUserId.get(d.userId) || 'Unknown',
      os:       d.userAgent || 'Unknown',
      location: d.location,
      lastSeen: d.lastUsedAt,
      risk:     riskFor(d),
      status:   statusFor(d),
    }));

    return reply.send({
      summary: {
        total:   assets.length,
        trusted: assets.filter(a => a.status === 'Trusted').length,
        review:  assets.filter(a => a.status === 'Review').length,
        blocked: assets.filter(a => a.status === 'Blocked').length,
      },
      assets,
    });
  });
}
