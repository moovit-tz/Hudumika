// ─── eSign — draft document edit history ───────────────────────────────────
// Prefix: /v1/sign (registered alongside sign.routes.ts). A real "Google-
// Docs-style" version list + revert for a still-DRAFT envelope's working
// document — distinct from sign_envelopes.previous_version_id/version_number
// (migration 342), which links whole separate envelopes created by amending
// an already-COMPLETED (signed) document. This is a lighter-weight snapshot
// list of document_data itself, taken each time a real content change is
// saved while still editing, so an in-progress edit (Organize Pages, any
// PDF Tool, a fresh re-upload) can be reviewed and reverted before sending.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { withTenant } from '../db/client.js';

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}
function userId(req: FastifyRequest): string {
  return (req.user as { sub: string }).sub;
}
function userName(req: FastifyRequest): string {
  return (req.user as { name?: string }).name ?? 'Unknown';
}

export async function signVersionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── List versions (newest first) — document_data omitted from the list
  // response (can be large; a version's own thumbnail/diff is fetched by id
  // when actually opened) ──────────────────────────────────────────────────
  fastify.get('/envelopes/:id/versions', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').select('id')
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });

      const versions = await trx.selectFrom('sign_document_versions')
        .select(['id', 'version_number', 'file_name', 'change_summary', 'change_details', 'created_by', 'created_by_name', 'created_at'])
        .where('envelope_id', '=', req.params.id).where('tenant_id', '=', tid)
        .orderBy('version_number', 'desc').execute();
      return { data: versions };
    });
  });

  // ── Fetch one version's full document_data (for rendering/diffing) ─────────
  fastify.get('/envelopes/:id/versions/:versionId', async (req: FastifyRequest<{ Params: { id: string; versionId: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const version = await trx.selectFrom('sign_document_versions').selectAll()
        .where('id', '=', req.params.versionId).where('envelope_id', '=', req.params.id).where('tenant_id', '=', tid)
        .executeTakeFirst();
      if (!version) return reply.status(404).send({ error: 'Version not found' });
      return { data: version };
    });
  });

  // ── Revert to a prior version — sets the envelope's current document_data
  // back to that snapshot, AND records the revert itself as a new version
  // (matching Google Docs: restoring never deletes history, it adds to it) ──
  fastify.post('/envelopes/:id/versions/:versionId/restore', async (req: FastifyRequest<{ Params: { id: string; versionId: string } }>, reply: FastifyReply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });
      if (envelope.status !== 'draft') return reply.status(409).send({ error: 'Only a draft envelope\'s document can be reverted' });

      const target = await trx.selectFrom('sign_document_versions').selectAll()
        .where('id', '=', req.params.versionId).where('envelope_id', '=', req.params.id).where('tenant_id', '=', tid)
        .executeTakeFirst();
      if (!target) return reply.status(404).send({ error: 'Version not found' });

      await trx.updateTable('sign_envelopes').set({
        document_data: target.document_data,
        file_name: target.file_name ?? envelope.file_name,
      }).where('id', '=', req.params.id).execute();

      const latest = await trx.selectFrom('sign_document_versions').select('version_number')
        .where('envelope_id', '=', req.params.id).where('tenant_id', '=', tid)
        .orderBy('version_number', 'desc').executeTakeFirst();
      const nextVersion = (latest?.version_number ?? 0) + 1;

      const [row] = await trx.insertInto('sign_document_versions').values({
        id: crypto.randomUUID(), tenant_id: tid, envelope_id: req.params.id, version_number: nextVersion,
        document_data: target.document_data, file_name: target.file_name,
        change_summary: `Restored to version ${target.version_number}`,
        change_details: JSON.stringify({ tool: 'restore', restoredVersionNumber: target.version_number }),
        created_by: userId(req), created_by_name: userName(req),
      }).returningAll().execute();

      return { data: { envelope: { document_data: target.document_data, file_name: target.file_name ?? envelope.file_name }, version: row } };
    });
  });
}

/** Called from sign.routes.ts's PUT /envelopes/:id whenever the saved
 *  document_data actually changed — creates the next version snapshot.
 *  Exported rather than duplicated so both places share one real sequence-
 *  number/insert path. changeSummary/changeDetails come from the frontend
 *  (SignEditor.tsx tracks which tool just ran); falls back to a generic
 *  label so a version is never silently skipped for lack of a description. */
export async function recordDocumentVersion(
  trx: any, tenantId: string, envelopeId: string, documentData: string, fileName: string | null,
  actorId: string, actorName: string, changeSummary?: string, changeDetails?: unknown,
): Promise<void> {
  const latest = await trx.selectFrom('sign_document_versions').select('version_number')
    .where('envelope_id', '=', envelopeId).where('tenant_id', '=', tenantId)
    .orderBy('version_number', 'desc').executeTakeFirst();
  const nextVersion = (latest?.version_number ?? 0) + 1;
  await trx.insertInto('sign_document_versions').values({
    id: crypto.randomUUID(), tenant_id: tenantId, envelope_id: envelopeId, version_number: nextVersion,
    document_data: documentData, file_name: fileName,
    change_summary: changeSummary?.trim() || (nextVersion === 1 ? 'Document uploaded' : 'Document edited'),
    change_details: changeDetails ? JSON.stringify(changeDetails) : null,
    created_by: actorId, created_by_name: actorName,
  }).execute();
}
