import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { DRIVE_ROLES, type DriveMemberRole, resolveDriveAccess, requireDriveAdminOverride } from '../lib/cloud-drive-access.js';

export async function drivesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('cloud'));
  // A CUSTOMER login has no drive of its own (its uploads land in the
  // tenant's Business Records drive server-side, see files.routes.ts POST
  // /upload) and has no legitimate reason to list, create, rename, delete,
  // or manage members of the tenant's drives — every route in this file is
  // staff-only.
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
  });

  // GET /?admin=1 — list every drive this user can actually see: their own
  // personal drive (created here on first call if it doesn't exist yet —
  // migration 498 already backfilled one for every pre-existing user, this
  // covers anyone created after), every tenant-wide Business Records drive,
  // and any shared drive they own or are a real member of. This is the fix
  // for the isolation gap: previously every drive in the tenant came back
  // to everyone, personal or not.
  //
  // ?admin=1 is the explicit administrator override — SUPER_ADMIN/
  // TENANT_ADMIN only, audited (requireDriveAdminOverride), and it must be
  // asked for by name; it is never the default view for an admin.
  fastify.get('/', async (req, reply) => {
    const user = req.user;
    const wantsAdminView = (req.query as any)?.admin === '1' || (req.query as any)?.admin === 'true';
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const personal = await trx.selectFrom('cloud_drives').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('type', '=', 'personal').where('owner_id', '=', user.sub)
          .executeTakeFirst();
        if (!personal) {
          await trx.insertInto('cloud_drives').values({
            tenant_id: user.tenant_id, name: 'My Drive', type: 'personal',
            owner_name: user.name ?? 'You', owner_id: user.sub,
          }).execute();
        }

        // Business Records must exist before anyone's first automatic
        // business-record folder or CUSTOMER upload — those paths
        // (cloud-sync.service.ts's ensureDrive, files.routes.ts's
        // ensureDefaultDrive) also lazily create it, but a brand-new
        // tenant's first staff member opening Drive shouldn't see it
        // simply missing from the list until then.
        const business = await trx.selectFrom('cloud_drives').select('id')
          .where('tenant_id', '=', user.tenant_id).where('type', '=', 'business').executeTakeFirst();
        if (!business) {
          await trx.insertInto('cloud_drives').values({
            tenant_id: user.tenant_id, name: 'Business Records', type: 'business', owner_name: 'System',
          }).execute();
        }

        if (wantsAdminView) {
          const isAdmin = await requireDriveAdminOverride(trx, user.tenant_id, user.sub, user.role, user.tenant_id, 'Listed every drive in the tenant (admin view)');
          if (!isAdmin) return reply.status(403).send({ error: 'Administrator override requires SUPER_ADMIN or TENANT_ADMIN' });
          return trx.selectFrom('cloud_drives').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('created_at').execute();
        }

        const memberDriveIds = (await trx.selectFrom('cloud_drive_members').select('drive_id')
          .where('tenant_id', '=', user.tenant_id).where('principal_type', '=', 'user').where('principal_id', '=', user.sub).execute())
          .map(m => m.drive_id);

        const drives = await trx.selectFrom('cloud_drives').selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb.and([eb('type', '=', 'personal'), eb('owner_id', '=', user.sub)]),
            eb('type', '=', 'business'),
            eb.and([eb('type', '=', 'shared'), eb('owner_id', '=', user.sub)]),
            ...(memberDriveIds.length > 0 ? [eb.and([eb('type', '=', 'shared'), eb('id', 'in', memberDriveIds)])] : []),
          ]))
          .orderBy('created_at').execute();
        return drives;
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST / — create a shared drive. Personal drives are system-managed (one
  // per user, created above) and Business Records is system-managed too —
  // neither is user-creatable through this route.
  fastify.post('/', async (req, reply) => {
    const user = req.user;
    const body = req.body as { name?: string };
    if (!body.name?.trim()) return reply.status(400).send({ error: 'Drive name is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const drive = await trx.insertInto('cloud_drives').values({
          tenant_id: user.tenant_id, name: body.name!.trim(), type: 'shared',
          owner_name: user.name ?? 'You', owner_id: user.sub,
        }).returningAll().executeTakeFirstOrThrow();

        await trx.insertInto('cloud_drive_members').values({
          tenant_id: user.tenant_id, drive_id: drive.id, person_name: user.name ?? 'You', role: 'manager',
          principal_type: 'user', principal_id: user.sub,
        }).execute();
        return drive;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /:id — rename a drive. Personal/Business are only renameable via
  // an explicit admin override (Business Records' display name in
  // particular is app-referenced by name in a few older places — renaming
  // it is allowed, but logged); a shared drive needs manager-level access.
  fastify.patch('/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { name, adminOverrideReason } = req.body as { name?: string; adminOverrideReason?: string };
    if (!name?.trim()) return reply.status(400).send({ error: 'Drive name is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, id);
        let allowed = !!access?.canManage;
        if (!allowed && adminOverrideReason?.trim()) {
          allowed = await requireDriveAdminOverride(trx, user.tenant_id, user.sub, user.role, id, adminOverrideReason);
        }
        if (!allowed) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot rename this drive' : 'Drive not found' });

        const row = await trx.updateTable('cloud_drives').set({ name: name.trim(), updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirst();
        if (!row) return reply.status(404).send({ error: 'Drive not found' });
        return row;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /:id — shared drives only; Personal and Business Records are
  // system-managed and can never be deleted through this route (a tenant
  // must always keep both).
  fastify.delete('/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const drive = await trx.selectFrom('cloud_drives').select(['id', 'type'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!drive) return reply.status(404).send({ error: 'Drive not found' });
        if (drive.type !== 'shared') return reply.status(400).send({ error: 'Personal and Business Records drives cannot be deleted' });

        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, id);
        if (!access?.canManage) return reply.status(403).send({ error: 'You cannot delete this drive' });

        const files = await trx.selectFrom('cloud_files').select(['storage_key'])
          .where('drive_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
        for (const f of files) {
          if (f.storage_key) await MinioIntegration.deleteDocument(user.tenant_id, f.storage_key);
        }
        await trx.deleteFrom('cloud_drives').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
        return { ok: true };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /:id/member-candidates?q= — real tenant staff to add as a member,
  // replacing the old free-text name field. Manage access on the drive
  // required — the same people who can add members.
  fastify.get('/:id/member-candidates', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { q } = req.query as { q?: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, id);
        if (!access?.canManage) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot manage members of this drive' : 'Drive not found' });

        const term = (q ?? '').trim();
        let query = trx.selectFrom('users').select(['id', 'name', 'email'])
          .where('tenant_id', '=', user.tenant_id).where('role', '!=', 'CUSTOMER');
        if (term) query = query.where(eb => eb.or([eb('name', 'ilike', `%${term}%`), eb('email', 'ilike', `%${term}%`)]));
        return query.orderBy('name').limit(20).execute();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /:id/members — list a shared drive's members
  fastify.get('/:id/members', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, id);
        if (!access) return reply.status(404).send({ error: 'Not found' });
        return trx.selectFrom('cloud_drive_members').selectAll().where('drive_id', '=', id).orderBy('created_at').execute();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /:id/members — add (or update-if-exists) a member by real
  // principal — a real tenant staff account (picked from
  // GET /member-candidates), not a typed name. Requires manage access.
  fastify.post('/:id/members', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { principal_id, role } = req.body as { principal_id?: string; role?: DriveMemberRole };
    if (!principal_id) return reply.status(400).send({ error: 'principal_id is required — pick a real user from member-candidates' });
    const safeRole: DriveMemberRole = role && DRIVE_ROLES.includes(role) ? role : 'viewer';
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, id);
        if (!access?.canManage) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot manage members of this drive' : 'Drive not found' });

        const candidate = await trx.selectFrom('users').select(['id', 'name'])
          .where('id', '=', principal_id).where('tenant_id', '=', user.tenant_id).where('role', '!=', 'CUSTOMER')
          .executeTakeFirst();
        if (!candidate) return reply.status(400).send({ error: 'That user was not found in this workspace' });

        const row = await trx.insertInto('cloud_drive_members').values({
          tenant_id: user.tenant_id, drive_id: id, person_name: candidate.name ?? 'Unnamed', role: safeRole,
          principal_type: 'user', principal_id: candidate.id,
        }).onConflict(oc => oc.columns(['drive_id', 'person_name']).doUpdateSet({ role: safeRole, principal_type: 'user', principal_id: candidate.id }))
          .returningAll().executeTakeFirstOrThrow();
        return row;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /:id/members/:memberId — change a member's role
  fastify.patch('/:id/members/:memberId', async (req, reply) => {
    const user = req.user;
    const { id, memberId } = req.params as { id: string; memberId: string };
    const { role } = req.body as { role?: DriveMemberRole };
    if (!role || !DRIVE_ROLES.includes(role)) return reply.status(400).send({ error: 'Invalid role' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, id);
        if (!access?.canManage) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot manage members of this drive' : 'Drive not found' });
        const row = await trx.updateTable('cloud_drive_members').set({ role })
          .where('id', '=', memberId).where('drive_id', '=', id)
          .returningAll().executeTakeFirstOrThrow();
        return row;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /:id/members/:memberId — remove a member
  fastify.delete('/:id/members/:memberId', async (req, reply) => {
    const user = req.user;
    const { id, memberId } = req.params as { id: string; memberId: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, id);
        if (!access?.canManage) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot manage members of this drive' : 'Drive not found' });
        await trx.deleteFrom('cloud_drive_members').where('id', '=', memberId).where('drive_id', '=', id).execute();
        return { ok: true };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
