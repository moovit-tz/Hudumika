// ─── eSign — AI assistance (Phase S8) ───────────────────────────────────────
// Prefix: /v1/sign. Its own file for the same reason sign-matters.routes.ts/
// sign-jurisdiction.routes.ts already are — self-contained, out of
// sign.routes.ts's own much larger active edit surface.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { analyzeDocumentForSigningAssist } from '../services/sign-ai-assist.service.js';
import { canCustomerAccessFile } from './files.routes.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';

function tenantId(req: FastifyRequest): string {
  return (req.user as { tenant_id: string }).tenant_id;
}
function reqUser(req: FastifyRequest): { sub: string; tenant_id: string; role: string; email?: string } {
  return req.user as { sub: string; tenant_id: string; role: string; email?: string };
}

export async function signAiAssistRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // Production-readiness audit HUD-0024/0031: this file had no entitlement
  // check at all.
  fastify.addHook('preHandler', requireEntitlement('sign'));

  // ── Analyze a document (either a fresh upload or an existing Drive/
  // envelope file) for missing fields + witness/notary blocks. ────────────
  fastify.post('/ai-assist/analyze', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { file_id?: string; document_data?: string };
    const user = reqUser(req);
    const tid = tenantId(req);

    let base64: string;
    let mediaType: string;

    if (body.document_data) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(body.document_data);
      if (!match) return reply.status(400).send({ error: 'document_data must be a base64 data URI' });
      mediaType = match[1];
      base64 = match[2];
    } else if (body.file_id) {
      const file = await withTenant(tid, async (trx) => {
        const row = await trx.selectFrom('cloud_files')
          .select(['id', 'storage_key', 'mime_type', 'entity_type', 'entity_id'])
          .where('id', '=', body.file_id!).where('tenant_id', '=', tid).executeTakeFirst();
        if (!row) return null;
        // Drive itself draws no staff-vs-staff line — any tenant member with
        // 'cloud' entitlement can already read any tenant file (see GET /:id/
        // download in files.routes.ts). The one real boundary is CUSTOMER
        // accounts, who Drive narrowly scopes to their own linked files —
        // this used to skip that check entirely, so a CUSTOMER JWT with
        // 'sign' entitlement could point this at any staff-only file by id.
        if (user.role === 'CUSTOMER') {
          const cid = await resolveCustomerId(user);
          if (!(await canCustomerAccessFile(trx, tid, cid, row))) return undefined;
        }
        return row;
      });
      if (!file?.storage_key) return reply.status(404).send({ error: 'File not found' });
      const buf = await MinioIntegration.readFile(file.storage_key);
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
