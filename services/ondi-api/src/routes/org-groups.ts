import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';

/**
 * Group-based access assignment — static membership only (MVP). A group
 * carries zero or more Roles; every member of the group inherits every
 * attached Role's permissions (merged in lib/org-auth.ts's requireMember).
 * Rule-based/dynamic membership (e.g. Entra's "dynamic groups" evaluated
 * from user attributes) is a documented follow-up, not built here.
 */
export async function orgGroupRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/access/groups
   */
  app.get('/:id/access/groups', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const groups = await app.prisma.group.findMany({
      where: { organizationId: id },
      include: { members: true, roles: { include: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: g.members.length,
        roles: g.roles.map(r => ({ id: r.role.id, name: r.role.name })),
        createdAt: g.createdAt,
      })),
    });
  });

  /**
   * POST /organizations/:id/access/groups
   * Requires org:manage_roles. Body: { name, description? }
   */
  app.post('/:id/access/groups', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) return reply.code(400).send({ error: 'missing_fields' });

    const existing = await app.prisma.group.findUnique({ where: { organizationId_name: { organizationId: id, name: name.trim() } } });
    if (existing) return reply.code(409).send({ error: 'group_name_already_used' });

    const group = await app.prisma.group.create({
      data: { organizationId: id, name: name.trim(), description: description?.trim() || null },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'group_created', groupId: group.id, name: group.name }, severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send({ id: group.id, name: group.name, description: group.description });
  });

  /**
   * PATCH /organizations/:id/access/groups/:groupId
   */
  app.patch('/:id/access/groups/:groupId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, groupId } = req.params as { id: string; groupId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const group = await app.prisma.group.findFirst({ where: { id: groupId, organizationId: id } });
    if (!group) return reply.code(404).send({ error: 'group_not_found' });

    const { name, description } = req.body as { name?: string; description?: string };
    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) return reply.code(400).send({ error: 'invalid_name' });
      data.name = name.trim();
    }
    if (description !== undefined) data.description = description?.trim() || null;
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'no_fields_to_update' });

    await app.prisma.group.update({ where: { id: groupId }, data });
    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/access/groups/:groupId
   */
  app.delete('/:id/access/groups/:groupId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, groupId } = req.params as { id: string; groupId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const group = await app.prisma.group.findFirst({ where: { id: groupId, organizationId: id } });
    if (!group) return reply.code(404).send({ error: 'group_not_found' });

    await app.prisma.group.delete({ where: { id: groupId } }); // cascades GroupMember/GroupRole

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'group_deleted', groupId, name: group.name }, severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ removed: true });
  });

  /**
   * POST /organizations/:id/access/groups/:groupId/members/:memberId
   * Adds an existing org member to the group.
   */
  app.post('/:id/access/groups/:groupId/members/:memberId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, groupId, memberId } = req.params as { id: string; groupId: string; memberId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const group = await app.prisma.group.findFirst({ where: { id: groupId, organizationId: id } });
    if (!group) return reply.code(404).send({ error: 'group_not_found' });

    const isMember = await app.prisma.userRole.findFirst({ where: { userId: memberId, organizationId: id } });
    if (!isMember) return reply.code(404).send({ error: 'user_not_a_member_of_org' });

    const existing = await app.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: memberId } } });
    if (existing) return reply.code(409).send({ error: 'already_in_group' });

    await app.prisma.groupMember.create({ data: { groupId, userId: memberId } });
    return reply.code(201).send({ added: true });
  });

  /**
   * DELETE /organizations/:id/access/groups/:groupId/members/:memberId
   */
  app.delete('/:id/access/groups/:groupId/members/:memberId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, groupId, memberId } = req.params as { id: string; groupId: string; memberId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const group = await app.prisma.group.findFirst({ where: { id: groupId, organizationId: id } });
    if (!group) return reply.code(404).send({ error: 'group_not_found' });

    await app.prisma.groupMember.deleteMany({ where: { groupId, userId: memberId } });
    return reply.send({ removed: true });
  });

  /**
   * POST /organizations/:id/access/groups/:groupId/roles/:roleId
   * Attaches a role (system default or this org's own custom role) to the group.
   */
  app.post('/:id/access/groups/:groupId/roles/:roleId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, groupId, roleId } = req.params as { id: string; groupId: string; roleId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const group = await app.prisma.group.findFirst({ where: { id: groupId, organizationId: id } });
    if (!group) return reply.code(404).send({ error: 'group_not_found' });

    const role = await app.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || (role.organizationId !== null && role.organizationId !== id))
      return reply.code(400).send({ error: 'invalid_role' });

    // Optional delegated-admin scope: this group's members get the role's
    // permissions, but constrained to apply only within scopeGroupId (which
    // may be a different group than the one being granted the role — see
    // lib/org-auth.ts's hasPermission). null/omitted = org-wide, today's
    // only behavior until now.
    const { scopeGroupId } = req.body as { scopeGroupId?: string | null };
    if (scopeGroupId) {
      const scopeGroup = await app.prisma.group.findFirst({ where: { id: scopeGroupId, organizationId: id } });
      if (!scopeGroup) return reply.code(400).send({ error: 'invalid_scope_group' });
    }

    const existing = await app.prisma.groupRole.findUnique({ where: { groupId_roleId: { groupId, roleId } } });
    if (existing) return reply.code(409).send({ error: 'role_already_attached' });

    await app.prisma.groupRole.create({ data: { groupId, roleId, scopeGroupId: scopeGroupId || null } });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
      performedBy: userId, metadata: { action: 'group_role_attached', groupId, roleId, roleName: role.name, scopeGroupId: scopeGroupId || null }, severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send({ attached: true });
  });

  /**
   * DELETE /organizations/:id/access/groups/:groupId/roles/:roleId
   */
  app.delete('/:id/access/groups/:groupId/roles/:roleId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, groupId, roleId } = req.params as { id: string; groupId: string; roleId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_roles')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const group = await app.prisma.group.findFirst({ where: { id: groupId, organizationId: id } });
    if (!group) return reply.code(404).send({ error: 'group_not_found' });

    await app.prisma.groupRole.deleteMany({ where: { groupId, roleId } });
    return reply.send({ removed: true });
  });
}
