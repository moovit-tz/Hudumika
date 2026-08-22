// ─── eSign — saved stamps ───────────────────────────────────────────────────
// Prefix: /v1/sign (registered alongside sign.routes.ts, same /v1/sign
// prefix, split into its own file so the already-large sign.routes.ts
// doesn't keep growing with an unrelated concern).
//
// Two kinds of saved stamp, one table (sign_stamps, migration 277):
//   - The tenant's own company stamp — one per tenant, managed from
//     Settings ▸ E-Sign (Settings.tsx's EsignSection).
//   - A person's own personal signature/stamp — any number, managed from
//     their own NexusHR profile (StaffDetail.tsx's Signature tab); a
//     read-only view of someone else's lives at GET /v1/hr/staff/:id/signature.
//
// Access-level gating on *applying* a stamp (M5) and the generic cross-app
// apply endpoint (M6) are separate, later additions on top of this CRUD.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}
function userId(req: FastifyRequest): string {
  return (req.user as { sub: string }).sub;
}

function isValidImageDataUrl(s: unknown): s is string {
  return typeof s === 'string' && /^data:image\/(png|jpe?g);base64,/.test(s);
}

export async function signStampsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('sign'));

  // ── Tenant (company) stamp — one slot per tenant ───────────────────────────
  fastify.get('/stamps/tenant', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const stamp = await trx.selectFrom('sign_stamps').selectAll()
        .where('tenant_id', '=', tid).where('owner_type', '=', 'tenant').executeTakeFirst();
      return reply.send(stamp ?? null);
    });
  });

  fastify.put('/stamps/tenant', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as { image_data?: string; label?: string };
    if (!isValidImageDataUrl(body.image_data)) {
      return reply.status(400).send({ error: 'A real signature/stamp image is required' });
    }
    return withTenant(tid, async (trx) => {
      const existing = await trx.selectFrom('sign_stamps').select('id')
        .where('tenant_id', '=', tid).where('owner_type', '=', 'tenant').executeTakeFirst();
      const row = existing
        ? await trx.updateTable('sign_stamps').set({ image_data: body.image_data!, label: body.label ?? null })
            .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('sign_stamps').values({
            tenant_id: tid, owner_type: 'tenant', owner_user_id: null,
            image_data: body.image_data!, label: body.label ?? null, created_by: uid,
          }).returningAll().executeTakeFirstOrThrow();
      return reply.send(row);
    });
  });

  fastify.delete('/stamps/tenant', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      await trx.deleteFrom('sign_stamps').where('tenant_id', '=', tid).where('owner_type', '=', 'tenant').execute();
      return reply.send({ ok: true });
    });
  });

  // ── Personal stamps — any number, self-managed ─────────────────────────────
  fastify.get('/stamps/mine', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    return withTenant(tid, async (trx) => {
      const stamps = await trx.selectFrom('sign_stamps').selectAll()
        .where('tenant_id', '=', tid).where('owner_type', '=', 'user').where('owner_user_id', '=', uid)
        .orderBy('created_at', 'desc').execute();
      return reply.send(stamps);
    });
  });

  fastify.post('/stamps/mine', async (req: FastifyRequest, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    const body = req.body as { image_data?: string; label?: string };
    if (!isValidImageDataUrl(body.image_data)) {
      return reply.status(400).send({ error: 'A real signature/stamp image is required' });
    }
    return withTenant(tid, async (trx) => {
      const row = await trx.insertInto('sign_stamps').values({
        tenant_id: tid, owner_type: 'user', owner_user_id: uid,
        image_data: body.image_data!, label: body.label ?? null, created_by: uid,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  fastify.delete('/stamps/mine/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    const uid = userId(req);
    return withTenant(tid, async (trx) => {
      const result = await trx.deleteFrom('sign_stamps')
        .where('id', '=', req.params.id).where('tenant_id', '=', tid)
        .where('owner_type', '=', 'user').where('owner_user_id', '=', uid)
        .executeTakeFirst();
      if (!result.numDeletedRows) return reply.status(404).send({ error: 'Stamp not found' });
      return reply.send({ ok: true });
    });
  });
}
