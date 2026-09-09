// ─── eSign — AI assistance (Phase S8) ───────────────────────────────────────
// Prefix: /v1/sign. Its own file for the same reason sign-matters.routes.ts/
// sign-jurisdiction.routes.ts already are — self-contained, out of
// sign.routes.ts's own much larger active edit surface.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { analyzeDocumentForSigningAssist } from '../services/sign-ai-assist.service.js';

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}

export async function signAiAssistRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── Analyze a document (either a fresh upload or an existing Drive/
  // envelope file) for missing fields + witness/notary blocks. ────────────
  fastify.post('/ai-assist/analyze', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { file_id?: string; document_data?: string };
    const tid = tenantId(req);

    let base64: string;
    let mediaType: string;

    if (body.document_data) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(body.document_data);
      if (!match) return reply.status(400).send({ error: 'document_data must be a base64 data URI' });
      mediaType = match[1];
      base64 = match[2];
    } else if (body.file_id) {
      const file = await withTenant(tid, trx =>
        trx.selectFrom('cloud_files').select(['storage_key', 'mime_type'])
          .where('id', '=', body.file_id!).where('tenant_id', '=', tid).executeTakeFirst());
      if (!file?.storage_key) return reply.status(404).send({ error: 'File not found' });
      const buf = MinioIntegration.readFile(file.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found in storage' });
      mediaType = file.mime_type || 'application/pdf';
      base64 = buf.toString('base64');
    } else {
      return reply.status(400).send({ error: 'file_id or document_data is required' });
    }

    const result = await analyzeDocumentForSigningAssist(base64, mediaType);
    return result;
  });
}
