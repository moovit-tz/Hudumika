import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

const DRIVE_ROLES = ['manager', 'content_manager', 'contributor', 'commenter', 'viewer'] as const;
type DriveRole = typeof DRIVE_ROLES[number];

export async function drivesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('cloud'));

  // GET / — list every drive for the tenant, auto-creating the default "My Drive" if none exist yet
  fastify.get('/', async (req, reply) => {
    const user = req.user;
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        let drives = await trx.selectFrom('cloud_drives').selectAll()
          .where('tenant_id', '=', user.tenant_id).orderBy('created_at').execute();

        if (drives.length === 0) {
          await trx.insertInto('cloud_drives').values({
            tenant_id: user.tenant_id, name: 'My Drive', type: 'personal',
            owner_name: user.name ?? 'You', owner_id: user.sub,
          }).execute();
          drives = await trx.selectFrom('cloud_drives').selectAll()
            .where('tenant_id', '=', user.tenant_id).orderBy('created_at').execute();
        }
        return drives;
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST / — create a new drive (personal or shared)
  fastify.post('/', async (req, reply) => {
    const user = req.user;
    const body = req.body as { name?: string; type?: 'personal' | 'shared' };
    if (!body.name?.trim()) return reply.status(400).send({ error: 'Drive name is required' });
    const type = body.type === 'shared' ? 'shared' : 'personal';
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const drive = await trx.insertInto('cloud_drives').values({
          tenant_id: user.tenant_id, name: body.name!.trim(), type,
          owner_name: user.name ?? 'You', owner_id: user.sub,
        }).returningAll().executeTakeFirstOrThrow();

        if (type === 'shared') {
          await trx.insertInto('cloud_drive_members').values({
            drive_id: drive.id, person_name: user.name ?? 'You', role: 'manager',
          }).execute();
        }
        return drive;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /:id — rename a drive
  fastify.patch('/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return reply.status(400).send({ error: 'Drive name is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const row = await trx.updateTable('cloud_drives').set({ name: name.trim(), updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        return row;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /:id — delete a drive and everything in it (a tenant must always keep at least one drive)
  fastify.delete('/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const count = await trx.selectFrom('cloud_drives').select(({ fn }) => fn.countAll().as('n'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (Number(count?.n ?? 0) <= 1) return reply.status(400).send({ error: 'Cannot delete your only drive' });

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

  // GET /:id/members — list a shared drive's members
  fastify.get('/:id/members', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const drive = await trx.selectFrom('cloud_drives').select(['id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!drive) return reply.status(404).send({ error: 'Not found' });
        return trx.selectFrom('cloud_drive_members').selectAll().where('drive_id', '=', id).orderBy('created_at').execute();
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /:id/members — add (or update-if-exists) a member
  fastify.post('/:id/members', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { person_name, role } = req.body as { person_name?: string; role?: DriveRole };
    if (!person_name?.trim()) return reply.status(400).send({ error: 'Name is required' });
    const safeRole: DriveRole = role && DRIVE_ROLES.includes(role) ? role : 'viewer';
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const drive = await trx.selectFrom('cloud_drives').select(['id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!drive) return reply.status(404).send({ error: 'Not found' });
        const row = await trx.insertInto('cloud_drive_members').values({
          drive_id: id, person_name: person_name.trim(), role: safeRole,
        }).onConflict(oc => oc.columns(['drive_id', 'person_name']).doUpdateSet({ role: safeRole }))
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
    const { role } = req.body as { role?: DriveRole };
    if (!role || !DRIVE_ROLES.includes(role)) return reply.status(400).send({ error: 'Invalid role' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const drive = await trx.selectFrom('cloud_drives').select(['id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!drive) return reply.status(404).send({ error: 'Not found' });
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
        const drive = await trx.selectFrom('cloud_drives').select(['id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!drive) return reply.status(404).send({ error: 'Not found' });
        await trx.deleteFrom('cloud_drive_members').where('id', '=', memberId).where('drive_id', '=', id).execute();
        return { ok: true };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
