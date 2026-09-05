// ─── SuperAdmin — real platform document-signing certificate ──────────────────
// Prefix: /v1/superadmin (registered alongside superadmin.routes.ts).
// The connection point for replacing pdf-signing-identity.service.ts's
// honest self-signed default with a real, purchased CA-issued certificate —
// see platform-signing-cert.service.ts's own header for the full reasoning.
// Platform-wide, not tenant-scoped, so this lives here rather than under any
// per-tenant Settings page.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { dbPlatform } from '../db/client.js';
import { PlatformAdminService } from '../services/platform-admin.service.js';
import {
  parseP12, verifyRoundTrip, encryptP12, InvalidCertificateError,
} from '../services/platform-signing-cert.service.js';

export async function superAdminSigningCertRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  const actor = (req: FastifyRequest) => ({
    actorUserId: (req.user as { sub?: string; id?: string })?.sub ?? (req.user as { id?: string })?.id ?? null,
    actorName: (req.user as { name?: string; email?: string })?.name || (req.user as { email?: string })?.email || 'Unknown superadmin',
  });

  // GET /v1/superadmin/signing-cert — active identity + upload history.
  fastify.get('/signing-cert', async (_req: FastifyRequest, reply: FastifyReply) => {
    const rows = await dbPlatform.selectFrom('platform_signing_identities')
      .select(['id', 'label', 'subject', 'issuer', 'is_self_signed', 'not_before', 'not_after', 'verified_at', 'enabled', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute();
    const active = rows.find(r => r.enabled) ?? null;
    return reply.send({ active, history: rows });
  });

  // POST /v1/superadmin/signing-cert/upload — parses, verifies (a real
  // sign-and-independently-verify round trip, not just "the file parsed"),
  // and stores the certificate. Never activates it — that's a separate,
  // deliberate step (activate below), since this swaps every tenant's
  // future document signatures at once.
  fastify.post('/signing-cert/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No certificate file uploaded' });

    // Fields sent before the file part in the client's FormData are
    // reliably on data.fields (the established quirk documents.routes.ts's
    // own upload route already documents) — deliberately not a query param
    // fallback here, unlike that route's plain identifiers: this field is a
    // real password, and query strings land in server access logs.
    const password = (data.fields as Record<string, { value?: string }>).password?.value;
    const label = (data.fields as Record<string, { value?: string }>).label?.value?.trim() || 'Uploaded certificate';
    if (!password) return reply.status(400).send({ error: 'Certificate password is required' });

    const buffer = await data.toBuffer();

    let parsed;
    try {
      parsed = await parseP12(buffer, password);
    } catch (err) {
      if (err instanceof InvalidCertificateError) return reply.status(400).send({ error: err.message });
      return reply.status(400).send({ error: 'Could not read this certificate file.' });
    }

    try {
      await verifyRoundTrip(buffer, password);
    } catch (err) {
      if (err instanceof InvalidCertificateError) return reply.status(400).send({ error: err.message });
      return reply.status(400).send({ error: 'Verification failed — this certificate could not sign and verify a test document.' });
    }

    const uid = (req.user as { sub?: string; id?: string })?.sub ?? (req.user as { id?: string })?.id;
    const row = await dbPlatform.insertInto('platform_signing_identities').values({
      label,
      encrypted_p12: encryptP12(buffer, password),
      subject: parsed.info.subject,
      issuer: parsed.info.issuer,
      is_self_signed: parsed.info.isSelfSigned,
      not_before: parsed.info.notBefore,
      not_after: parsed.info.notAfter,
      verified_at: new Date(),
      uploaded_by: uid!,
    }).returningAll().executeTakeFirstOrThrow();

    await PlatformAdminService.recordActivity({
      ...actor(req), category: 'system',
      action: `Uploaded and verified a signing certificate: ${label}`,
      targetType: 'platform_signing_identity', targetId: row.id, targetName: label, tenantId: null,
    });

    return reply.status(201).send(row);
  });

  // POST /v1/superadmin/signing-cert/:id/activate — makes this the live
  // platform signing identity. Deliberately separate from upload — a
  // hard-to-reverse, shared-system action (every tenant's documents going
  // forward), so it gets its own explicit confirmation.
  fastify.post('/signing-cert/:id/activate', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const target = await dbPlatform.selectFrom('platform_signing_identities').selectAll()
      .where('id', '=', req.params.id).executeTakeFirst();
    if (!target) return reply.status(404).send({ error: 'Certificate not found' });
    if (!target.verified_at) return reply.status(400).send({ error: 'This certificate has not passed verification' });
    if (target.not_after.getTime() < Date.now()) return reply.status(400).send({ error: 'This certificate has expired' });

    await dbPlatform.transaction().execute(async trx => {
      await trx.updateTable('platform_signing_identities').set({ enabled: false }).where('enabled', '=', true).execute();
      await trx.updateTable('platform_signing_identities').set({ enabled: true }).where('id', '=', req.params.id).execute();
    });

    await PlatformAdminService.recordActivity({
      ...actor(req), category: 'system',
      action: `Activated signing certificate: ${target.label} (${target.subject})`,
      targetType: 'platform_signing_identity', targetId: target.id, targetName: target.label, tenantId: null,
    });

    return reply.send({ ok: true });
  });

  // DELETE /v1/superadmin/signing-cert/:id — refuses on the active identity;
  // must be deactivated (another one activated, or none) first.
  fastify.delete('/signing-cert/:id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const target = await dbPlatform.selectFrom('platform_signing_identities').select(['id', 'enabled', 'label'])
      .where('id', '=', req.params.id).executeTakeFirst();
    if (!target) return reply.status(404).send({ error: 'Certificate not found' });
    if (target.enabled) return reply.status(400).send({ error: 'Cannot delete the active certificate — activate a different one first' });

    await dbPlatform.deleteFrom('platform_signing_identities').where('id', '=', req.params.id).execute();
    await PlatformAdminService.recordActivity({
      ...actor(req), category: 'system',
      action: `Deleted signing certificate: ${target.label}`,
      targetType: 'platform_signing_identity', targetId: req.params.id, targetName: target.label, tenantId: null,
    });
    return reply.send({ ok: true });
  });
}
