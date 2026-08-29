import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy, ALL_ORG_PERMISSIONS } from '../lib/org-auth.js';

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

export async function orgAccessRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/access/roles
   * Every role usable in this org — the 3 shared system defaults plus any
   * custom roles this org has created — with real member counts. Queried
   * from Role directly (not derived from UserRole) so a freshly-created
   * custom role with zero members assigned yet still appears.
   */
  app.get('/:id/access/roles', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const [roles, memberships] = await Promise.all([
      app.prisma.role.findMany({ where: { OR: [{ organizationId: null }, { organizationId: id }] } }),
      app.prisma.userRole.findMany({ where: { organizationId: id }, select: { roleId: true } }),
    ]);

    const countByRoleId = new Map<string, number>();
    for (const m of memberships) countByRoleId.set(m.roleId, (countByRoleId.get(m.roleId) ?? 0) + 1);

    return reply.send({
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        permissions: r.permissions,
        users: countByRoleId.get(r.id) ?? 0,
        isSystem: r.organizationId === null,
      })),
    });
  });

  /**
   * POST /organizations/:id/access/roles
   * Requires org:manage_roles. Creates a custom role scoped to this org.
   * Body: { name, permissions: OrgPermission[] }
   */
  app.post('/:id/access/roles', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, permissions } = req.body as { name?: string; permissions?: string[] };
    if (!name?.trim() || !Array.isArray(permissions) || permissions.length === 0)
      return reply.code(400).send({ error: 'missing_fields' });

    const invalid = permissions.filter(p => !ALL_ORG_PERMISSIONS.includes(p as any));
    if (invalid.length > 0)
      return reply.code(400).send({ error: 'invalid_permissions', invalid });

    const existing = await app.prisma.role.findUnique({ where: { organizationId_name: { organizationId: id, name: name.trim() } } });
    if (existing) return reply.code(409).send({ error: 'role_name_already_used' });

    const role = await app.prisma.role.create({
      data: { organizationId: id, name: name.trim(), permissions },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'custom_role_created', roleId: role.id, name: role.name, permissions }, severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send({ id: role.id, name: role.name, permissions: role.permissions });
  });

  /**
   * PATCH /organizations/:id/access/roles/:roleId
   * Requires org:manage_roles. Only this org's own custom roles are editable —
   * system defaults (organizationId: null) and other orgs' roles are 403'd.
   */
  app.patch('/:id/access/roles/:roleId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, roleId } = req.params as { id: string; roleId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const role = await app.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.code(404).send({ error: 'role_not_found' });
    if (role.organizationId !== id) return reply.code(403).send({ error: 'not_a_custom_role_of_this_org' });

    const { name, permissions } = req.body as { name?: string; permissions?: string[] };
    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) return reply.code(400).send({ error: 'invalid_name' });
      data.name = name.trim();
    }
    if (permissions !== undefined) {
      const invalid = permissions.filter(p => !ALL_ORG_PERMISSIONS.includes(p as any));
      if (invalid.length > 0) return reply.code(400).send({ error: 'invalid_permissions', invalid });
      data.permissions = permissions;
    }
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'no_fields_to_update' });

    await app.prisma.role.update({ where: { id: roleId }, data });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'custom_role_updated', roleId, changes: data }, severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/access/roles/:roleId
   * Requires org:manage_roles. Refuses if any member or group still holds it.
   */
  app.delete('/:id/access/roles/:roleId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, roleId } = req.params as { id: string; roleId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const role = await app.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.code(404).send({ error: 'role_not_found' });
    if (role.organizationId !== id) return reply.code(403).send({ error: 'not_a_custom_role_of_this_org' });

    const [memberCount, groupCount] = await Promise.all([
      app.prisma.userRole.count({ where: { roleId } }),
      app.prisma.groupRole.count({ where: { roleId } }),
    ]);
    if (memberCount > 0 || groupCount > 0)
      return reply.code(409).send({ error: 'role_still_in_use', memberCount, groupCount });

    await app.prisma.role.delete({ where: { id: roleId } });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'custom_role_deleted', roleId, name: role.name }, severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ removed: true });
  });

  /**
   * GET /organizations/:id/access/requests?status=PENDING
   */
  app.get('/:id/access/requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { status } = req.query as { status?: string };

    const requests = await app.prisma.accessRequest.findMany({
      where: { organizationId: id, ...(status ? { status: status as any } : {}) },
      include: { requestedBy: { select: { firstName: true, lastName: true, ondi: true } }, role: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return reply.send({
      requests: requests.map(r => ({
        id:         r.id,
        user:       [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(' ') || r.requestedBy.ondi,
        role:       r.role?.name ?? null,
        resource:   r.resource,
        urgency:    r.urgency,
        status:     r.status,
        requested:  timeAgo(r.createdAt),
        createdAt:  r.createdAt,
      })),
    });
  });

  /**
   * POST /organizations/:id/access/requests
   * Any member can request access to a resource.
   * Body: { resource, roleName?, urgency? }
   */
  app.post('/:id/access/requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { resource, roleName, urgency } = req.body as { resource?: string; roleName?: string; urgency?: string };
    if (!resource) return reply.code(400).send({ error: 'missing_fields' });

    const role = roleName ? await app.prisma.role.findFirst({ where: { name: roleName, OR: [{ organizationId: null }, { organizationId: id }] } }) : null;

    const request = await app.prisma.accessRequest.create({
      data: {
        organizationId: id,
        requestedById: userId,
        resource,
        roleId: role?.id,
        urgency: (urgency as any) || 'LOW',
      },
    });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     id,
      action:       'ACCESS_REQUESTED',
      category:     'ACCESS',
      performedBy:  userId,
      metadata:     { requestId: request.id, resource },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.code(201).send({ id: request.id });
  });

  /**
   * PATCH /organizations/:id/access/requests/:requestId
   * Owner/Admin-only. Body: { status: 'APPROVED' | 'DENIED' }
   */
  app.patch('/:id/access/requests/:requestId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, requestId } = req.params as { id: string; requestId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_access')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { status } = req.body as { status?: string };
    if (status !== 'APPROVED' && status !== 'DENIED')
      return reply.code(400).send({ error: 'invalid_status' });

    const request = await app.prisma.accessRequest.findFirst({ where: { id: requestId, organizationId: id } });
    if (!request) return reply.code(404).send({ error: 'request_not_found' });
    if (request.status !== 'PENDING') return reply.code(409).send({ error: 'already_resolved' });

    await app.prisma.accessRequest.update({
      where: { id: requestId },
      data: { status, resolvedBy: userId, resolvedAt: new Date() },
    });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     id,
      action:       status === 'APPROVED' ? 'ACCESS_GRANTED' : 'ACCESS_DENIED',
      category:     'ACCESS',
      performedBy:  userId,
      metadata:     { requestId, resource: request.resource },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ updated: true });
  });
}
